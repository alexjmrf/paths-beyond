import {
  RULES_VERSION,
  applyCommandAndAdvance,
  buildBattleSetupFromHeroes,
  buildInitialState,
  type BattleCommand,
  type BattleSetup,
  type Placement,
} from '@paths-beyond/core';
import {
  toEncounterPlacements,
  toSummonBlueprintPlacements,
  type ContentCatalog,
  type Encounter,
} from '@paths-beyond/content';
import type { FastifyPluginAsync } from 'fastify';
import { rejectOnRulesVersion } from '../version.js';
import { deriveSeed, generateNonce } from '../battle/ticket.js';
import { characterIdsForPlacements } from '../battle/artIds.js';
import type {
  CharacterOwnershipRepository,
  HeroRepository,
  PlayerRepository,
  RewardsRepository,
} from '../repository/types.js';
import { ownedCharacterIds, unownedAmong } from '../summon/ownership.js';

// §10/§9.4 (M18, sub-sessão 4/N) — a CAMPANHA passa a ser observada pelo servidor.
//
// Até esta fatia não havia uma única rota de campanha: ela era jogada inteiramente no
// cliente, com o progresso em `localStorage`. Isso deixou de servir quando "avanço de
// história" virou uma fonte de moeda premium (D17/D20) — moeda é estado de conta, e §9.4 é
// explícita: "cliente envia BattleCommand[]; servidor simula e devolve o resultado".
//
// A alternativa (uma rota `POST /campaign/:id/clear` que acredita no cliente) foi
// descartada com o usuário: seria dar moeda premium — que também se compra com dinheiro
// real — por um POST que qualquer um forja. É também o que todo gacha comercial faz: quem
// marca "fase limpa" e paga é sempre o servidor.
//
// O fluxo é o MESMO da masmorra (M14 3/N), e de propósito: ticket com o setup e a seed,
// o cliente joga a camada de grid, e a submissão reexecuta os comandos e exige vitória.
// Duas montagens diferentes para a mesma batalha seriam a divergência que §9.1 chama de
// bug crítico.
//
// O que esta fatia NÃO faz: mover o cliente para este caminho. A campanha do cliente é
// reescrita na 5/N junto com as VAGAS de D16 — fazer o cliente da campanha duas vezes seria
// desperdício, e está declarado em `PROGRESS.md`.

export interface CampaignRoutesOptions {
  readonly repository: PlayerRepository;
  readonly heroRepository: HeroRepository;
  readonly ownershipRepository: CharacterOwnershipRepository;
  readonly rewardsRepository: RewardsRepository;
  readonly catalog: ContentCatalog;
  readonly ticketSecret: string;
  readonly now: () => number;
  readonly newNonce?: () => string;
}

interface RunBody {
  readonly nonce?: string;
  readonly heroIds?: readonly string[];
  readonly commands?: readonly BattleCommand[];
  // M22 1/N — mesmo campo, mesmo motivo de `/dungeons/:id/run`: esta rota também reexecuta
  // comandos do cliente. Ela nasceu no M18 4/N, depois de o roadmap do M22 ser escrito, e
  // por isso o buraco não estava listado lá — é o mesmo buraco.
  readonly rulesVersion?: string;
}

// `catalog.encounters` é uma LISTA e não um índice por id (é assim desde M12): a busca é
// linear de propósito, com seis capítulos, e centralizada aqui para as duas rotas não
// divergirem no que consideram "capítulo desconhecido".
function findChapter(catalog: ContentCatalog, chapterId: string): Encounter | undefined {
  return catalog.encounters.find((encounter) => encounter.id === chapterId);
}

async function assembleChapterBattle(
  opts: CampaignRoutesOptions,
  encounter: Encounter,
  playerHeroIds: readonly string[],
  ownerPlayerId: string,
): Promise<{ setup: BattleSetup; characterIdByUnitId: Readonly<Record<string, string>> } | { error: string }> {
  const arenaMap = opts.catalog.maps[encounter.mapId];
  if (!arenaMap) return { error: `capítulo referencia mapa desconhecido: ${encounter.mapId}` };

  const slots = encounter.units.filter((unit) => unit.side === 'player');
  if (playerHeroIds.length === 0) return { error: 'escolha ao menos um herói' };
  if (playerHeroIds.length > slots.length) {
    return { error: `este capítulo tem ${slots.length} vaga(s); ${playerHeroIds.length} heróis enviados` };
  }

  const stored = await opts.heroRepository.getHeroesByIds(playerHeroIds);
  if (stored.length !== playerHeroIds.length) return { error: 'herói desconhecido' };
  for (const hero of stored) {
    if (hero.ownerPlayerId !== ownerPlayerId) return { error: 'esse herói não é seu' };
  }

  // §9.4 — a mesma checagem de posse da arena e da masmorra. A campanha era, até esta
  // fatia, o único caminho do jogo em que dava para levar ao mapa um personagem que não se
  // possui — porque nenhum servidor a via.
  const owned = await ownedCharacterIds(opts.ownershipRepository, opts.catalog, ownerPlayerId);
  const faltando = unownedAmong(stored, owned);
  if (faltando.length > 0) return { error: `você não possui: ${faltando.join(', ')}` };

  const placements: Placement[] = [];
  stored.forEach((hero, index) => {
    const slot = slots[index]!;
    const classDef = opts.catalog.classes[hero.hero.classId];
    if (!classDef) return;
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
  if (placements.length !== stored.length) return { error: 'herói com classe desconhecida no catálogo' };

  // O que NÃO é vaga vem do conteúdo, pela mesma conversão que o cliente e o piloto de
  // campanha usam desde M17 3/N — uma função, não uma cópia por consumidor.
  //
  // §10/D16 (M18, 5/N) — isso inclui os ALIADOS DE CENÁRIO, e a primeira escrita desta
  // função os perdia: ela filtrava só `enemy`, e o capítulo 5 jogado pelo servidor nasceria
  // sem a unidade que `escort` nomeia — derrota imediata, e nenhum teste de capítulo 1
  // encostaria nisso. A vaga é substituída pelo herói do jogador; o aliado, não: ele está
  // sempre lá, e é justamente por isso que ele existe.
  const doCenario = toEncounterPlacements(
    encounter.units.filter((unit) => unit.side !== 'player'),
    opts.catalog,
  );

  // O MESMO construtor que a masmorra e a arena usam. Montar o `BattleSetup` à mão aqui
  // seria uma terceira montagem da mesma coisa — e §9.1 chama de bug crítico a divergência
  // entre o que o cliente jogou e o que o servidor reexecuta. A primeira escrita desta
  // função fazia exatamente isso e não teria sobrevivido ao primeiro teste: `Placement` não
  // é `BattleUnit`, e nada dentro dele tem `stats` até passar por aqui.
  return {
    // M26 3/N — quem é cada unidade, para o cliente desenhar. Na campanha o cliente já
    // resolvia isso pelo roster; o mapa entra aqui mesmo assim, para as quatro superfícies
    // responderem pela MESMA fonte — e porque o aliado de cenário (D16) não está no roster
    // de ninguém e vinha caindo no glifo em silêncio.
    characterIdByUnitId: characterIdsForPlacements([...placements, ...doCenario]),
    setup: buildBattleSetupFromHeroes({
      placements: [...placements, ...doCenario],
      map: arenaMap.grid,
      permadeath: encounter.permadeath,
      winCondition: encounter.winCondition ?? arenaMap.winCondition,
      effectDefs: opts.catalog.effects,
      initialValor: arenaMap.initialValor,
      valorSkills: opts.catalog.valorSkills,
      summonBlueprints: toSummonBlueprintPlacements(opts.catalog),
      itemSets: opts.catalog.itemSets,
      skillsCatalog: opts.catalog.skills,
      weaponDuelRanges: opts.catalog.weaponDuelRanges,
      baselineReactionSkillIds: opts.catalog.baselineReactionSkillIds,
      characterTalentTrees: opts.catalog.characterTalentTrees,
    }),
  };
}

export const campaignRoutes: FastifyPluginAsync<CampaignRoutesOptions> = async (fastify, opts) => {
  fastify.get('/campaign', async (request, reply) => {
    if (!request.player) return reply.code(401).send({ error: 'missing player token' });
    const cleared = new Set(await opts.rewardsRepository.listClearedChapters(request.player.id));

    return {
      chapters: opts.catalog.encounters
        .slice()
        .sort((a, b) => a.chapter - b.chapter)
        .map((encounter) => ({
          id: encounter.id,
          chapter: encounter.chapter,
          name: encounter.name,
          cleared: cleared.has(encounter.id),
          slots: encounter.units.filter((unit) => unit.side === 'player').length,
        })),
      premiumOnFirstClear: opts.catalog.premiumRules.premiumRewards.chapterFirstClear,
    };
  });

  fastify.post('/campaign/:id/ticket', async (request, reply) => {
    if (!request.player) return reply.code(401).send({ error: 'missing player token' });
    const player = request.player;


    const chapterId = (request.params as { id: string }).id;
    const encounter = findChapter(opts.catalog, chapterId);
    if (!encounter) return reply.code(404).send({ error: 'capítulo desconhecido' });

    const body = request.body as RunBody;
    const assembled = await assembleChapterBattle(opts, encounter, body.heroIds ?? [], player.id);
    if ('error' in assembled) return reply.code(400).send({ error: assembled.error });

    const nonce = (opts.newNonce ?? generateNonce)();
    return {
      nonce,
      seed: deriveSeed(opts.ticketSecret, nonce),
      rulesVersion: RULES_VERSION,
      setup: assembled.setup,
      characterIdByUnitId: assembled.characterIdByUnitId,
      chapterId: encounter.id,
    };
  });

  fastify.post('/campaign/:id/run', async (request, reply) => {
    if (!request.player) return reply.code(401).send({ error: 'missing player token' });
    const player = request.player;

    const chapterId = (request.params as { id: string }).id;
    const encounter = findChapter(opts.catalog, chapterId);
    if (!encounter) return reply.code(404).send({ error: 'capítulo desconhecido' });

    const body = request.body as RunBody;
    if (!body.nonce) return reply.code(400).send({ error: 'nonce é obrigatório' });

    // Antes do limitador, pelo mesmo motivo da masmorra: quem não consegue jogar precisa da
    // resposta que explica por quê.
    if (rejectOnRulesVersion(reply, body.rulesVersion)) return reply;


    const assembled = await assembleChapterBattle(opts, encounter, body.heroIds ?? [], player.id);
    if ('error' in assembled) return reply.code(400).send({ error: assembled.error });

    // §9.4 — o resultado NUNCA vem do cliente: o servidor reaplica os comandos sobre o
    // mesmo setup e a mesma seed que o ticket entregou.
    const seed = deriveSeed(opts.ticketSecret, body.nonce);
    let state = buildInitialState(assembled.setup, seed);
    for (const command of body.commands ?? []) {
      if (state.outcome !== 'ongoing') break;
      const applied = applyCommandAndAdvance(state, command);
      if (!applied.applied) {
        return reply.code(400).send({ error: `comando rejeitado: ${applied.reason}` });
      }
      state = applied.state;
    }

    const outcome = state.outcome === 'victory' ? 'victory' : 'defeat';
    if (outcome !== 'victory') {
      return reply.code(200).send({ outcome, roundsPlayed: state.round, premiumAwarded: 0, premium: player.premium });
    }

    // A primeira completude paga; a segunda não. `markChapterCleared` devolve se foi a
    // primeira — a checagem e a escrita numa operação só, porque perguntar e depois
    // escrever abriria a fresta em que duas submissões simultâneas pagam duas vezes.
    const first = await opts.rewardsRepository.markChapterCleared(player.id, encounter.id);
    const premiumAwarded = first ? opts.catalog.premiumRules.premiumRewards.chapterFirstClear : 0;
    const updated =
      premiumAwarded > 0 ? await opts.repository.updatePremium(player.id, player.premium + premiumAwarded) : player;

    return { outcome, roundsPlayed: state.round, premiumAwarded, premium: updated.premium };
  });
};
