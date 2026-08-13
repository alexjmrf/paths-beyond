import { buildBattleSetupFromHeroes, type BattleSetup, type Hero, type HeroPlacement, type Id } from '@paths-beyond/core';
// Import do módulo direto, não do barrel `@paths-beyond/content`: o barrel reexporta
// `loadCatalogFromDisk`, que importa `node:fs` — mesmo motivo já documentado em
// `loadCatalogFromBrowser.ts`.
import type { Encounter } from '@paths-beyond/content/src/types.js';
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

  const heroesByUnitId: Record<Id, Hero> = {};
  const placements: HeroPlacement[] = encounter.units.map((unit) => {
    const classDef = catalog.classes[unit.hero.classId];
    if (!classDef) throw new Error(`classe desconhecida no catálogo: ${unit.hero.classId}`);
    heroesByUnitId[unit.unitId] = unit.hero;

    const equippedItems = Object.values(unit.hero.equipment)
      .filter((id): id is Id => id !== null)
      .map((id) => catalog.items[id])
      .filter((item): item is NonNullable<typeof item> => item !== undefined);

    return {
      unitId: unit.unitId,
      hero: unit.hero,
      classDef,
      equippedItems,
      side: unit.side,
      pos: unit.pos,
      height: unit.height,
      ...(unit.aiArchetype ? { aiArchetype: unit.aiArchetype } : {}),
    };
  });

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
      itemSets: catalog.itemSets,
      skillsCatalog: catalog.skills,
      weaponDuelRanges: catalog.weaponDuelRanges,
      baselineReactionSkillIds: catalog.baselineReactionSkillIds,
    }),
    heroesByUnitId,
  };
}

// Já ordenados por `chapter` pelo catálogo (§10 — "campanha em capítulos"): a ordem dos
// arquivos no disco não é garantida entre plataformas.
export const campaignMaps: readonly CampaignMapContent[] = catalog.encounters.map(buildCampaignMap);
