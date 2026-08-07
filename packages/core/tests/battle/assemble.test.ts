import { describe, expect, it } from 'vitest';
import { buildBattleSetupFromHeroes, buildBattleUnit } from '../../src/battle/assemble.js';
import type { HeroCombatProfile } from '../../src/hero/combatProfile.js';
import type { ClassDef, Hero } from '../../src/hero/types.js';
import type { ItemSet } from '../../src/items/types.js';
import type { SkillDef } from '../../src/skills/types.js';
import type { StatSheet } from '../../src/stats/types.js';
import type { GridMap, Terrain } from '../../src/grid/types.js';
import type { TalentNode } from '../../src/talents/types.js';

const stats: StatSheet = {
  hp: 5000,
  atk: 800,
  def: 400,
  spd: 100,
  chc: 50,
  chd: 1500,
  eff: 0,
  efr: 0,
  pen: 0,
  heal: 0,
  lifesteal: 0,
  focus: 0,
  vigor: 0,
};

const profile: HeroCombatProfile = {
  stats,
  unitType: 'infantry',
  weaponType: 'sword',
  duelRange: 1,
  assistRange: 2,
  moveType: 'foot',
  moveRange: 4,
  startingAp: 3,
  startingPp: 2,
  tacticsScript: [{ enabled: true, skillId: 'skill-basico', conditions: [] }],
  reactionScript: [{ enabled: true, skillId: 'react-counter', conditions: [] }],
  knownSkills: {
    'skill-basico': {
      id: 'skill-basico',
      name: 'Golpe Básico',
      kind: 'duel',
      apCost: 1,
      cooldown: 0,
      multiplier: 1000,
      flat: 0,
      scalesWith: 'atk',
      effects: [],
      tags: ['physical'],
    },
  },
};

describe('buildBattleUnit — HeroCombatProfile→BattleUnit (M7, sub-sessão 5)', () => {
  it('monta um BattleUnit completo: hp = stats.hp, ap/pp = startingAp/startingPp, sem estado de duelo/efeito prévio', () => {
    const unit = buildBattleUnit({
      unitId: 'unidade-1',
      heroId: 'heroi-1',
      side: 'player',
      pos: { x: 2, y: 3 },
      height: 1,
      profile,
    });

    expect(unit).toEqual({
      unitId: 'unidade-1',
      heroId: 'heroi-1',
      side: 'player',
      pos: { x: 2, y: 3 },
      height: 1,
      hp: 5000,
      ap: 3,
      pp: 2,
      hasActedThisRound: false,
      effects: [],
      cooldowns: {},
      stats,
      unitType: 'infantry',
      weaponType: 'sword',
      duelRange: 1,
      assistRange: 2,
      moveType: 'foot',
      moveRange: 4,
      tacticsScript: profile.tacticsScript,
      reactionScript: profile.reactionScript,
      knownSkills: profile.knownSkills,
    });
  });

  it('side/pos/height/unitId/heroId vêm inteiramente do input, não do profile', () => {
    const enemyUnit = buildBattleUnit({
      unitId: 'unidade-2',
      heroId: 'heroi-2',
      side: 'enemy',
      pos: { x: 0, y: 0 },
      height: 0,
      profile,
    });
    expect(enemyUnit.side).toBe('enemy');
    expect(enemyUnit.unitId).toBe('unidade-2');
    expect(enemyUnit.heroId).toBe('heroi-2');
    expect(enemyUnit.pos).toEqual({ x: 0, y: 0 });
    expect(enemyUnit.height).toBe(0);
  });

  it('é determinística: mesma entrada produz o mesmo hash duas vezes', () => {
    const input = { unitId: 'u1', heroId: 'h1', side: 'player' as const, pos: { x: 1, y: 1 }, height: 0 as const, profile };
    const a = JSON.stringify(buildBattleUnit(input));
    const b = JSON.stringify(buildBattleUnit(input));
    expect(a).toBe(b);
  });

  it('é pura: não muta o profile recebido', () => {
    const frozenProfile = structuredClone(profile);
    buildBattleUnit({ unitId: 'u1', heroId: 'h1', side: 'player', pos: { x: 1, y: 1 }, height: 0, profile });
    expect(profile).toEqual(frozenProfile);
  });
});

describe('buildBattleSetupFromHeroes — Hero[]→BattleSetup completo (M7, sub-sessão 7)', () => {
  const plain: Terrain = { id: 'plain', moveCost: { foot: 1, cavalry: 1, flying: 1, heavy: 1, aquatic: 2 }, defBonus: 0, evaBonus: 0, blocksSight: false };
  const map: GridMap = {
    width: 5,
    height: 5,
    tiles: Array.from({ length: 5 }, () => Array.from({ length: 5 }, () => ({ terrain: 'plain', height: 0 as const }))),
    terrains: { plain },
    zocEnabled: false,
  };

  const talentTree: readonly TalentNode[] = [];
  const classDef: ClassDef = {
    id: 'classe-setup',
    name: 'Classe Setup',
    tier: 'base',
    unitType: 'infantry',
    moveType: 'foot',
    moveRange: 4,
    allowedWeapons: ['sword'],
    basePools: { ap: 2, pp: 2 },
    statCurve: Array.from({ length: 60 }, () => ({ hp: 1000, atk: 200, def: 100, spd: 90 })),
    awakeningMultipliers: [1000, 1000, 1000, 1000, 1000, 1000, 1000],
    promotionFlat: [],
    imprintFlat: [[], [], [], [], [], []],
    talentTree,
  };

  const basico: SkillDef = {
    id: 'skill-basico', name: 'Golpe Básico', kind: 'duel', apCost: 1, cooldown: 0,
    multiplier: 1000, flat: 0, scalesWith: 'atk', effects: [], tags: ['physical'],
  };
  const skillsCatalog: Readonly<Record<string, SkillDef>> = { 'skill-basico': basico };
  const itemSets: Readonly<Record<string, ItemSet>> = {};
  const weaponDuelRanges = { sword: 1, axe: 1, spear: 1, bow: 2, arcane: 2, nature: 2, holy: 2 } as const;
  const baselineReactionSkillIds: readonly string[] = [];

  function buildHero(overrides: Partial<Hero> = {}): Hero {
    return {
      id: 'heroi-x',
      classId: classDef.id,
      level: 1,
      exp: 0,
      awakening: 0,
      imprint: 0,
      talents: {},
      equipment: { weapon: null, helmet: null, armor: null, necklace: null, ring: null, boots: null },
      weaponType: 'sword',
      duelSkills: ['skill-basico'],
      mapSkills: [],
      tacticsScript: [{ enabled: true, skillId: 'skill-basico', conditions: [] }],
      ...overrides,
    };
  }

  it('monta um BattleSetup completo a partir de heróis reais, um BattleUnit por placement', () => {
    const attacker = buildHero({ id: 'heroi-atacante' });
    const defender = buildHero({ id: 'heroi-defensor' });

    const setup = buildBattleSetupFromHeroes({
      placements: [
        { unitId: 'u-atk', hero: attacker, classDef, equippedItems: [], side: 'player', pos: { x: 0, y: 0 }, height: 0 },
        {
          unitId: 'u-def',
          hero: defender,
          classDef,
          equippedItems: [],
          side: 'enemy',
          pos: { x: 4, y: 4 },
          height: 0,
          aiArchetype: 'aggressive',
        },
      ],
      map,
      permadeath: 'classic',
      winCondition: { t: 'rout' },
      effectDefs: {},
      initialValor: 5,
      itemSets,
      skillsCatalog,
      weaponDuelRanges,
      baselineReactionSkillIds,
    });

    expect(setup.map).toBe(map);
    expect(setup.permadeath).toBe('classic');
    expect(setup.winCondition).toEqual({ t: 'rout' });
    expect(setup.initialValor).toBe(5);
    expect(setup.units).toHaveLength(2);

    const atkUnit = setup.units.find((u) => u.unitId === 'u-atk');
    expect(atkUnit?.heroId).toBe('heroi-atacante');
    expect(atkUnit?.side).toBe('player');
    expect(atkUnit?.pos).toEqual({ x: 0, y: 0 });
    expect(atkUnit?.aiArchetype).toBeUndefined();
    expect(atkUnit?.hp).toBe(1000); // stats.hp resolvido de verdade via resolveHeroCombatProfile
    expect(atkUnit?.knownSkills['skill-basico']).toBeDefined();

    const defUnit = setup.units.find((u) => u.unitId === 'u-def');
    expect(defUnit?.side).toBe('enemy');
    expect(defUnit?.aiArchetype).toBe('aggressive');
  });

  it('é determinística: mesma entrada produz o mesmo hash duas vezes', () => {
    const input = {
      placements: [
        { unitId: 'u-atk', hero: buildHero({ id: 'h1' }), classDef, equippedItems: [], side: 'player' as const, pos: { x: 0, y: 0 }, height: 0 as const },
      ],
      map,
      permadeath: 'classic' as const,
      winCondition: { t: 'rout' as const },
      effectDefs: {},
      initialValor: 5,
      itemSets,
      skillsCatalog,
      weaponDuelRanges,
      baselineReactionSkillIds,
    };
    const a = JSON.stringify(buildBattleSetupFromHeroes(input));
    const b = JSON.stringify(buildBattleSetupFromHeroes(input));
    expect(a).toBe(b);
  });
});
