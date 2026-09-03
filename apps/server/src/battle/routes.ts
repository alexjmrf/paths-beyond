import {
  RULES_VERSION,
  buildBattleSetupFromHeroes,
  simulate,
  type BattleCommand,
  type Coord,
  type BattleSetup,
  type HeroPlacement,
  type MapAiArchetype,
} from '@paths-beyond/core';
import { toSummonBlueprintPlacements, type ContentCatalog } from '@paths-beyond/content';
import type { FastifyPluginAsync } from 'fastify';
import { computeEloUpdate } from '../matchmaking/elo.js';
import type { RateLimiter } from './rateLimit.js';
import { ownedCharacterIds, unownedAmong } from '../summon/ownership.js';
import { deriveSeed, generateNonce } from './ticket.js';
import type {
  ArenaDefenseRepository,
  CharacterOwnershipRepository,
  HeroRepository,
  PlayerRepository,
  ReplayRepository,
} from '../repository/types.js';

// §9.1 — "o defensor monta um time de até 5 heróis."
const MAX_TEAM_SIZE = 5;

// §10 — "marcas de arena" é moeda de economia de servidor, não número de balanceamento
// de combate (mesmo tratamento já dado a DEFAULT_K_FACTOR/ELO_SEARCH_RANGE em
// matchmaking/elo.ts — não vem de packages/data). Vencedor ganha mais, perdedor ganha
// menos por participar (nunca zero — perder não deveria travar o jogador fora da loja).
const ARENA_MARKS_WIN = 10;
const ARENA_MARKS_LOSS = 3;


interface SaveDefenseBody {
  readonly mapId?: string;
  readonly units?: readonly {
    readonly heroId?: string;
    readonly pos?: Coord;
    readonly height?: 0 | 1 | 2 | 3;
    readonly aiArchetype?: MapAiArchetype;
  }[];
}

interface CreateBattleBody {
  readonly attackerHeroIds?: readonly string[];
  readonly defenderPlayerId?: string;
  readonly commands?: readonly BattleCommand[];
  readonly rulesVersion?: string;
  // §9.4 — "nonce por partida": gerado pelo cliente, único por tentativa de batalha.
  // Dobra como id do replay persistido (ver ReplayRepository).
  readonly nonce?: string;
}

export interface BattleRoutesOptions {
  readonly repository: PlayerRepository;
  readonly heroRepository: HeroRepository;
  readonly arenaDefenseRepository: ArenaDefenseRepository;
  readonly replayRepository: ReplayRepository;
  readonly catalog: ContentCatalog;
  readonly rateLimiter: RateLimiter;
  // §9.4 (M13, sub-sessão 2/N) — segredo do HMAC que deriva a seed do nonce. Sem ele
  // o cliente poderia procurar um nonce que produzisse uma seed favorável.
  readonly ticketSecret: string;
  // §9.4 (M18, 3/N) — posse de personagem. Até aqui nenhuma rota perguntava se o jogador
  // possui o personagem que mandou: bastava a instância de herói ser dele.
  readonly ownershipRepository: CharacterOwnershipRepository;
}

type AssembleResult =
  | { readonly ok: true; readonly setup: BattleSetup; readonly defenderPlayerId: string }
  | { readonly ok: false; readonly code: number; readonly error: string };

// A montagem do confronto de arena: valida a posse dos heróis do atacante, carrega a
// defesa e devolve o `BattleSetup`. Extraída de `POST /battles` (M7) porque o ticket
// (M13, sub-sessão 2/N) precisa montar EXATAMENTE o mesmo setup — se as duas montagens
// divergissem, o cliente jogaria contra uma batalha e o servidor resolveria outra, que é
// o tipo de divergência que §9.1 chama de bug crítico.
async function assembleArenaBattle(
  opts: BattleRoutesOptions,
  attackerPlayerId: string,
  attackerHeroIds: readonly string[],
  defenderPlayerId: string | undefined,
): Promise<AssembleResult> {
  if (attackerHeroIds.length === 0 || attackerHeroIds.length > MAX_TEAM_SIZE) {
    return { ok: false, code: 400, error: `time precisa ter entre 1 e ${MAX_TEAM_SIZE} heróis` };
  }

  // §9.4 — "cliente envia BattleCommand[]; servidor simula." Nunca aceitamos stat/hp do
  // corpo da requisição — só ids; os heróis reais vêm sempre do HeroRepository.
  const attackerHeroes = await opts.heroRepository.getHeroesByIds(attackerHeroIds);
  const attackerOwnsAll = attackerHeroIds.every((id) =>
    attackerHeroes.some((h) => h.hero.id === id && h.ownerPlayerId === attackerPlayerId),
  );
  if (attackerHeroes.length !== attackerHeroIds.length || !attackerOwnsAll) {
    return { ok: false, code: 403, error: 'algum heroId não pertence a você' };
  }

  // §9.4 (M18, 3/N) — e o PERSONAGEM também tem de ser dele. As duas checagens são
  // diferentes e as duas fazem falta: a de cima diz que a instância de herói é sua, esta
  // diz que você adquiriu quem ela representa. Sem a segunda, um cliente adulterado que
  // conseguisse criar uma instância jogaria com alguém que nunca puxou.
  const owned = await ownedCharacterIds(opts.ownershipRepository, opts.catalog, attackerPlayerId);
  const faltando = unownedAmong(attackerHeroes, owned);
  if (faltando.length > 0) {
    return { ok: false, code: 403, error: `você não possui: ${faltando.join(', ')}` };
  }

  const defense = defenderPlayerId ? await opts.arenaDefenseRepository.getDefenseByOwner(defenderPlayerId) : null;
  if (!defense) return { ok: false, code: 404, error: 'o defensor não tem uma defesa configurada' };

  const arenaMap = opts.catalog.maps[defense.mapId];
  if (!arenaMap) return { ok: false, code: 500, error: 'mapa da defesa não existe mais no catálogo' };

  const defenderHeroes = await opts.heroRepository.getHeroesByIds(defense.units.map((u) => u.heroId));
  if (defenderHeroes.length !== defense.units.length) {
    return { ok: false, code: 500, error: 'defesa referencia herói inexistente' };
  }

  const placements: HeroPlacement[] = [];
  for (const [index, stored] of attackerHeroes.entries()) {
    const classDef = opts.catalog.classes[stored.hero.classId];
    if (!classDef) return { ok: false, code: 500, error: `classe desconhecida: ${stored.hero.classId}` };
    // Posicionamento do atacante: corte de escopo de M7 (ver DECISIONS.md) — mapas ainda
    // não têm pontos de spawn declarados; time inteiro entra pela borda esquerda, uma
    // unidade por linha.
    placements.push({
      unitId: stored.hero.id,
      hero: stored.hero,
      classDef,
      equippedItems: stored.equippedItems,
      side: 'player',
      pos: { x: 0, y: index },
      height: 0,
    });
  }

  for (const defenseUnit of defense.units) {
    const stored = defenderHeroes.find((h) => h.hero.id === defenseUnit.heroId);
    if (!stored) return { ok: false, code: 500, error: `defesa referencia herói inexistente: ${defenseUnit.heroId}` };
    const classDef = opts.catalog.classes[stored.hero.classId];
    if (!classDef) return { ok: false, code: 500, error: `classe desconhecida: ${stored.hero.classId}` };
    placements.push({
      unitId: stored.hero.id,
      hero: stored.hero,
      classDef,
      equippedItems: stored.equippedItems,
      side: 'enemy',
      pos: defenseUnit.pos,
      height: defenseUnit.height,
      aiArchetype: defenseUnit.aiArchetype,
    });
  }

  const arenaMapDef = opts.catalog.maps[defense.mapId]!;
  return {
    ok: true,
    defenderPlayerId: defense.ownerPlayerId,
    setup: buildBattleSetupFromHeroes({
      placements,
      map: arenaMapDef.grid,
      permadeath: 'classic', // §15 (decisões em aberto) — sugestão de default da própria spec
      winCondition: arenaMapDef.winCondition,
      effectDefs: opts.catalog.effects,
      initialValor: arenaMapDef.initialValor,
      itemSets: opts.catalog.itemSets,
      skillsCatalog: opts.catalog.skills,
      weaponDuelRanges: opts.catalog.weaponDuelRanges,
      baselineReactionSkillIds: opts.catalog.baselineReactionSkillIds,
      // §8.1 (M17, 2/N) e D6 — "o servidor passa a precisar conhecer o elenco". Enquanto a
      // árvore era da classe, o `classDef` de cada placement bastava para resolver talento;
      // agora ela é do personagem, e sem este repasse a defesa da arena seria remontada com
      // zero talento — a mesma build valendo coisas diferentes nos dois lados, que é §9.1
      // ("divergência = bug crítico") acontecendo em silêncio.
      characterTalentTrees: opts.catalog.characterTalentTrees,
      valorSkills: opts.catalog.valorSkills,
      // §5.6 (M15 2/N) — o ticket de M13 2/N devolve este `setup` ao atacante, que joga com
      // ele, e `POST /battles` remonta o mesmo confronto para reexecutar. Os dois lados
      // precisam dos mesmos blueprints, senão o cliente invoca e o servidor rejeita.
      summonBlueprints: toSummonBlueprintPlacements(opts.catalog),
    }),
  };
}

// Registrado como filho do MESMO escopo que já carrega `authPlugin` (app.ts) — não chama
// `authPlugin` de novo aqui: o hook `onRequest` de um plugin `fp()`-wrapped, uma vez
// vazado pro escopo pai, já vale automaticamente pra qualquer filho registrado dentro
// dele (encapsulação flui pra baixo livremente; só o vazamento pra CIMA precisa de
// `fp()`). Ver DECISIONS.md sobre o bug de encapsulação da sub-sessão 3.
export const battleRoutes: FastifyPluginAsync<BattleRoutesOptions> = async (fastify, opts) => {
  // §9.1 (M15, sub-sessão 3/N) — o lado de LEITURA da defesa. `PUT /me/defense` existe
  // desde M7 e nunca teve par: sem esta rota o cliente sabe o que acabou de enviar e nada
  // mais, então "a defesa persiste" — metade do critério de aceite deste milestone — não
  // seria verificável pela tela, só por `curl` no banco.
  //
  // 404 quando não há defesa montada, e não um corpo vazio: "ainda não montei" é um estado
  // diferente de "montei um time sem ninguém", e a tela precisa distinguir os dois.
  fastify.get('/me/defense', async (request, reply) => {
    if (!request.player) return reply.code(401).send({ error: 'missing player token' });
    const defense = await opts.arenaDefenseRepository.getDefenseByOwner(request.player.id);
    if (!defense) return reply.code(404).send({ error: 'você ainda não montou uma defesa' });
    return defense;
  });

  fastify.put('/me/defense', async (request, reply) => {
    if (!request.player) return reply.code(401).send({ error: 'missing player token' });
    const player = request.player;

    const body = request.body as SaveDefenseBody;
    const units = body.units ?? [];

    if (units.length === 0 || units.length > MAX_TEAM_SIZE) {
      return reply.code(400).send({ error: `defesa precisa ter entre 1 e ${MAX_TEAM_SIZE} unidades` });
    }
    if (!body.mapId || !opts.catalog.maps[body.mapId]) {
      return reply.code(400).send({ error: 'mapId desconhecido' });
    }
    if (!units.every((u) => u.heroId && u.pos && u.height !== undefined && u.aiArchetype)) {
      return reply.code(400).send({ error: 'cada unidade precisa de heroId/pos/height/aiArchetype' });
    }

    const heroIds = units.map((u) => u.heroId as string);
    const heroes = await opts.heroRepository.getHeroesByIds(heroIds);
    const ownsAll = heroIds.every((id) => heroes.some((h) => h.hero.id === id && h.ownerPlayerId === player.id));
    if (heroes.length !== heroIds.length || !ownsAll) {
      return reply.code(403).send({ error: 'algum heroId não pertence a você' });
    }

    const defense = await opts.arenaDefenseRepository.saveDefense({
      ownerPlayerId: player.id,
      mapId: body.mapId,
      units: units.map((u) => ({
        heroId: u.heroId as string,
        pos: u.pos as Coord,
        height: u.height as 0 | 1 | 2 | 3,
        aiArchetype: u.aiArchetype as MapAiArchetype,
      })),
    });

    return defense;
  });

  // §9.1 (M13, sub-sessão 2/N) — "o atacante joga a camada de grid manualmente contra
  // essa defesa". Pra jogar, o cliente precisa do confronto montado e da seed ANTES de
  // mandar comando nenhum; é isso que o ticket entrega. Consome a mesma cota de rate
  // limit da batalha, porque pedir ticket é o que um grinder de seed faria em série.
  // §9.1 (M13, sub-sessão 2/N) — o roster do jogador. Sem esta rota o cliente não tem
  // como montar `attackerHeroIds`: os ids do jogador só existiam em seed de banco.
  fastify.get('/me/heroes', async (request, reply) => {
    if (!request.player) return reply.code(401).send({ error: 'missing player token' });
    const heroes = await opts.heroRepository.listHeroesByOwner(request.player.id);
    // Devolve o `Hero` inteiro (é dele mesmo) — o cliente precisa de classe e nome pra
    // montar o time; stats resolvidos continuam sendo assunto do servidor (§9.4).
    return heroes.map((stored) => ({ hero: stored.hero, equippedItems: stored.equippedItems }));
  });

  fastify.post('/battles/ticket', async (request, reply) => {
    if (!request.player) return reply.code(401).send({ error: 'missing player token' });
    const attacker = request.player;

    if (!opts.rateLimiter.tryConsume(attacker.id)) {
      return reply.code(429).send({ error: 'muitas tentativas de batalha em pouco tempo' });
    }

    const body = request.body as CreateBattleBody;
    const assembled = await assembleArenaBattle(opts, attacker.id, body.attackerHeroIds ?? [], body.defenderPlayerId);
    if (!assembled.ok) return reply.code(assembled.code).send({ error: assembled.error });

    const nonce = generateNonce();
    return {
      nonce,
      seed: deriveSeed(opts.ticketSecret, nonce),
      rulesVersion: RULES_VERSION,
      setup: assembled.setup,
      defenderPlayerId: assembled.defenderPlayerId,
    };
  });

  fastify.post('/battles', async (request, reply) => {
    if (!request.player) return reply.code(401).send({ error: 'missing player token' });
    const attacker = request.player;

    const body = request.body as CreateBattleBody;

    // §9.4 — "rate limiting": checado antes de qualquer trabalho, por jogador.
    if (!opts.rateLimiter.tryConsume(attacker.id)) {
      return reply.code(429).send({ error: 'muitas tentativas de batalha em pouco tempo' });
    }

    // §9.4 — "nonce por partida": sem nonce, ou nonce já usado, rejeita — previne reenvio
    // da mesma requisição rodar a batalha (e mexer no ELO) mais de uma vez.
    if (!body.nonce) {
      return reply.code(400).send({ error: 'nonce é obrigatório' });
    }
    if (await opts.replayRepository.getByNonce(body.nonce)) {
      return reply.code(409).send({ error: 'nonce já utilizado' });
    }

    // §9.4 — "versionamento: rulesVersion no replay; recusar replays de versão
    // diferente." Checado antes de qualquer outra coisa: uma versão de regras errada
    // invalida a requisição inteira, não só o resultado.
    if (body.rulesVersion !== RULES_VERSION) {
      return reply.code(409).send({ error: `rulesVersion incompatível (esperado ${RULES_VERSION})` });
    }

    const assembled = await assembleArenaBattle(opts, attacker.id, body.attackerHeroIds ?? [], body.defenderPlayerId);
    if (!assembled.ok) return reply.code(assembled.code).send({ error: assembled.error });
    const setup = assembled.setup;

    // A seed é DERIVADA do nonce (ver ticket.ts): o cliente que pediu um ticket jogou com
    // exatamente esta seed, e quem pula o ticket não tem como escolhê-la.
    const seed = deriveSeed(opts.ticketSecret, body.nonce);
    const result = simulate({
      rulesVersion: RULES_VERSION,
      seed,
      initialState: setup,
      commands: body.commands ?? [],
    });

    // §9.1 — "ELO, temporadas de 14 dias." §10 — "marcas de arena" ganhas em toda
    // batalha concluída (não em 'ongoing' — comandos insuficientes pra terminar o
    // engajamento não devem mexer em rating nem em moeda de ninguém).
    let elo: { attacker: number; defender: number } | undefined;
    let arenaMarks: { attacker: number; defender: number } | undefined;
    if (result.outcome !== 'ongoing') {
      const defenderPlayer = await opts.repository.getPlayerById(assembled.defenderPlayerId);
      if (defenderPlayer) {
        const winnerIsAttacker = result.outcome === 'victory';

        const update = computeEloUpdate(
          winnerIsAttacker ? attacker.elo : defenderPlayer.elo,
          winnerIsAttacker ? defenderPlayer.elo : attacker.elo,
        );
        const attackerElo = winnerIsAttacker ? update.winnerElo : update.loserElo;
        const defenderElo = winnerIsAttacker ? update.loserElo : update.winnerElo;
        await opts.repository.updateElo(attacker.id, attackerElo);
        await opts.repository.updateElo(defenderPlayer.id, defenderElo);
        elo = { attacker: attackerElo, defender: defenderElo };

        const attackerGain = winnerIsAttacker ? ARENA_MARKS_WIN : ARENA_MARKS_LOSS;
        const defenderGain = winnerIsAttacker ? ARENA_MARKS_LOSS : ARENA_MARKS_WIN;
        const attackerMarks = attacker.arenaMarks + attackerGain;
        const defenderMarks = defenderPlayer.arenaMarks + defenderGain;
        await opts.repository.updateArenaMarks(attacker.id, attackerMarks);
        await opts.repository.updateArenaMarks(defenderPlayer.id, defenderMarks);
        arenaMarks = { attacker: attackerMarks, defender: defenderMarks };
      }
    }

    // §9.4/roadmap M7 sub-sessão 9 — persiste o replay pra revisão/auditoria posterior.
    // A gravação em si (`ReplayRepository.save`, PK = nonce) também é a defesa real
    // contra reenvio; a checagem de `getByNonce` acima é só uma resposta de erro mais
    // rápida antes de gastar trabalho simulando de novo.
    await opts.replayRepository.save({
      nonce: body.nonce,
      rulesVersion: RULES_VERSION,
      seed,
      initialState: setup,
      commands: body.commands ?? [],
      result,
      attackerPlayerId: attacker.id,
      defenderPlayerId: assembled.defenderPlayerId,
      createdAt: new Date().toISOString(),
    });

    return { seed, result, elo, arenaMarks };
  });

  fastify.get('/battles/:nonce', async (request, reply) => {
    if (!request.player) return reply.code(401).send({ error: 'missing player token' });
    const player = request.player;

    const { nonce } = request.params as { nonce: string };
    const replay = await opts.replayRepository.getByNonce(nonce);
    if (!replay) return reply.code(404).send({ error: 'replay não encontrado' });

    if (replay.attackerPlayerId !== player.id && replay.defenderPlayerId !== player.id) {
      return reply.code(403).send({ error: 'este replay não é seu' });
    }

    return replay;
  });
};
