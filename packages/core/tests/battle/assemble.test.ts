import { describe, expect, it } from 'vitest';
import { buildBattleSetupFromHeroes, buildBattleUnit, type BuildBattleSetupFromHeroesInput } from '../../src/battle/assemble.js';
import type { EnemyDef } from '../../src/enemy/types.js';
import type { HeroCombatProfile } from '../../src/hero/combatProfile.js';
import type { ClassDef, Hero } from '../../src/hero/types.js';
import type { ItemSet } from '../../src/items/types.js';
import type { SkillDef } from '../../src/skills/types.js';
import type { StatSheet } from '../../src/stats/types.js';
import type { GridMap, Terrain } from '../../src/grid/types.js';

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
  setSpecialEffectIds: [],
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
      setSpecialEffectIds: profile.setSpecialEffectIds,
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

  // §8.1 (M17, 3/N) — o INIMIGO AUTORADO entrando pela mesma porta.
  //
  // `buildBattleSetupFromHeroes` passou a aceitar dois tipos de placement, e o que estes
  // testes protegem é que a diferença TERMINA na montagem: o `BattleUnit` que sai não
  // carrega marca de origem, porque se carregasse cada regra do jogo poderia perguntar
  // "isto é um inimigo?" — a porta pela qual entra a IA esperta que a regra 6 proíbe.
  describe('placement de inimigo autorado', () => {
    const patrulheiro: EnemyDef = {
      id: 'enemy-patrulheiro',
      name: 'Patrulheiro',
      stats: {
        hp: 980, atk: 150, def: 92, spd: 84, chc: 100, chd: 1500,
        eff: 0, efr: 0, pen: 0, heal: 0, lifesteal: 0, focus: 0, vigor: 0,
      },
      unitType: 'infantry',
      weaponType: 'sword',
      moveType: 'foot',
      moveRange: 3,
      pools: { ap: 2, pp: 2 },
      duelSkills: ['skill-basico'],
      mapSkills: [],
      tacticsScript: [{ enabled: true, skillId: 'skill-basico', conditions: [] }],
    };

    function montar(placements: BuildBattleSetupFromHeroesInput['placements']) {
      return buildBattleSetupFromHeroes({
        placements,
        map,
        permadeath: 'classic',
        winCondition: { t: 'rout' },
        effectDefs: {},
        initialValor: 5,
        itemSets,
        skillsCatalog,
        weaponDuelRanges,
        baselineReactionSkillIds,
        characterTalentTrees: {},
      });
    }

    it('vira BattleUnit com a força declarada, sem passar por Hero nem por classe', () => {
      const setup = montar([
        { unitId: 'u-inimigo', enemy: patrulheiro, side: 'enemy', pos: { x: 2, y: 2 }, height: 0, aiArchetype: 'aggressive' },
      ]);

      const unidade = setup.units[0]!;
      expect(unidade.hp).toBe(980);
      expect(unidade.stats).toEqual(patrulheiro.stats);
      expect(unidade.ap).toBe(2);
      expect(unidade.moveRange).toBe(3);
      expect(unidade.aiArchetype).toBe('aggressive');
    });

    it('`heroId` recebe o id do inimigo — de que ficha a unidade saiu, e não um herói inventado', () => {
      const setup = montar([
        { unitId: 'u-inimigo', enemy: patrulheiro, side: 'enemy', pos: { x: 2, y: 2 }, height: 0 },
      ]);
      expect(setup.units[0]!.heroId).toBe('enemy-patrulheiro');
    });

    it('os dois tipos de placement convivem no mesmo BattleSetup, na ordem em que entram', () => {
      const setup = montar([
        { unitId: 'u-heroi', hero: buildHero({ id: 'heroi-1' }), classDef, equippedItems: [], side: 'player', pos: { x: 0, y: 0 }, height: 0 },
        { unitId: 'u-inimigo', enemy: patrulheiro, side: 'enemy', pos: { x: 2, y: 2 }, height: 0 },
      ]);

      expect(setup.units.map((u) => u.unitId)).toEqual(['u-heroi', 'u-inimigo']);
      expect(setup.units.map((u) => u.side)).toEqual(['player', 'enemy']);
    });

    it('o BattleUnit do inimigo tem exatamente os mesmos campos que o de um herói', () => {
      // A prova de que a distinção não vazou para dentro do motor: um campo a mais (ou a
      // menos) num dos dois lados seria uma unidade que o resto do jogo trata diferente.
      const setup = montar([
        { unitId: 'u-heroi', hero: buildHero({ id: 'heroi-1' }), classDef, equippedItems: [], side: 'player', pos: { x: 0, y: 0 }, height: 0 },
        { unitId: 'u-inimigo', enemy: patrulheiro, side: 'enemy', pos: { x: 2, y: 2 }, height: 0 },
      ]);

      expect(Object.keys(setup.units[1]!).sort()).toEqual(Object.keys(setup.units[0]!).sort());
    });

    it('é determinística: mesma entrada, mesmo hash', () => {
      const placements: BuildBattleSetupFromHeroesInput['placements'] = [
        { unitId: 'u-inimigo', enemy: patrulheiro, side: 'enemy', pos: { x: 2, y: 2 }, height: 0 },
      ];
      expect(JSON.stringify(montar(placements))).toBe(JSON.stringify(montar(placements)));
    });
  });

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
      // M17 2/N — nenhuma unidade deste arquivo é personagem do elenco, então o catálogo
      // de árvores é vazio e todo mundo resolve com zero talentos. O que se mede aqui é a
      // montagem do `BattleSetup`, não a agregação de talento.
      characterTalentTrees: {},
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
      // M17 2/N — nenhuma unidade deste arquivo é personagem do elenco, então o catálogo
      // de árvores é vazio e todo mundo resolve com zero talentos. O que se mede aqui é a
      // montagem do `BattleSetup`, não a agregação de talento.
      characterTalentTrees: {},
    };
    const a = JSON.stringify(buildBattleSetupFromHeroes(input));
    const b = JSON.stringify(buildBattleSetupFromHeroes(input));
    expect(a).toBe(b);
  });
  // §5.6 (M12, sub-sessão 4/N) — `valorSkills` repassadas ao `BattleSetup`. O campo existe
  // em `BattleSetup`/`BattleState` desde M11 e é lido por `applyUseValor`, mas era
  // inalcançável por quem monta a batalha a partir de heróis: cliente, servidor e
  // `tools/balance` passam por aqui, e nenhum tinha como declarar as skills de Valor do
  // mapa. Na prática Valor era saldo no HUD sem nada que o gastasse.
  it('repassa as valorSkills declaradas para o BattleSetup', () => {
    const valorSkills = {
      'valor-teste': {
        id: 'valor-teste',
        name: 'Teste',
        cost: 2,
        kind: 'globalBuff' as const,
        payload: { effectId: 'effect-x' },
      },
    };

    const setup = buildBattleSetupFromHeroes({
      placements: [
        { unitId: 'u-atk', hero: buildHero(), classDef, equippedItems: [], side: 'player', pos: { x: 0, y: 0 }, height: 0 },
      ],
      map,
      permadeath: 'casual',
      winCondition: { t: 'rout' },
      effectDefs: {},
      initialValor: 5,
      itemSets,
      skillsCatalog,
      weaponDuelRanges,
      baselineReactionSkillIds,
      // M17 2/N — nenhuma unidade deste arquivo é personagem do elenco, então o catálogo
      // de árvores é vazio e todo mundo resolve com zero talentos. O que se mede aqui é a
      // montagem do `BattleSetup`, não a agregação de talento.
      characterTalentTrees: {},
      valorSkills,
    });

    expect(setup.valorSkills).toEqual(valorSkills);
  });

  it('omite o campo quando não há valorSkills — mapa sem Valor declarado é legítimo', () => {
    const setup = buildBattleSetupFromHeroes({
      placements: [
        { unitId: 'u-atk', hero: buildHero(), classDef, equippedItems: [], side: 'player', pos: { x: 0, y: 0 }, height: 0 },
      ],
      map,
      permadeath: 'casual',
      winCondition: { t: 'rout' },
      effectDefs: {},
      initialValor: 5,
      itemSets,
      skillsCatalog,
      weaponDuelRanges,
      baselineReactionSkillIds,
      // M17 2/N — nenhuma unidade deste arquivo é personagem do elenco, então o catálogo
      // de árvores é vazio e todo mundo resolve com zero talentos. O que se mede aqui é a
      // montagem do `BattleSetup`, não a agregação de talento.
      characterTalentTrees: {},
    });

    expect('valorSkills' in setup).toBe(false);
  });
});
