import { buildBattleSetupFromHeroes, type BattleSetup, type Coord, type Hero, type HeroPlacement, type Id } from '@paths-beyond/core';
import { catalog } from './catalog.js';

// M9, sub-sessão 3: substitui `data/campaign/` inteiro (fecha a regra 4 do CLAUDE.md —
// "nada de conteúdo hardcoded... vive em packages/data" — decisão de M6 sub-sessão 1
// cuja justificativa expirou quando M8 entregou conteúdo real, ver DECISIONS.md,
// "Auditoria 2026-08-07"). Antes, cada unidade era um `BattleUnit` inventado à mão
// (stats/skills fictícios); agora é um `Hero` real referenciando classes/skills/itens
// reais de `packages/data`, resolvido pela mesma ponte que `apps/server`/`tools/balance`
// já usam — `buildBattleSetupFromHeroes` (packages/core/src/battle/assemble.ts), sem
// escrever um caminho novo de resolução (D2/briefing).
//
// D3 (briefing): os 3 LAYOUTS de mapa (`map-campanha-{1,2,3}-provisorio`, portados de
// `data/campaign/map{1,2,3}.ts`) são marcados como provisórios pelo próprio `id`/`name`
// — autoria de mapa de verdade é M12. As CLASSES/SKILLS/ITENS usados pra povoar esses
// mapas já são conteúdo real de M8, não inventados por esta sub-sessão.
const CAMPAIGN_MAP_IDS: readonly Id[] = ['map-campanha-1-provisorio', 'map-campanha-2-provisorio', 'map-campanha-3-provisorio'];

interface CampaignUnitSpec {
  readonly unitId: Id;
  readonly classId: Id;
  readonly pos: Coord;
  readonly side: 'player' | 'enemy';
  // Nem toda classe tem item próprio autorado ainda (ex.: a classe promovida de M8 não
  // ganhou arma própria) — equipar fica opcional, nunca inventa um item novo.
  readonly weaponId?: Id;
  readonly necklaceId?: Id;
}

// Convenção de autoria real desde M8 sub-sessão 2/3: toda classe `class-<slug>` tem
// `skill-ataque-<slug>` (básico) e, quando existe, `skill-especial-<slug>`. A tática
// nunca inventa uma condição nova — só habilita o golpe especial (ou o básico, se a
// classe não tiver especial) incondicionalmente, mesmo padrão de `comp-*.json` (M8).
function buildHeroFromSpec(spec: CampaignUnitSpec): Hero {
  const classDef = catalog.classes[spec.classId];
  if (!classDef) throw new Error(`classe desconhecida no catálogo: ${spec.classId}`);

  const slug = spec.classId.replace(/^class-/, '');
  const basicSkillId = `skill-ataque-${slug}`;
  const specialSkillId = `skill-especial-${slug}`;
  const hasSpecial = Boolean(catalog.skills[specialSkillId]);
  const duelSkills = [basicSkillId, ...(hasSpecial ? [specialSkillId] : [])].filter((id) => catalog.skills[id]);

  return {
    id: spec.unitId,
    classId: spec.classId,
    level: 10, // mesmo nível usado pelos comps reais de M8 (tools/balance)
    exp: 0,
    awakening: 0,
    imprint: 0,
    talents: {},
    equipment: {
      weapon: spec.weaponId ?? null,
      helmet: null,
      armor: null,
      necklace: spec.necklaceId ?? null,
      ring: null,
      boots: null,
    },
    weaponType: classDef.allowedWeapons[0] ?? 'sword',
    duelSkills,
    mapSkills: [],
    tacticsScript: [{ enabled: true, skillId: hasSpecial ? specialSkillId : basicSkillId, conditions: [] }],
  };
}

export interface CampaignMapContent {
  readonly setup: BattleSetup;
  readonly heroesByUnitId: Readonly<Record<Id, Hero>>;
}

function buildCampaignMap(mapId: Id, unitSpecs: readonly CampaignUnitSpec[]): CampaignMapContent {
  const arenaMap = catalog.maps[mapId];
  if (!arenaMap) throw new Error(`mapa de campanha desconhecido no catálogo: ${mapId}`);

  const heroesByUnitId: Record<Id, Hero> = {};
  const placements: HeroPlacement[] = unitSpecs.map((spec) => {
    const hero = buildHeroFromSpec(spec);
    heroesByUnitId[spec.unitId] = hero;
    const equippedItems = [spec.weaponId, spec.necklaceId]
      .filter((id): id is Id => id !== undefined)
      .map((id) => catalog.items[id])
      .filter((item): item is NonNullable<typeof item> => item !== undefined);
    return {
      unitId: spec.unitId,
      hero,
      classDef: catalog.classes[spec.classId]!,
      equippedItems,
      side: spec.side,
      pos: spec.pos,
      height: 0,
      // Sem `aiArchetype`: unidades inimigas da campanha não são controladas por IA
      // nesta fatia (comportamento preservado de M6 — decisão de mecânica nova fica
      // pra M11, não M9).
    };
  });

  const setup = buildBattleSetupFromHeroes({
    placements,
    map: arenaMap.grid,
    permadeath: 'casual', // mesmo default já usado pela campanha desde M6
    winCondition: arenaMap.winCondition,
    effectDefs: {},
    initialValor: arenaMap.initialValor,
    itemSets: catalog.itemSets,
    skillsCatalog: catalog.skills,
    weaponDuelRanges: catalog.weaponDuelRanges,
    baselineReactionSkillIds: catalog.baselineReactionSkillIds,
  });

  return { setup, heroesByUnitId };
}

function playerUnit(pos: Coord): CampaignUnitSpec {
  return {
    unitId: 'hero-jogador',
    classId: 'class-espadachim',
    pos,
    side: 'player',
    weaponId: 'item-arma-espadachim',
    necklaceId: 'item-colar-forca',
  };
}

const campaignMap1 = buildCampaignMap(CAMPAIGN_MAP_IDS[0]!, [
  playerUnit({ x: 1, y: 7 }),
  { unitId: 'unit-bandido-1', classId: 'class-guerreiro', pos: { x: 12, y: 4 }, side: 'enemy', weaponId: 'item-arma-guerreiro', necklaceId: 'item-colar-forca' },
  { unitId: 'unit-bandido-2', classId: 'class-lanceiro', pos: { x: 12, y: 10 }, side: 'enemy', weaponId: 'item-arma-lanceiro', necklaceId: 'item-colar-forca' },
]);

const campaignMap2 = buildCampaignMap(CAMPAIGN_MAP_IDS[1]!, [
  playerUnit({ x: 1, y: 7 }),
  { unitId: 'unit-patrulheiro-1', classId: 'class-lanceiro', pos: { x: 11, y: 3 }, side: 'enemy', weaponId: 'item-arma-lanceiro', necklaceId: 'item-colar-forca' },
  { unitId: 'unit-patrulheiro-2', classId: 'class-guerreiro', pos: { x: 13, y: 7 }, side: 'enemy', weaponId: 'item-arma-guerreiro', necklaceId: 'item-colar-forca' },
  { unitId: 'unit-patrulheiro-3', classId: 'class-arqueiro', pos: { x: 11, y: 11 }, side: 'enemy', weaponId: 'item-arma-arqueiro', necklaceId: 'item-colar-forca' },
]);

const campaignMap3 = buildCampaignMap(CAMPAIGN_MAP_IDS[2]!, [
  playerUnit({ x: 1, y: 7 }),
  { unitId: 'unit-guarda-1', classId: 'class-couracado', pos: { x: 10, y: 6 }, side: 'enemy', weaponId: 'item-arma-couracado', necklaceId: 'item-colar-forca' },
  { unitId: 'unit-guarda-2', classId: 'class-grifeiro', pos: { x: 10, y: 8 }, side: 'enemy', weaponId: 'item-arma-grifeiro', necklaceId: 'item-colar-forca' },
  // Classe promovida (M8 sub-sessão 4) — sem arma própria autorada ainda, equipamento
  // fica vazio em vez de inventar um item novo.
  { unitId: 'unit-chefe', classId: 'class-mestre-espadachim', pos: { x: 13, y: 7 }, side: 'enemy' },
]);

export const campaignMaps: readonly CampaignMapContent[] = [campaignMap1, campaignMap2, campaignMap3];
