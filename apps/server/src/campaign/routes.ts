import { artefatoEquipado } from '../summon/artefatos.js';
import { buildBattleSetupFromHeroes, type BattleSetup, type Coord, type Placement } from '@paths-beyond/core';
import { redigirUnidade, type UnidadeVisivel } from '../battle/visao.js';
import {
  toEncounterPlacements,
  toSummonBlueprintPlacements,
  type ContentCatalog,
  type Encounter,
} from '@paths-beyond/content';
import type { FastifyPluginAsync } from 'fastify';
import type { Telemetria } from '../telemetry/telemetria.js';
import { characterIdsForPlacements } from '../battle/artIds.js';
import {
  MAX_PARTY_PRESETS,
  type CharacterOwnershipRepository,
  type HeroRepository,
  type PartyPresetRepository,
  type PlayerRepository,
  type RewardsRepository,
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
  // M35 3/N (D42) — os presets de party.
  readonly partyPresetRepository: PartyPresetRepository;
  // M34 1/N (D45) — o ticket abre a tentativa, a run fecha. O serviço sabe se a conta recusou.
  readonly telemetria: Telemetria;
  readonly catalog: ContentCatalog;
  readonly ticketSecret: string;
  readonly now: () => number;
  readonly newNonce?: () => string;
}

// `catalog.encounters` é uma LISTA e não um índice por id (é assim desde M12): a busca é
// linear de propósito, com seis capítulos, e centralizada aqui para as duas rotas não
// divergirem no que consideram "capítulo desconhecido".
export function findChapter(catalog: ContentCatalog, chapterId: string): Encounter | undefined {
  return catalog.encounters.find((encounter) => encounter.id === chapterId);
}

export async function assembleChapterBattle(
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

  // M38 4/N — o artefato equipado de cada herói, buscado antes (a busca é assíncrona).
  const artefatos = await Promise.all(stored.map((hero) => artefatoEquipado(opts.ownershipRepository, opts.catalog, hero)));
  const placements: Placement[] = [];
  stored.forEach((hero, index) => {
    const slot = slots[index]!;
    const classDef = opts.catalog.classes[hero.hero.classId];
    if (!classDef) return;
    const artifact = artefatos[index];
    placements.push({
      unitId: `player-${hero.hero.id}`,
      hero: hero.hero,
      classDef,
      equippedItems: hero.equippedItems,
      ...(artifact ? { artifact } : {}),
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

// M35 3/N (D42) — o tamanho máximo de time é o mesmo da arena e da masmorra (`MAX_TEAM_SIZE`
// em battle/routes.ts): um preset maior que isso nunca caberia em lugar nenhum.
const MAX_PRESET_SIZE = 5;

interface PresetBody {
  readonly name?: unknown;
  readonly heroIds?: unknown;
}

function slotDaRota(params: unknown): number | null {
  const bruto = (params as { slot?: string }).slot ?? '';
  if (!/^\d+$/.test(bruto)) return null;
  const slot = Number(bruto);
  return slot >= 1 && slot <= MAX_PARTY_PRESETS ? slot : null;
}

/**
 * Os ids de personagem na ordem em que a campanha os apresenta como VAGA do jogador. Movida de
 * `apps/client/src/logic/quemVai.ts` (M35 2/N) nesta fatia, sem mudar de regra.
 */
export function ordemDeAparicao(catalog: ContentCatalog): readonly string[] {
  const ordemDoCapitulo = new Map(catalog.chapters.map((c) => [c.id, c.order] as const));
  const missoes = [...catalog.encounters].sort(
    (a, b) => (ordemDoCapitulo.get(a.chapterId) ?? 0) - (ordemDoCapitulo.get(b.chapterId) ?? 0) || a.order - b.order,
  );
  const vistos: string[] = [];
  for (const missao of missoes) {
    for (const unit of missao.units) {
      if (unit.side !== 'player') continue;
      const id = unit.hero.characterId;
      if (id && !vistos.includes(id)) vistos.push(id);
    }
  }
  return vistos;
}

export const campaignRoutes: FastifyPluginAsync<CampaignRoutesOptions> = async (fastify, opts) => {
  // M35 3/N (D42) — os PRESETS de party. Estado de conta, pelo mesmo desenho de `/me/defense`:
  // o cliente escolhe um preset ao entrar numa missão e ainda troca antes de entrar. O servidor
  // valida posse (§9.4) e o tamanho de time; NÃO valida contra uma missão, porque o preset é
  // reutilizado entre missões e quem tem vagas é a missão — a tela apara ao aplicar.
  fastify.get('/me/party-presets', async (request, reply) => {
    if (!request.player) return reply.code(401).send({ error: 'missing player token' });
    const presets = await opts.partyPresetRepository.listPresetsByOwner(request.player.id);
    return { slots: MAX_PARTY_PRESETS, presets };
  });

  fastify.put('/me/party-presets/:slot', async (request, reply) => {
    if (!request.player) return reply.code(401).send({ error: 'missing player token' });
    const player = request.player;
    const slot = slotDaRota(request.params);
    if (slot === null) return reply.code(400).send({ error: `slot precisa estar entre 1 e ${MAX_PARTY_PRESETS}` });

    const body = (request.body ?? {}) as PresetBody;
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    if (name.length === 0) return reply.code(400).send({ error: 'o preset precisa de um nome' });
    const heroIds = Array.isArray(body.heroIds) ? body.heroIds.filter((id): id is string => typeof id === 'string') : [];
    if (heroIds.length === 0 || heroIds.length > MAX_PRESET_SIZE) {
      return reply.code(400).send({ error: `o preset precisa ter entre 1 e ${MAX_PRESET_SIZE} heróis` });
    }
    if (new Set(heroIds).size !== heroIds.length) return reply.code(400).send({ error: 'herói repetido no preset' });

    // §9.4 — posse, como `PUT /me/defense`: um preset com o herói de outra conta seria uma
    // party que o servidor recusaria na hora de montar a batalha, e é melhor recusar aqui.
    const heroes = await opts.heroRepository.getHeroesByIds(heroIds);
    const ownsAll = heroIds.every((id) => heroes.some((h) => h.hero.id === id && h.ownerPlayerId === player.id));
    if (heroes.length !== heroIds.length || !ownsAll) return reply.code(403).send({ error: 'algum heroId não pertence a você' });

    return opts.partyPresetRepository.savePreset({ ownerPlayerId: player.id, slot, name, heroIds });
  });

  fastify.delete('/me/party-presets/:slot', async (request, reply) => {
    if (!request.player) return reply.code(401).send({ error: 'missing player token' });
    const slot = slotDaRota(request.params);
    if (slot === null) return reply.code(400).send({ error: `slot precisa estar entre 1 e ${MAX_PARTY_PRESETS}` });
    const apagado = await opts.partyPresetRepository.deletePreset(request.player.id, slot);
    if (!apagado) return reply.code(404).send({ error: 'não há preset nesse slot' });
    return { deleted: true };
  });

  // M36 3/N (D48) — a PRÉVIA da missão, agora do servidor.
  //
  // Ela existia desde o M35 2/N e era montada no CLIENTE, a partir de `packages/data/encounters`
  // empacotado junto com o jogo. Com o catálogo partido esse arquivo não viaja mais no bundle —
  // e mesmo que viajasse, mostrar a ficha do inimigo antes de entrar seria o oposto de D47.
  //
  // O que ela devolve é o mesmo que a batalha devolve: o tabuleiro e o VISÍVEL. §1.1 continua
  // valendo na forma reescrita — o jogador vê o terreno, onde os inimigos estão, quantos são e
  // onde ele mesmo vai entrar. O que ele não vê é o que cada um carrega.
  //
  // Sem `buildInitialState` de propósito: construir o estado resolveria o turno de IA que abre a
  // batalha, e a prévia mostraria as peças JÁ MOVIDAS — um defeito que a versão do cliente tinha
  // e que ninguém tinha notado, porque lá a prévia nascia de uma seed fixa.
  fastify.get('/campaign/:id/previa', async (request, reply) => {
    if (!request.player) return reply.code(401).send({ error: 'missing player token' });

    const missionId = (request.params as { id: string }).id;
    const encounter = findChapter(opts.catalog, missionId);
    if (!encounter) return reply.code(404).send({ error: 'capítulo desconhecido' });

    const mapa = opts.catalog.maps[encounter.mapId];
    if (!mapa) return reply.code(500).send({ error: 'capítulo referencia mapa desconhecido' });

    // O que NÃO é vaga: inimigos e aliados de cenário (D16). As vagas ficam de fora — elas são
    // marcas no tabuleiro, e quem as preenche o jogador ainda vai escolher.
    const doCenario = toEncounterPlacements(
      encounter.units.filter((unit) => unit.side !== 'player'),
      opts.catalog,
    );

    const setup = buildBattleSetupFromHeroes({
      placements: doCenario,
      map: mapa.grid,
      permadeath: encounter.permadeath,
      winCondition: encounter.winCondition ?? mapa.winCondition,
      effectDefs: opts.catalog.effects,
      initialValor: mapa.initialValor,
      valorSkills: opts.catalog.valorSkills,
      summonBlueprints: toSummonBlueprintPlacements(opts.catalog),
      itemSets: opts.catalog.itemSets,
      skillsCatalog: opts.catalog.skills,
      weaponDuelRanges: opts.catalog.weaponDuelRanges,
      baselineReactionSkillIds: opts.catalog.baselineReactionSkillIds,
      characterTalentTrees: opts.catalog.characterTalentTrees,
    });

    const vagas: readonly Coord[] = encounter.units.filter((unit) => unit.side === 'player').map((unit) => unit.pos);
    const unidades: readonly UnidadeVisivel[] = setup.units.map((unidade) => redigirUnidade(unidade, 'player'));

    return {
      missionId: encounter.id,
      map: setup.map,
      winCondition: setup.winCondition,
      vagas,
      unidades,
      characterIdByUnitId: characterIdsForPlacements(doCenario),
    };
  });

  fastify.get('/campaign', async (request, reply) => {
    if (!request.player) return reply.code(401).send({ error: 'missing player token' });
    const cleared = new Set(await opts.rewardsRepository.listClearedChapters(request.player.id));

    // M27 (D23) — DUAS camadas. O catálogo já vem ordenado por (posição do capítulo,
    // posição da missão), então aqui não se reordena nada: reordenar de novo seria uma
    // segunda resposta para "qual é a ordem da campanha", e uma delas ficaria errada.
    return {
      chapters: opts.catalog.chapters.map((chapter) => {
        const missions = opts.catalog.encounters.filter((encounter) => encounter.chapterId === chapter.id);
        return {
          id: chapter.id,
          order: chapter.order,
          name: chapter.name,
          // O capítulo está limpo quando TODAS as missões dele estão. É a mesma regra que
          // `countFullyClearedChapters` aplica do lado das conquistas, e ela precisa ser a
          // mesma nos dois lugares — senão a tela diz "capítulo completo" e a conquista
          // discorda.
          cleared: missions.length > 0 && missions.every((mission) => cleared.has(mission.id)),
          missions: missions.map((mission) => ({
            id: mission.id,
            order: mission.order,
            name: mission.name,
            cleared: cleared.has(mission.id),
            slots: mission.units.filter((unit) => unit.side === 'player').length,
          })),
        };
      }),
      premiumOnFirstClear: opts.catalog.premiumRules.premiumRewards.missionFirstClear,
      premiumOnChapterClear: opts.catalog.premiumRules.premiumRewards.chapterFirstClear,
      // M36 3/N — a ordem em que a campanha APRESENTA os personagens. Era derivada no cliente
      // (`quemVai.ts`, M35 2/N) a partir de `encounters`, que não viaja mais no bundle. Continua
      // derivada do conteúdo autorado, só que aqui: um personagem novo numa missão entra na
      // ordem sozinho, e nenhuma lista fica descrevendo o passado.
      //
      // É APRESENTAÇÃO, não regra — ela decide quem vem pré-marcado ao escolher uma missão.
      // Quem valida a party continua sendo a montagem da batalha.
      castOrder: ordemDeAparicao(opts.catalog),
    };
  });

  // M36 2/N (D47) — `POST /campaign/:id/ticket` e `POST /campaign/:id/run` FORAM APOSENTADAS.
  //
  // Elas eram o modelo `ticket → joga tudo → run`, e ele não sobrevive ao inimigo desconhecido: o
  // ticket entregava o `BattleSetup` COMPLETO do capítulo — stats, skills e scripts de todo
  // inimigo — para o cliente jogar sozinho. O que as substitui é `POST /campaign/:id/matches` +
  // `POST /matches/:nonce/commands`, em `battle/matchRoutes.ts`, com `assembleChapterBattle`
  // acima continuando a ser a MESMA montagem.
  //
  // A telemetria do M34 não perdeu nada: `missaoIniciada` passou para a abertura da partida e
  // `missaoTerminada` para o comando que fecha a batalha — os mesmos dois instantes, com o mesmo
  // nonce casando começo e fim.
};
