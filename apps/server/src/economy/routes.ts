import {
  RULES_VERSION,
  buildBattleSetupFromHeroes,
  buildInitialState,
  applyCommandAndAdvance,
  consumeEntry,
  entriesRemaining,
  resolveAutoBattle,
  resolveEnergy,
  rollDungeonRun,
  spendEnergy,
  type BattleCommand,
  type BattleSetup,
  type DungeonDef,
  type DungeonRunRewards,
  type EnergyState,
  type Placement,
  type Id,
} from '@paths-beyond/core';
import {
  toEncounterPlacements,
  toSummonBlueprintPlacements,
  type ContentCatalog,
  type DungeonEncounter,
} from '@paths-beyond/content';

type DungeonEncounterUnit = DungeonEncounter['units'][number];
import type { FastifyPluginAsync } from 'fastify';
import { deriveSeed, generateNonce } from '../battle/ticket.js';
import { characterIdsForPlacements } from '../battle/artIds.js';
import { rejectOnRulesVersion } from '../version.js';
import type {
  CharacterOwnershipRepository,
  EconomyRepository,
  HeroRepository,
  Player,
  PlayerRepository,
} from '../repository/types.js';
import { ownedCharacterIds, unownedAmong } from '../summon/ownership.js';

// §10 (M14, sub-sessão 3/N) — as rotas do farm.
//
// Decisão do usuário: **a masmorra é uma batalha de verdade**. Por isso o fluxo é o mesmo
// do PvP de M13 2/N, e não um botão que devolve loot: o cliente pede um TICKET (confronto
// montado + seed), joga a camada de grid e submete os comandos; o servidor reexecuta e só
// paga se houve vitória. A varredura é o mesmo caminho com a IA de mapa no lugar do humano
// (`resolveAutoBattle`) — e ela também pode perder.
//
// O que este arquivo NÃO faz: decidir. Quanto custa, quanto cai, quando a entrada volta e
// se o time venceu são todas perguntas de `packages/core` + `packages/data`. Aqui só há
// I/O, autorização e a ordem das operações.

export interface EconomyRoutesOptions {
  readonly repository: PlayerRepository;
  readonly heroRepository: HeroRepository;
  readonly economyRepository: EconomyRepository;
  // §9.4 (M18, 3/N) — posse de personagem, pelo mesmo motivo da arena.
  readonly ownershipRepository: CharacterOwnershipRepository;
  readonly catalog: ContentCatalog;
  readonly ticketSecret: string;
  // Injetado pelos testes, como em `season/routes.ts` e no rate limiter: sem isso a trava
  // de tempo e a regeneração de energia só seriam testáveis esperando o relógio andar.
  readonly now: () => number;
  // Mesma costura, pelo mesmo motivo, um milestone depois (M15 4/N): o nonce do ticket vira
  // a SEED da batalha (`deriveSeed`), e `generateNonce` é `crypto.randomUUID`. Com ele solto,
  // um teste que afirma "este time vence esta masmorra" joga uma partida diferente a cada
  // execução — e o de varredura da elite, que é dura de propósito, falhava 1 em 8. Injetável
  // = o teste escolhe a seed; em produção continua sendo aleatória.
  readonly newNonce?: () => string;
}

interface RunBody {
  readonly nonce?: string;
  readonly heroIds?: readonly string[];
  readonly commands?: readonly BattleCommand[];
  readonly auto?: boolean;
  // M22 1/N — o campo que faltava. O ticket já devolvia `rulesVersion` desde o M14 3/N e a
  // submissão não a mandava de volta, então não havia o que validar (registrado no M17 5/N).
  readonly rulesVersion?: string;
}

// A energia guardada é sempre reapurada contra o agora antes de qualquer decisão: o valor
// no banco é do instante em que foi escrito, não de agora.
function currentEnergy(player: Player, nowMs: number, catalog: ContentCatalog): EnergyState {
  return resolveEnergy(player.energy, nowMs, catalog.economyRules.energy);
}

// Monta o confronto: o elenco INIMIGO vem do `dungeon-encounter` (conteúdo), e as vagas do
// jogador são preenchidas com os heróis que ele escolheu. As vagas de referência do
// conteúdo existem só para o encounter ser jogável sozinho em teste — em produção elas são
// substituídas, nesta ordem, pelas posições declaradas.
async function assembleDungeonBattle(
  opts: EconomyRoutesOptions,
  encounter: DungeonEncounter,
  playerHeroIds: readonly string[],
  ownerPlayerId: string,
): Promise<{ setup: BattleSetup; characterIdByUnitId: Readonly<Record<string, string>> } | { error: string }> {
  const arenaMap = opts.catalog.maps[encounter.mapId];
  if (!arenaMap) return { error: `masmorra referencia mapa desconhecido: ${encounter.mapId}` };

  const slots = encounter.units.filter((unit: DungeonEncounterUnit) => unit.side === 'player');
  if (playerHeroIds.length === 0) return { error: 'escolha ao menos um herói' };
  if (playerHeroIds.length > slots.length) {
    return { error: `esta masmorra tem ${slots.length} vaga(s); ${playerHeroIds.length} heróis enviados` };
  }

  const stored = await opts.heroRepository.getHeroesByIds(playerHeroIds);
  if (stored.length !== playerHeroIds.length) return { error: 'herói desconhecido' };
  for (const hero of stored) {
    if (hero.ownerPlayerId !== ownerPlayerId) return { error: 'esse herói não é seu' };
  }

  // §9.4 (M18, 3/N) — a mesma checagem de posse da arena, e pelo mesmo motivo: a instância
  // ser sua não diz que você adquiriu o personagem que ela representa. As duas rotas que
  // montam batalha a partir de ids do cliente têm de perguntar isso, senão a que não
  // pergunta vira a porta.
  const owned = await ownedCharacterIds(opts.ownershipRepository, opts.catalog, ownerPlayerId);
  const faltando = unownedAmong(stored, owned);
  if (faltando.length > 0) return { error: `você não possui: ${faltando.join(', ')}` };

  const placements: Placement[] = [];

  stored.forEach((hero, index) => {
    const slot = slots[index]!;
    const classDef = opts.catalog.classes[hero.hero.classId];
    if (!classDef) throw new Error(`classe desconhecida: ${hero.hero.classId}`);
    placements.push({
      unitId: `player-${hero.hero.id}`,
      hero: hero.hero,
      classDef,
      equippedItems: hero.equippedItems,
      side: 'player',
      pos: slot.pos,
      height: slot.height,
    });
  });

  // §8.1 (M17, 3/N) — o inimigo de masmorra deixou de ser um `Hero` com classe e
  // equipamento a resolver e passou a ser uma referência a `enemies/`. A conversão é a
  // MESMA que o cliente e o piloto usam (`toEncounterPlacements`), e isso não é economia
  // de linhas: o cliente joga a masmorra e o servidor a reexecuta para conferir (M14 3/N),
  // então os dois lados montando o inimigo por caminhos diferentes seria §9.1.
  placements.push(
    ...toEncounterPlacements(
      encounter.units.filter((u: DungeonEncounterUnit) => u.side === 'enemy'),
      opts.catalog,
    ),
  );

  return {
    // M26 3/N — quem é cada unidade, para o cliente desenhar. Sai daqui porque só aqui os
    // `Hero` ainda estão à mão: o `BattleSetup` guarda a INSTÂNCIA de herói, não a pessoa.
    characterIdByUnitId: characterIdsForPlacements(placements),
    setup: buildBattleSetupFromHeroes({
      placements,
      map: arenaMap.grid,
      permadeath: encounter.permadeath,
      winCondition: encounter.winCondition ?? arenaMap.winCondition,
      effectDefs: opts.catalog.effects,
      initialValor: arenaMap.initialValor,
      valorSkills: opts.catalog.valorSkills,
      // §5.6 (M15 2/N) — o cliente joga a masmorra e o servidor a reexecuta para conferir
      // (M14 3/N). Se um lado montasse a batalha com blueprints e o outro sem, uma invocação
      // do jogador seria recusada na reexecução e a run inteira viraria "comando inválido".
      summonBlueprints: toSummonBlueprintPlacements(opts.catalog),
      itemSets: opts.catalog.itemSets,
      skillsCatalog: opts.catalog.skills,
      weaponDuelRanges: opts.catalog.weaponDuelRanges,
      baselineReactionSkillIds: opts.catalog.baselineReactionSkillIds,
      // §8.1 (M17, 2/N) — mesma razão do repasse na arena: a masmorra é reexecutada aqui
      // para conferir a run do cliente, e um dos dois lados montar a party sem a árvore do
      // personagem recusaria a run inteira.
      characterTalentTrees: opts.catalog.characterTalentTrees,
    }),
  };
}

// Por que a recompensa tem stream próprio: a seed da BATALHA e a seed do DROP saem do mesmo
// nonce, mas por sufixos diferentes. Sem isso, um jogador que descobrisse o resultado do
// drop conseguiria inferir a batalha (e vice-versa).
function rewardSeedFor(secret: string, nonce: string): number {
  return deriveSeed(secret, `${nonce}:rewards`);
}

function rollRewards(catalog: ContentCatalog, dungeon: DungeonDef, seed: number, nonce: string): DungeonRunRewards {
  return rollDungeonRun({
    dungeon,
    seed,
    runId: nonce,
    substatWeights: catalog.substatWeights,
    mainstatWeights: catalog.mainstatWeights,
  });
}

export const economyRoutes: FastifyPluginAsync<EconomyRoutesOptions> = async (fastify, opts) => {
  // §10 — "energia de conta limita o farm diário". Tudo que o cliente precisa para
  // desenhar a tela de farm, com a energia já reapurada no instante da chamada.
  fastify.get('/me/economy', async (request, reply) => {
    if (!request.player) return reply.code(401).send({ error: 'missing player token' });
    const player = request.player;
    const nowMs = opts.now();

    const [materials, items, clears] = await Promise.all([
      opts.economyRepository.getMaterials(player.id),
      opts.economyRepository.listItems(player.id),
      opts.economyRepository.listClears(player.id),
    ]);

    return {
      energy: currentEnergy(player, nowMs, opts.catalog),
      energyMax: opts.catalog.economyRules.energy.max,
      wallet: { gold: player.gold, stones: player.stones, arenaMarks: player.arenaMarks },
      materials,
      inventory: items,
      clearedDungeons: clears,
    };
  });

  // A lista de masmorras com a disponibilidade JÁ resolvida: o cliente não recalcula regra
  // (regra 3) — ele desenha o que o servidor disse.
  fastify.get('/dungeons', async (request, reply) => {
    if (!request.player) return reply.code(401).send({ error: 'missing player token' });
    const player = request.player;
    const nowMs = opts.now();
    const clears = new Set(await opts.economyRepository.listClears(player.id));
    const energy = currentEnergy(player, nowMs, opts.catalog);

    const dungeons = await Promise.all(
      Object.values(opts.catalog.dungeons).map(async (dungeon) => {
        const lockedBy = dungeon.requiresClearOf && !clears.has(dungeon.requiresClearOf) ? dungeon.requiresClearOf : null;
        const entryState = dungeon.entryLimit
          ? ((await opts.economyRepository.getEntryState(player.id, dungeon.id)) ?? { used: 0, asOfMs: nowMs })
          : null;

        return {
          id: dungeon.id,
          name: dungeon.name,
          focus: dungeon.focus,
          difficulty: dungeon.difficulty,
          energyCost: dungeon.energyCost,
          manualOnly: dungeon.manualOnly === true,
          cleared: clears.has(dungeon.id),
          // Varrer exige ter limpado à mão antes (decisão do usuário).
          sweepAvailable: dungeon.manualOnly !== true && clears.has(dungeon.id),
          lockedBy,
          entriesLeft:
            dungeon.entryLimit && entryState ? entriesRemaining(entryState, nowMs, dungeon.entryLimit) : null,
          enoughEnergy: energy.stored >= dungeon.energyCost,
        };
      }),
    );

    return { dungeons };
  });

  // O ticket: mesmo contrato de `POST /battles/ticket` (M13, 2/N). Não cobra energia — quem
  // cobra é a submissão. Abandonar um ticket não pode custar recurso; em compensação, pedir
  // muitos tickets consome a mesma cota do rate limiter, que é o que contém procurar seed
  // favorável (risco residual já registrado em M13).
  fastify.post('/dungeons/:id/ticket', async (request, reply) => {
    if (!request.player) return reply.code(401).send({ error: 'missing player token' });
    const player = request.player;


    const dungeonId = (request.params as { id: string }).id;
    const dungeon = opts.catalog.dungeons[dungeonId];
    if (!dungeon) return reply.code(404).send({ error: 'masmorra desconhecida' });

    const clears = new Set(await opts.economyRepository.listClears(player.id));
    if (dungeon.requiresClearOf && !clears.has(dungeon.requiresClearOf)) {
      return reply.code(403).send({ error: `precisa limpar ${dungeon.requiresClearOf} antes` });
    }

    const encounter = opts.catalog.dungeonEncounters[dungeon.encounterId];
    if (!encounter) return reply.code(500).send({ error: 'masmorra sem confronto declarado' });

    const body = request.body as RunBody;
    const assembled = await assembleDungeonBattle(opts, encounter, body.heroIds ?? [], player.id);
    if ('error' in assembled) return reply.code(400).send({ error: assembled.error });

    const nonce = (opts.newNonce ?? generateNonce)();
    return {
      nonce,
      seed: deriveSeed(opts.ticketSecret, nonce),
      rulesVersion: RULES_VERSION,
      setup: assembled.setup,
      characterIdByUnitId: assembled.characterIdByUnitId,
      dungeonId: dungeon.id,
    };
  });

  // A submissão. Manual: o servidor reaplica os comandos do cliente e exige vitória.
  // Varredura: a IA de mapa joga os dois lados. Nos dois casos a energia é cobrada ANTES do
  // resultado — perder também gasta, que é o que dá peso à decisão de entrar com um time
  // fraco (decisão do usuário: "ainda sim teria que ser forte o suficiente para passar").
  fastify.post('/dungeons/:id/run', async (request, reply) => {
    if (!request.player) return reply.code(401).send({ error: 'missing player token' });
    const player = request.player;
    const nowMs = opts.now();

    const dungeonId = (request.params as { id: string }).id;
    const dungeon = opts.catalog.dungeons[dungeonId];
    if (!dungeon) return reply.code(404).send({ error: 'masmorra desconhecida' });

    const body = request.body as RunBody;
    if (!body.nonce) return reply.code(400).send({ error: 'nonce é obrigatório' });

    // M22 1/N — a versão ANTES do limitador de requisições: um cliente desatualizado não
    // consegue jogar, e responder 429 a ele o deixaria com um erro que não explica nada em
    // vez da tela que manda atualizar.
    if (rejectOnRulesVersion(reply, body.rulesVersion)) return reply;

    // Idempotência (mesma defesa de `POST /battles`): reenviar não paga duas vezes.
    const already = await opts.economyRepository.getRun(body.nonce);
    if (already) return reply.code(409).send({ error: 'esta run já foi resolvida', run: already });


    const clears = new Set(await opts.economyRepository.listClears(player.id));
    if (dungeon.requiresClearOf && !clears.has(dungeon.requiresClearOf)) {
      return reply.code(403).send({ error: `precisa limpar ${dungeon.requiresClearOf} antes` });
    }

    const auto = body.auto === true;
    if (auto) {
      // Duas travas, as duas da decisão do usuário: a dificuldade alta é sempre manual, e
      // varrer exige ter limpado a masmorra à mão antes.
      if (dungeon.manualOnly) return reply.code(403).send({ error: 'esta dificuldade é sempre manual' });
      if (!clears.has(dungeon.id)) return reply.code(403).send({ error: 'limpe a masmorra à mão antes de varrer' });
    }

    const encounter = opts.catalog.dungeonEncounters[dungeon.encounterId];
    if (!encounter) return reply.code(500).send({ error: 'masmorra sem confronto declarado' });

    const assembled = await assembleDungeonBattle(opts, encounter, body.heroIds ?? [], player.id);
    if ('error' in assembled) return reply.code(400).send({ error: assembled.error });

    // Trava de tempo (dificuldade alta): consome UMA entrada. Antes da energia porque é a
    // restrição mais escassa — gastar energia e então descobrir que não há entrada seria
    // cobrar por uma partida que não aconteceu.
    if (dungeon.entryLimit) {
      const stored = (await opts.economyRepository.getEntryState(player.id, dungeon.id)) ?? {
        used: 0,
        asOfMs: nowMs,
      };
      const consumed = consumeEntry(stored, nowMs, dungeon.entryLimit);
      if (!consumed.ok) {
        await opts.economyRepository.setEntryState(player.id, dungeon.id, consumed.state);
        return reply.code(403).send({ error: consumed.reason });
      }
      await opts.economyRepository.setEntryState(player.id, dungeon.id, consumed.state);
    }

    const spent = spendEnergy(player.energy, nowMs, opts.catalog.economyRules.energy, dungeon.energyCost);
    if (!spent.ok) {
      await opts.repository.updateEnergy(player.id, spent.energy);
      return reply.code(403).send({ error: spent.reason, energy: spent.energy });
    }
    await opts.repository.updateEnergy(player.id, spent.energy);

    const seed = deriveSeed(opts.ticketSecret, body.nonce);

    // §9.4 — "servidor autoritativo". O resultado NUNCA vem do cliente: no manual o
    // servidor reaplica os comandos sobre o mesmo setup e a mesma seed; na varredura ele
    // joga a batalha inteira.
    let outcome: 'victory' | 'defeat';
    let roundsPlayed: number;
    if (auto) {
      const result = resolveAutoBattle({ setup: assembled.setup, seed });
      outcome = result.outcome === 'victory' ? 'victory' : 'defeat';
      roundsPlayed = result.rounds;
    } else {
      let state = buildInitialState(assembled.setup, seed);
      for (const command of body.commands ?? []) {
        if (state.outcome !== 'ongoing') break;
        const applied = applyCommandAndAdvance(state, command);
        if (!applied.applied) {
          return reply.code(400).send({ error: `comando rejeitado: ${applied.reason}` });
        }
        state = applied.state;
      }
      outcome = state.outcome === 'victory' ? 'victory' : 'defeat';
      roundsPlayed = state.round;
    }

    await opts.economyRepository.saveRun({
      nonce: body.nonce,
      playerId: player.id,
      dungeonId: dungeon.id,
      mode: auto ? 'auto' : 'manual',
      outcome,
      createdAt: new Date(nowMs).toISOString(),
    });

    // Derrota gasta energia e não paga nada — é o que faz "o time precisa ser forte o
    // bastante" ter consequência.
    if (outcome !== 'victory') {
      return reply.code(200).send({ outcome, roundsPlayed, rewards: null, energy: spent.energy });
    }

    const rewards = rollRewards(opts.catalog, dungeon, rewardSeedFor(opts.ticketSecret, body.nonce), body.nonce);

    const wallet = await opts.repository.updateWallet(player.id, {
      gold: player.gold + rewards.gold,
      stones: player.stones + rewards.stones,
    });

    if (Object.keys(rewards.materials).length > 0) {
      const current = await opts.economyRepository.getMaterials(player.id);
      const merged: Record<string, number> = { ...current };
      for (const [materialId, amount] of Object.entries(rewards.materials)) {
        merged[materialId] = (merged[materialId] ?? 0) + amount;
      }
      await opts.economyRepository.setMaterials(player.id, merged);
    }

    if (rewards.items.length > 0) {
      await opts.economyRepository.addItems(player.id, rewards.items);
    }

    // A primeira vitória MANUAL é o que libera a varredura. Vitória automática não marca
    // nada de novo (só acontece depois de já estar limpa) e a elite nunca libera nada.
    //
    // §10 (M18, 4/N) — e é também a PRIMEIRA COMPLETUDE, uma das quatro fontes da moeda
    // premium. Ela é paga aqui, e não numa rota de reivindicação, porque este é o único
    // ponto do sistema que sabe que a masmorra acabou de ser vencida pela primeira vez —
    // `clears` foi lido no começo desta requisição, antes de `markCleared`.
    let premiumAwarded = 0;
    if (!auto) {
      const primeiraVez = !clears.has(dungeon.id);
      await opts.economyRepository.markCleared(player.id, dungeon.id);
      if (primeiraVez) {
        premiumAwarded = opts.catalog.premiumRules.premiumRewards.dungeonFirstClear;
        await opts.repository.updatePremium(player.id, player.premium + premiumAwarded);
      }
    }

    return {
      outcome,
      roundsPlayed,
      rewards,
      energy: spent.energy,
      premiumAwarded,
      wallet: { gold: wallet.gold, stones: wallet.stones, arenaMarks: wallet.arenaMarks },
    };
  });
};
