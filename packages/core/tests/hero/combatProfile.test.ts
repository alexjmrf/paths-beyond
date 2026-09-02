import { describe, expect, it } from 'vitest';
import { MELEE_ASSIST_RANGE, resolveHeroCombatProfile } from '../../src/hero/combatProfile.js';
import { resolveHeroStatSheet } from '../../src/hero/resolve.js';
import { SET_SPECIAL_DUELISTA, SET_SPECIAL_RESERVA } from '../../src/items/sets.js';
import type { ClassDef, Hero } from '../../src/hero/types.js';
import type { ItemInstance, ItemSet } from '../../src/items/types.js';
import type { SkillDef } from '../../src/skills/types.js';
import type { StatSheet } from '../../src/stats/types.js';
import type { ColumnTalentNode } from '../../src/talents/columnTree.js';
import type { WeaponType } from '../../src/tactics/types.js';

function buildStatCurve(): Partial<StatSheet>[] {
  return Array.from({ length: 60 }, () => ({ hp: 1000, atk: 200, def: 100, spd: 90 }));
}

// M17 2/N — a árvore saiu da CLASSE e virou parâmetro de quem resolve o herói: os nós
// abaixo são a árvore do personagem (§8.1), passada por `talentTree` em cada chamada.
const talentTree: readonly ColumnTalentNode[] = [
  {
    id: 'talent-arsenal',
    column: 'a',
    row: 1,
    maxRank: 1,
    effects: [
      { t: 'grantSkill', skillId: 'skill-golpe-especial' },
      { t: 'grantReaction', reactionId: 'react-escudo-reativo' },
      { t: 'modifySkill', skillId: 'skill-basico', patch: { multiplier: 2000 } },
    ],
  },
  {
    id: 'talent-reserva',
    column: 'b',
    row: 1,
    maxRank: 1,
    effects: [
      { t: 'maxAp', n: 1 },
      { t: 'maxPp', n: 1 },
    ],
  },
];

const meleeClass: ClassDef = {
  id: 'classe-melee',
  name: 'Classe Melee',
  tier: 'base',
  unitType: 'infantry',
  moveType: 'foot',
  moveRange: 4,
  allowedWeapons: ['sword', 'bow'],
  basePools: { ap: 2, pp: 2 },
  statCurve: buildStatCurve(),
  awakeningMultipliers: [1000, 1000, 1000, 1000, 1000, 1000, 1000],
  promotionFlat: [],
  imprintFlat: [[], [], [], [], [], []],
};

const baseHero: Hero = {
  id: 'heroi-combate',
  classId: meleeClass.id,
  level: 1,
  exp: 0,
  awakening: 0,
  imprint: 0,
  talents: { 'talent-arsenal': 1 },
  equipment: { weapon: null, helmet: null, armor: null, necklace: null, ring: null, boots: null },
  weaponType: 'sword',
  duelSkills: ['skill-basico', 'skill-inexistente'],
  mapSkills: ['skill-de-mapa'],
  tacticsScript: [],
};

const skillsCatalog: Readonly<Record<string, SkillDef>> = {
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
  'skill-de-mapa': {
    id: 'skill-de-mapa',
    name: 'Marcha Forçada',
    kind: 'map',
    apCost: 1,
    cooldown: 2,
    multiplier: 0,
    flat: 0,
    scalesWith: 'atk',
    effects: [],
    tags: [],
  },
  'skill-golpe-especial': {
    id: 'skill-golpe-especial',
    name: 'Golpe Especial',
    kind: 'duel',
    apCost: 2,
    cooldown: 1,
    multiplier: 1800,
    flat: 0,
    scalesWith: 'atk',
    effects: [],
    tags: ['physical'],
  },
  'react-counter': {
    id: 'react-counter',
    name: 'Contra-atacar',
    kind: 'reaction',
    apCost: 0,
    ppCost: 1,
    cooldown: 0,
    multiplier: 800,
    flat: 0,
    scalesWith: 'atk',
    trigger: 'onAttacked',
    effects: [],
    tags: ['physical'],
  },
  'react-defend': {
    id: 'react-defend',
    name: 'Defender',
    kind: 'reaction',
    apCost: 0,
    ppCost: 1,
    cooldown: 0,
    multiplier: 0,
    flat: 0,
    scalesWith: 'atk',
    trigger: 'onAttacked',
    effects: [],
    tags: [],
  },
  'react-escudo-reativo': {
    id: 'react-escudo-reativo',
    name: 'Escudo Reativo',
    kind: 'reaction',
    apCost: 0,
    ppCost: 1,
    cooldown: 0,
    multiplier: 0,
    flat: 500,
    scalesWith: 'def',
    trigger: 'onAttacked',
    effects: [],
    tags: [],
  },
};

const itemSets: Readonly<Record<string, ItemSet>> = {};

// §7.4 (M10 sub-sessão 6/N) — sets `special` de 4 peças, pra provar que o perfil de
// combate passa a carregar os efeitos comportamentais do equipamento (e que Reserva soma
// no startingAp pelo mesmo caminho do bônus de talento `maxAp`).
const specialItemSets: Readonly<Record<string, ItemSet>> = {
  'set-reserva': {
    id: 'set-reserva',
    name: 'Reserva',
    effects: [{ t: 'special', pieces: 4, effectId: SET_SPECIAL_RESERVA, description: '+1 AP máximo e rest recupera +2 AP.' }],
  },
  'set-duelista': {
    id: 'set-duelista',
    name: 'Duelista',
    effects: [{ t: 'special', pieces: 4, effectId: SET_SPECIAL_DUELISTA, description: 'Contra-atacar custa 0 PP na primeira troca.' }],
  },
};

function piecesOf(setId: string, count: number): ItemInstance[] {
  const slots: ItemInstance['slot'][] = ['weapon', 'helmet', 'armor', 'necklace', 'ring', 'boots'];
  return slots.slice(0, count).map((slot) => ({
    id: `${setId}-${slot}`,
    setId,
    slot,
    rarity: 'common' as const,
    ilvl: 58,
    mainstat: { stat: 'atk' as const, value: 10 },
    substats: [],
    enhance: 0 as const,
    reforged: false,
  }));
}

// bow=3 (não 2, o mesmo valor de MELEE_ASSIST_RANGE) de propósito: prova que
// assistRange vem de fato do duelRange da arma ranged, não coincide por acaso.
const weaponDuelRanges: Readonly<Record<WeaponType, number>> = {
  sword: 1,
  axe: 1,
  spear: 1,
  bow: 3,
  arcane: 2,
  nature: 2,
  holy: 2,
};

// Um dos ids não existe no catálogo, pra provar que reações ausentes são ignoradas
// silenciosamente (mesmo precedente de resolveTalentEffects com nós desconhecidos).
const baselineReactionSkillIds = ['react-counter', 'react-defend', 'react-ausente'];

describe('resolveHeroCombatProfile — Hero→ClassDef→talentos até o perfil de combate completo (M7)', () => {
  it('delega os stats pra resolveHeroStatSheet sem recalcular nada por conta própria', () => {
    const profile = resolveHeroCombatProfile({
      hero: baseHero,
      classDef: meleeClass,
      talentTree,
      equippedItems: [],
      itemSets,
      skillsCatalog,
      weaponDuelRanges,
      baselineReactionSkillIds,
    });
    const expectedStats = resolveHeroStatSheet({ hero: baseHero, classDef: meleeClass, talentTree, equippedItems: [], itemSets });
    expect(profile.stats).toEqual(expectedStats);
  });

  it('unitType vem da classe, weaponType vem do herói, moveType/moveRange vêm da classe', () => {
    const profile = resolveHeroCombatProfile({
      hero: baseHero,
      classDef: meleeClass,
      talentTree,
      equippedItems: [],
      itemSets,
      skillsCatalog,
      weaponDuelRanges,
      baselineReactionSkillIds,
    });
    expect(profile.unitType).toBe('infantry');
    expect(profile.weaponType).toBe('sword');
    expect(profile.moveType).toBe('foot');
    expect(profile.moveRange).toBe(4);
  });

  it('startingAp/startingPp vêm de classDef.basePools sem bônus de talento quando o talento não foi alocado', () => {
    const profile = resolveHeroCombatProfile({
      hero: baseHero,
      classDef: meleeClass,
      talentTree,
      equippedItems: [],
      itemSets,
      skillsCatalog,
      weaponDuelRanges,
      baselineReactionSkillIds,
    });
    expect(profile.startingAp).toBe(2);
    expect(profile.startingPp).toBe(2);
  });

  it('startingAp/startingPp somam o bônus de talento (maxAp/maxPp) quando alocado', () => {
    const heroWithReserva: Hero = { ...baseHero, talents: { ...baseHero.talents, 'talent-reserva': 1 } };
    const profile = resolveHeroCombatProfile({
      hero: heroWithReserva,
      classDef: meleeClass,
      talentTree,
      equippedItems: [],
      itemSets,
      skillsCatalog,
      weaponDuelRanges,
      baselineReactionSkillIds,
    });
    expect(profile.startingAp).toBe(3);
    expect(profile.startingPp).toBe(3);
  });

  it('§7.4 — setSpecialEffectIds vem do equipamento; vazio quando nada atinge o limiar', () => {
    const semSet = resolveHeroCombatProfile({
      hero: baseHero,
      classDef: meleeClass,
      talentTree,
      equippedItems: piecesOf('set-duelista', 3), // 3 de 4
      itemSets: specialItemSets,
      skillsCatalog,
      weaponDuelRanges,
      baselineReactionSkillIds,
    });
    expect(semSet.setSpecialEffectIds).toEqual([]);

    const comSet = resolveHeroCombatProfile({
      hero: baseHero,
      classDef: meleeClass,
      talentTree,
      equippedItems: piecesOf('set-duelista', 4),
      itemSets: specialItemSets,
      skillsCatalog,
      weaponDuelRanges,
      baselineReactionSkillIds,
    });
    expect(comSet.setSpecialEffectIds).toEqual([SET_SPECIAL_DUELISTA]);
  });

  it('§7.4 Reserva — "+1 AP máximo" soma no startingAp, pelo mesmo caminho do talento maxAp', () => {
    const profile = resolveHeroCombatProfile({
      hero: baseHero,
      classDef: meleeClass,
      talentTree,
      equippedItems: piecesOf('set-reserva', 4),
      itemSets: specialItemSets,
      skillsCatalog,
      weaponDuelRanges,
      baselineReactionSkillIds,
    });
    expect(profile.startingAp).toBe(3); // basePools.ap = 2, +1 do set
    expect(profile.startingPp).toBe(2); // Reserva não toca em PP
    expect(profile.setSpecialEffectIds).toEqual([SET_SPECIAL_RESERVA]);
  });

  it('§7.4 Reserva — o bônus do set e o do talento maxAp são cumulativos', () => {
    const heroWithReserva: Hero = { ...baseHero, talents: { ...baseHero.talents, 'talent-reserva': 1 } };
    const profile = resolveHeroCombatProfile({
      hero: heroWithReserva,
      classDef: meleeClass,
      talentTree,
      equippedItems: piecesOf('set-reserva', 4),
      itemSets: specialItemSets,
      skillsCatalog,
      weaponDuelRanges,
      baselineReactionSkillIds,
    });
    expect(profile.startingAp).toBe(4); // 2 base + 1 talento + 1 set
  });

  it('§7.4 Reserva — 3 peças não bastam: o startingAp fica no valor base', () => {
    const profile = resolveHeroCombatProfile({
      hero: baseHero,
      classDef: meleeClass,
      talentTree,
      equippedItems: piecesOf('set-reserva', 3),
      itemSets: specialItemSets,
      skillsCatalog,
      weaponDuelRanges,
      baselineReactionSkillIds,
    });
    expect(profile.startingAp).toBe(2);
  });

  it('arma corpo-a-corpo: duelRange vem da tabela e assistRange usa MELEE_ASSIST_RANGE', () => {
    const profile = resolveHeroCombatProfile({
      hero: baseHero,
      classDef: meleeClass,
      talentTree,
      equippedItems: [],
      itemSets,
      skillsCatalog,
      weaponDuelRanges,
      baselineReactionSkillIds,
    });
    expect(profile.duelRange).toBe(1);
    expect(profile.assistRange).toBe(MELEE_ASSIST_RANGE);
  });

  it('arma à distância: assistRange usa o próprio duelRange, não MELEE_ASSIST_RANGE', () => {
    const rangedHero: Hero = { ...baseHero, weaponType: 'bow' };
    const profile = resolveHeroCombatProfile({
      hero: rangedHero,
      classDef: meleeClass,
      talentTree,
      equippedItems: [],
      itemSets,
      skillsCatalog,
      weaponDuelRanges,
      baselineReactionSkillIds,
    });
    expect(profile.duelRange).toBe(3);
    expect(profile.assistRange).toBe(3);
    expect(profile.assistRange).not.toBe(MELEE_ASSIST_RANGE);
  });

  it('knownSkills junta duelSkills+mapSkills+skills concedidas por talento, ignorando ids ausentes do catálogo', () => {
    const profile = resolveHeroCombatProfile({
      hero: baseHero,
      classDef: meleeClass,
      talentTree,
      equippedItems: [],
      itemSets,
      skillsCatalog,
      weaponDuelRanges,
      baselineReactionSkillIds,
    });
    expect(Object.keys(profile.knownSkills).sort()).toEqual(
      ['react-counter', 'react-defend', 'react-escudo-reativo', 'skill-basico', 'skill-de-mapa', 'skill-golpe-especial'].sort(),
    );
    expect(profile.knownSkills['skill-inexistente']).toBeUndefined();
  });

  it('reactionScript = baseline (habilitada, sem condições) + reações concedidas por talento, ignorando ids ausentes do catálogo', () => {
    const profile = resolveHeroCombatProfile({
      hero: baseHero,
      classDef: meleeClass,
      talentTree,
      equippedItems: [],
      itemSets,
      skillsCatalog,
      weaponDuelRanges,
      baselineReactionSkillIds,
    });
    expect(profile.reactionScript).toEqual([
      { enabled: true, skillId: 'react-counter', conditions: [] },
      { enabled: true, skillId: 'react-defend', conditions: [] },
      { enabled: true, skillId: 'react-escudo-reativo', conditions: [] },
    ]);
  });

  it('skillPatches de talento são aplicados à skill conhecida correspondente', () => {
    const profile = resolveHeroCombatProfile({
      hero: baseHero,
      classDef: meleeClass,
      talentTree,
      equippedItems: [],
      itemSets,
      skillsCatalog,
      weaponDuelRanges,
      baselineReactionSkillIds,
    });
    expect(profile.knownSkills['skill-basico']?.multiplier).toBe(2000);
    expect(profile.knownSkills['skill-basico']?.name).toBe('Golpe Básico');
  });

  it('tacticsScript passa direto do herói, sem transformação', () => {
    const heroWithScript: Hero = {
      ...baseHero,
      tacticsScript: [{ enabled: true, skillId: 'skill-basico', conditions: [] }],
    };
    const profile = resolveHeroCombatProfile({
      hero: heroWithScript,
      classDef: meleeClass,
      talentTree,
      equippedItems: [],
      itemSets,
      skillsCatalog,
      weaponDuelRanges,
      baselineReactionSkillIds,
    });
    expect(profile.tacticsScript).toBe(heroWithScript.tacticsScript);
  });

  it('sem talentos alocados, nenhuma skill/reação extra é concedida', () => {
    const noTalentsHero: Hero = { ...baseHero, talents: {} };
    const profile = resolveHeroCombatProfile({
      hero: noTalentsHero,
      classDef: meleeClass,
      talentTree,
      equippedItems: [],
      itemSets,
      skillsCatalog,
      weaponDuelRanges,
      baselineReactionSkillIds,
    });
    expect(Object.keys(profile.knownSkills).sort()).toEqual(['react-counter', 'react-defend', 'skill-basico', 'skill-de-mapa'].sort());
    expect(profile.reactionScript).toEqual([
      { enabled: true, skillId: 'react-counter', conditions: [] },
      { enabled: true, skillId: 'react-defend', conditions: [] },
    ]);
    expect(profile.knownSkills['skill-basico']?.multiplier).toBe(1000);
  });

  it('é determinística: mesma entrada produz o mesmo hash duas vezes', () => {
    const input = {
      hero: baseHero,
      classDef: meleeClass,
      talentTree,
      equippedItems: [],
      itemSets,
      skillsCatalog,
      weaponDuelRanges,
      baselineReactionSkillIds,
    };
    const a = JSON.stringify(resolveHeroCombatProfile(input));
    const b = JSON.stringify(resolveHeroCombatProfile(input));
    expect(a).toBe(b);
  });

  it('é pura: não muta hero/classDef recebidos', () => {
    const frozenHero = structuredClone(baseHero);
    const frozenClass = structuredClone(meleeClass);
    resolveHeroCombatProfile({
      hero: baseHero,
      classDef: meleeClass,
      talentTree,
      equippedItems: [],
      itemSets,
      skillsCatalog,
      weaponDuelRanges,
      baselineReactionSkillIds,
    });
    expect(baseHero).toEqual(frozenHero);
    expect(meleeClass).toEqual(frozenClass);
  });
});
