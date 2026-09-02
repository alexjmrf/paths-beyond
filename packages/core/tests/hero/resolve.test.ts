import { describe, expect, it } from 'vitest';
import { resolveHeroStatSheet } from '../../src/hero/resolve.js';
import type { ClassDef, Hero } from '../../src/hero/types.js';
import type { ItemInstance, ItemSet } from '../../src/items/types.js';
import type { StatSheet } from '../../src/stats/types.js';
import type { ColumnTalentNode } from '../../src/talents/columnTree.js';

// Mesmos números do snapshot de M1 (packages/core/tests/stats/aggregate.test.ts) —
// montados aqui a partir de Hero+ClassDef+itens+talentos reais em vez de um
// AggregateStatsInput já pronto, pra provar que resolveHeroStatSheet produz exatamente
// o mesmo AggregateStatsInput internamente.
function buildStatCurve(level10: Partial<StatSheet>): Partial<StatSheet>[] {
  const curve: Partial<StatSheet>[] = [];
  for (let i = 0; i < 60; i++) curve.push(i === 9 ? level10 : {});
  return curve;
}

function buildAwakeningMultipliers(atThree: number): number[] {
  return [1000, 1000, 1000, atThree, 1000, 1000, 1000];
}

function buildImprintFlat(atTwo: readonly { readonly stat: 'atk' | 'chc'; readonly flat: number }[]) {
  const table: { readonly stat: 'atk' | 'chc'; readonly flat: number }[][] = [[], [], [], [], [], []];
  table[2] = [...atTwo];
  return table;
}

// M17 2/N — a árvore saiu da CLASSE e virou parâmetro de quem resolve o herói: os nós
// abaixo são a árvore do personagem (§8.1), passada por `talentTree` em cada chamada.
const talentTree: readonly ColumnTalentNode[] = [
  {
    id: 't1',
    column: 'a',
    row: 1,
    maxRank: 1,
    effects: [
      { t: 'stat', stat: 'def', flat: 80 },
      { t: 'stat', stat: 'spd', flat: 20 },
      { t: 'stat', stat: 'def', pct: 50 },
    ],
  },
];

const classDef: ClassDef = {
  id: 'classe-fixa',
  name: 'Classe Fixa',
  tier: 'spec',
  unitType: 'infantry',
  moveType: 'foot',
  moveRange: 5,
  allowedWeapons: ['sword'],
  basePools: { ap: 3, pp: 2 },
  statCurve: buildStatCurve({ hp: 5000, atk: 800, def: 500, spd: 100 }),
  awakeningMultipliers: buildAwakeningMultipliers(1100),
  promotionFlat: [{ stat: 'hp', flat: 200 }],
  imprintFlat: buildImprintFlat([
    { stat: 'atk', flat: 50 },
    { stat: 'chc', flat: 50 },
  ]),
};

const itemSets: Readonly<Record<string, ItemSet>> = {
  'set-x': {
    id: 'set-x',
    name: 'Set X',
    effects: [
      { t: 'stat', pieces: 2, stat: 'atk', pct: 350 },
      { t: 'stat', pieces: 2, stat: 'hp', flat: 100 },
    ],
  },
};

const weapon: ItemInstance = {
  id: 'item-arma',
  setId: 'set-x',
  slot: 'weapon',
  rarity: 'epic',
  ilvl: 85,
  mainstat: { stat: 'atk', value: 300 },
  substats: [
    { stat: 'hp', value: 500, rolls: 2 },
    { stat: 'chc', value: 100, rolls: 1 },
  ],
  enhance: 15,
  reforged: false,
};

const helmet: ItemInstance = {
  id: 'item-elmo',
  setId: 'set-x',
  slot: 'helmet',
  rarity: 'epic',
  ilvl: 85,
  mainstat: { stat: 'hp', value: 300 },
  substats: [{ stat: 'chd', value: 200, rolls: 1 }],
  enhance: 15,
  reforged: false,
};

const hero: Hero = {
  id: 'heroi-fixo',
  classId: classDef.id,
  level: 10,
  exp: 0,
  awakening: 3,
  imprint: 2,
  talents: { t1: 1 },
  equipment: { weapon: weapon.id, helmet: helmet.id, armor: null, necklace: null, ring: null, boots: null },
  weaponType: 'sword',
  duelSkills: [],
  mapSkills: [],
  tacticsScript: [],
};

// Calculado à mão, passo a passo (§4.1), a partir da fixture acima. Difere do snapshot de
// aggregate.test.ts em hp/atk porque `equipmentPct` é sempre [] nesta milestone (itens só
// têm valor flat — decisão desta sub-sessão, ver DECISIONS.md); todo o resto da fixture
// (classAndImprintFlat, equipmentFlat, talentFlat/Pct, setBonus) reproduz os mesmos
// números do M1, então def/spd/chc/chd batem com aquele snapshot por não dependerem de %
// de equipamento.
//
// 1. base×awakening: hp=5500 atk=880 def=550 spd=110
// 2. +classAndImprintFlat (hp+200, atk+50, chc+50): hp=5700 atk=930 chc=50
// 3. +equipmentFlat (atk+300, hp+800, chc+100, chd+200): hp=6500 atk=1230 chc=150 chd=200
// 4. ×equipmentPct — vazio, sem mudança
// 5. +talentFlat (def+80, spd+20): def=630 spd=130
// 6. ×talentPct (def +5%): def=630+31=661
// 7. +setBonus (atk +35%: 1230+430=1660; hp+100: 6600)
const expectedSheet: StatSheet = {
  hp: 6600,
  atk: 1660,
  def: 661,
  spd: 130,
  chc: 150,
  chd: 200,
  eff: 0,
  efr: 0,
  pen: 0,
  heal: 0,
  lifesteal: 0,
  focus: 0,
  vigor: 0,
};

describe('resolveHeroStatSheet — Hero→ClassDef→itens→talentos até o stat sheet (§4.1/§4.2)', () => {
  it('bate exatamente com o snapshot esperado', () => {
    const result = resolveHeroStatSheet({ hero, classDef, talentTree, equippedItems: [weapon, helmet], itemSets });
    expect(result).toEqual(expectedSheet);
  });

  it('é determinística: mesma entrada produz o mesmo hash duas vezes', () => {
    const a = JSON.stringify(resolveHeroStatSheet({ hero, classDef, talentTree, equippedItems: [weapon, helmet], itemSets }));
    const b = JSON.stringify(resolveHeroStatSheet({ hero, classDef, talentTree, equippedItems: [weapon, helmet], itemSets }));
    expect(a).toBe(b);
  });

  it('sem itens equipados, cai pro baseline (classe + talento, sem bônus de set nem de equipamento)', () => {
    const result = resolveHeroStatSheet({ hero, classDef, talentTree, equippedItems: [], itemSets });
    // base (5000 atk800 def500 spd100) * awakening 1.1 + classAndImprintFlat (hp200 atk50 chc50)
    // + talentFlat/pct (def+80, spd+20, def+5%) — sem equipmentFlat/Pct nem setBonus.
    expect(result.hp).toBe(5700); // 5500 (5000*1.1) + 200
    expect(result.atk).toBe(930); // 880 (800*1.1) + 50
    expect(result.def).toBe(661); // (550 + 80) * 1.05 = 630 + 31
    expect(result.chc).toBe(50);
    expect(result.chd).toBe(0);
  });

  it('sem talentos alocados (allocation vazia), talentFlat/talentPct não afetam a agregação', () => {
    const noTalentsHero: Hero = { ...hero, talents: {} };
    const result = resolveHeroStatSheet({ hero: noTalentsHero, classDef, talentTree, equippedItems: [weapon, helmet], itemSets });
    // Mesmo resultado do snapshot, menos def+80 flat e sem o *1.5 de def.
    expect(result.def).toBe(550); // (500*1.1) sem nenhum bônus de talento
    expect(result.spd).toBe(110); // 100*1.1, sem +20 de talento
  });

  it('classe promovida: promotionFlat entra em classAndImprintFlat junto com imprintFlat', () => {
    const noImprintHero: Hero = { ...hero, imprint: 0 };
    const result = resolveHeroStatSheet({ hero: noImprintHero, classDef, talentTree, equippedItems: [], itemSets });
    // Só promotionFlat (hp+200) deveria contar — imprintFlat[0] é vazio.
    expect(result.hp).toBe(5700); // 5500 + 200, sem nenhum bônus de imprint
    expect(result.atk).toBe(880); // 800*1.1, sem +50 de imprint
  });

  it('é pura: não muta hero/classDef/itens recebidos', () => {
    const frozenHero = structuredClone(hero);
    const frozenClass = structuredClone(classDef);
    resolveHeroStatSheet({ hero, classDef, talentTree, equippedItems: [weapon, helmet], itemSets });
    expect(hero).toEqual(frozenHero);
    expect(classDef).toEqual(frozenClass);
  });
});
