import { toEncounterPlacements } from '@paths-beyond/content/src/encounterPlacements.js';
import { buildBattleSetupFromHeroes, type BattleSetup, type Hero, type Id } from '@paths-beyond/core';
// Import do módulo direto, não do barrel `@paths-beyond/content`: o barrel reexporta
// `loadCatalogFromDisk`, que importa `node:fs` — mesmo motivo já documentado em
// `loadCatalogFromBrowser.ts`.
import type { Encounter } from '@paths-beyond/content/src/types.js';
import { toSummonBlueprintPlacements } from '@paths-beyond/content/src/summonPlacements.js';
import { catalog } from './catalog.js';

// M12, sub-sessão 1/N: o ELENCO de cada mapa da campanha saiu daqui para
// `packages/data/encounters/*.json`. Este arquivo era o último canto de conteúdo
// hardcoded do projeto — M9 moveu classes/skills/itens/mapas, mas "quem está em qual
// mapa, onde, com qual equipamento" continuou em TypeScript, o que também impedia
// servidor e `sim-cli` de rodarem um mapa de campanha (regra 4 do CLAUDE.md).
//
// O que sobrou aqui é só a ponte: `Encounter` (dado) → `BattleSetup` (motor), pela mesma
// `buildBattleSetupFromHeroes` que `apps/server` e `tools/balance` já usam.

export interface CampaignMapContent {
  readonly setup: BattleSetup;
  readonly heroesByUnitId: Readonly<Record<Id, Hero>>;
}

function buildCampaignMap(encounter: Encounter): CampaignMapContent {
  const arenaMap = catalog.maps[encounter.mapId];
  if (!arenaMap) throw new Error(`mapa de campanha desconhecido no catálogo: ${encounter.mapId}`);

  // §8.1 (M17, 3/N) — a conversão virou peça compartilhada de `packages/content`, porque
  // ela passou a ter um ramo e cinco consumidores; ver `encounterPlacements.ts`.
  const placements = toEncounterPlacements(encounter.units, catalog);

  // `heroesByUnitId` é só do lado do jogador, e agora isso é uma afirmação do tipo em vez de
  // um acidente: a tela de talentos e a de equipamento abrem sobre um HERÓI, e inimigo de
  // fase não tem ficha para abrir.
  const heroesByUnitId: Record<Id, Hero> = {};
  for (const unit of encounter.units) {
    if (unit.side === 'player') heroesByUnitId[unit.unitId] = unit.hero;
  }

  return {
    setup: buildBattleSetupFromHeroes({
      placements,
      map: arenaMap.grid,
      permadeath: encounter.permadeath,
      // §5.7 — a condição do encounter sobrepõe a do layout quando declarada: um mapa de
      // `escort` nomeia uma unidade que só existe no elenco (ver DECISIONS.md).
      winCondition: encounter.winCondition ?? arenaMap.winCondition,
      effectDefs: catalog.effects,
      initialValor: arenaMap.initialValor,
      // §5.6 (M12, sub-sessão 4/N) — sem isto o saldo de Valor aparecia no HUD e não
      // havia o que gastar: `applyUseValor` resolve contra `state.valorSkills`, que
      // ninguém preenchia fora de teste.
      valorSkills: catalog.valorSkills,
      // §5.6 (M15, sub-sessão 2/N) — mesma história do repasse acima, um milestone depois:
      // sem os blueprints a valor-skill de invocação apareceria no HUD e seria recusada no
      // clique, porque o motor não teria de onde tirar a unidade.
      summonBlueprints: toSummonBlueprintPlacements(catalog),
      itemSets: catalog.itemSets,
      skillsCatalog: catalog.skills,
      weaponDuelRanges: catalog.weaponDuelRanges,
      baselineReactionSkillIds: catalog.baselineReactionSkillIds,
      // §8.1 (M17, 2/N) — mesmo repasse que a arena e a masmorra passaram a fazer no
      // servidor: a árvore é do personagem, e sem ela a campanha montaria a party com a
      // alocação escrita e nenhum talento resolvido.
      characterTalentTrees: catalog.characterTalentTrees,
    }),
    heroesByUnitId,
  };
}

// Já ordenados por `chapter` pelo catálogo (§10 — "campanha em capítulos"): a ordem dos
// arquivos no disco não é garantida entre plataformas.
export const campaignMaps: readonly CampaignMapContent[] = catalog.encounters.map(buildCampaignMap);
