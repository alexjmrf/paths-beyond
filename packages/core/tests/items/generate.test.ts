import { describe, expect, it } from 'vitest';
import { generateItem, type GenerateItemInput } from '../../src/items/generate.js';
import type { MainstatWeightEntry, SubstatWeightEntry } from '../../src/items/types.js';

const substatWeights: SubstatWeightEntry[] = [
  { stat: 'atk', weight: 40, valueRange: { min: 10, max: 20 } },
  { stat: 'def', weight: 30, valueRange: { min: 8, max: 16 } },
  { stat: 'spd', weight: 20, valueRange: { min: 2, max: 6 } },
  { stat: 'chc', weight: 10, valueRange: { min: 20, max: 40 } },
];

const mainstatWeights: MainstatWeightEntry[] = [
  { slot: 'weapon', stat: 'atk', weight: 100, valueRange: { min: 100, max: 200 } },
  { slot: 'helmet', stat: 'hp', weight: 100, valueRange: { min: 500, max: 1000 } },
  { slot: 'armor', stat: 'def', weight: 100, valueRange: { min: 100, max: 200 } },
  { slot: 'necklace', stat: 'atk', weight: 30, valueRange: { min: 50, max: 100 } },
  { slot: 'necklace', stat: 'chc', weight: 40, valueRange: { min: 30, max: 60 } },
  { slot: 'necklace', stat: 'chd', weight: 30, valueRange: { min: 100, max: 200 } },
];

function baseInput(overrides: Partial<GenerateItemInput> = {}): GenerateItemInput {
  return {
    id: 'item-1',
    setId: 'set-ataque',
    slot: 'helmet',
    rarity: 'epic',
    ilvl: 80,
    seed: 42,
    substatWeights,
    mainstatWeights,
    ...overrides,
  };
}

describe('generateItem — mainstat (§7.1)', () => {
  it('weapon/helmet/armor têm mainstat fixo (atk/hp/def)', () => {
    expect(generateItem(baseInput({ slot: 'weapon' })).mainstat.stat).toBe('atk');
    expect(generateItem(baseInput({ slot: 'helmet' })).mainstat.stat).toBe('hp');
    expect(generateItem(baseInput({ slot: 'armor' })).mainstat.stat).toBe('def');
  });

  it('necklace/ring/boots sorteiam o mainstat entre os candidatos por peso', () => {
    const item = generateItem(baseInput({ slot: 'necklace', id: 'necklace-1' }));
    expect(['atk', 'chc', 'chd']).toContain(item.mainstat.stat);
  });

  it('o valor do mainstat cai dentro da faixa declarada', () => {
    const item = generateItem(baseInput({ slot: 'weapon' }));
    expect(item.mainstat.value).toBeGreaterThanOrEqual(100);
    expect(item.mainstat.value).toBeLessThanOrEqual(200);
  });
});

describe('generateItem — substats (§7.2, §7.3)', () => {
  it('a quantidade de substats iniciais segue a raridade: common=1, rare=2, heroic=3, epic=4', () => {
    expect(generateItem(baseInput({ rarity: 'common' })).substats).toHaveLength(1);
    expect(generateItem(baseInput({ rarity: 'rare' })).substats).toHaveLength(2);
    expect(generateItem(baseInput({ rarity: 'heroic' })).substats).toHaveLength(3);
    expect(generateItem(baseInput({ rarity: 'epic' })).substats).toHaveLength(4);
  });

  it('nunca repete o mesmo stat em dois substats do mesmo item', () => {
    const item = generateItem(baseInput({ rarity: 'epic' }));
    const stats = item.substats.map((s) => s.stat);
    expect(new Set(stats).size).toBe(stats.length);
  });

  it('substat nunca repete o stat que já é o mainstat do item', () => {
    // helmet -> mainstat hp, que nem está nos substatWeights, então isso é garantido
    // trivialmente aqui; o teste abaixo cobre o caso em que colidiria.
    const collidingWeights: SubstatWeightEntry[] = [...substatWeights, { stat: 'hp', weight: 999, valueRange: { min: 1, max: 1 } }];
    const item = generateItem(baseInput({ slot: 'helmet', substatWeights: collidingWeights, rarity: 'epic' }));
    expect(item.substats.some((s) => s.stat === 'hp')).toBe(false);
  });

  it('valores de substat caem dentro da faixa declarada para o stat sorteado', () => {
    const item = generateItem(baseInput({ rarity: 'epic' }));
    for (const substat of item.substats) {
      const range = substatWeights.find((w) => w.stat === substat.stat)?.valueRange;
      expect(range).toBeDefined();
      expect(substat.value).toBeGreaterThanOrEqual(range!.min);
      expect(substat.value).toBeLessThanOrEqual(range!.max);
    }
  });

  it('item recém-gerado começa em enhance 0 e não reforjado', () => {
    const item = generateItem(baseInput());
    expect(item.enhance).toBe(0);
    expect(item.reforged).toBe(false);
  });
});

describe('generateItem — determinismo', () => {
  it('mesma seed e mesmo id produzem o mesmo item sempre', () => {
    const a = generateItem(baseInput());
    const b = generateItem(baseInput());
    expect(a).toEqual(b);
  });

  it('ids diferentes produzem itens diferentes com a mesma seed', () => {
    const a = generateItem(baseInput({ id: 'item-a' }));
    const b = generateItem(baseInput({ id: 'item-b' }));
    expect(a).not.toEqual(b);
  });
});

describe('generateItem — distribuição de pesos em massa (critério de aceite do M4)', () => {
  it('100.000 itens gerados respeitam a distribuição de pesos declarada dentro de ±2%', () => {
    const totalWeight = substatWeights.reduce((sum, w) => sum + w.weight, 0);
    const counts: Record<string, number> = {};
    for (const w of substatWeights) counts[w.stat] = 0;

    const N = 100_000;
    for (let i = 0; i < N; i++) {
      // rarity 'common' -> exatamente 1 substat por item, sem interação de "sem
      // reposição" entre múltiplas posições -- mede o sorteio ponderado isoladamente.
      const item = generateItem(baseInput({ id: `bulk-${i}`, rarity: 'common', slot: 'helmet' }));
      const stat = item.substats[0]!.stat;
      counts[stat] = (counts[stat] ?? 0) + 1;
    }

    for (const w of substatWeights) {
      const expectedFraction = w.weight / totalWeight;
      const observedFraction = (counts[w.stat] ?? 0) / N;
      expect(Math.abs(observedFraction - expectedFraction)).toBeLessThanOrEqual(0.02);
    }
  });
});
