import { describe, expect, it } from 'vitest';
import { attemptEnhance } from '../../src/items/enhance.js';
import type { EnhanceRates, ItemInstance, SubstatWeightEntry } from '../../src/items/types.js';

const substatWeights: SubstatWeightEntry[] = [
  { stat: 'atk', weight: 25, valueRange: { min: 10, max: 20 } },
  { stat: 'def', weight: 25, valueRange: { min: 8, max: 16 } },
  { stat: 'spd', weight: 25, valueRange: { min: 2, max: 6 } },
  { stat: 'chc', weight: 25, valueRange: { min: 20, max: 40 } },
];

const alwaysSucceeds: EnhanceRates = { toThree: 1000, toSix: 1000, toNine: 1000, toTwelve: 1000, toFifteen: 1000 };
const alwaysFails: EnhanceRates = { toThree: 0, toSix: 0, toNine: 0, toTwelve: 0, toFifteen: 0 };

function baseItem(overrides: Partial<ItemInstance> = {}): ItemInstance {
  return {
    id: 'item-1',
    setId: 'set-ataque',
    slot: 'helmet',
    rarity: 'rare',
    ilvl: 80,
    mainstat: { stat: 'hp', value: 800 },
    substats: [{ stat: 'atk', value: 15, rolls: 1 }],
    enhance: 0,
    reforged: false,
    ...overrides,
  };
}

describe('attemptEnhance — os 6 marcos (§7.3, decisão registrada em DECISIONS.md)', () => {
  it('sucesso avança exatamente para o próximo marco (não pula nem soma 1)', () => {
    const result = attemptEnhance({ item: baseItem({ enhance: 0 }), seed: 1, rates: alwaysSucceeds, substatWeights });
    expect(result.success).toBe(true);
    expect(result.item.enhance).toBe(3);
  });

  it('adiciona um substat novo quando há menos de 4', () => {
    const item = baseItem({ enhance: 0, substats: [{ stat: 'atk', value: 15, rolls: 1 }] });
    const result = attemptEnhance({ item, seed: 1, rates: alwaysSucceeds, substatWeights });
    expect(result.item.substats).toHaveLength(2);
    expect(result.item.substats[1]?.stat).not.toBe('atk');
  });

  it('rola um substat existente para cima quando já há 4 (não adiciona um 5º)', () => {
    const item = baseItem({
      enhance: 0,
      rarity: 'epic',
      substats: [
        { stat: 'atk', value: 15, rolls: 1 },
        { stat: 'def', value: 10, rolls: 1 },
        { stat: 'spd', value: 4, rolls: 1 },
        { stat: 'chc', value: 30, rolls: 1 },
      ],
    });
    const result = attemptEnhance({ item, seed: 1, rates: alwaysSucceeds, substatWeights });
    expect(result.item.substats).toHaveLength(4);
    const totalRolls = result.item.substats.reduce((sum, s) => sum + s.rolls, 0);
    expect(totalRolls).toBe(5); // 4 iniciais (rolls=1 cada) + 1 subida
    const increased = result.item.substats.find((s) => s.rolls === 2);
    expect(increased).toBeDefined();
    expect(increased!.value).toBeGreaterThan(item.substats.find((s) => s.stat === increased!.stat)!.value);
  });

  it('falha não altera o item (enhance e substats permanecem os mesmos)', () => {
    const item = baseItem({ enhance: 0 });
    const result = attemptEnhance({ item, seed: 1, rates: alwaysFails, substatWeights });
    expect(result.success).toBe(false);
    expect(result.item).toEqual(item);
  });

  it('item já em +15 não tenta mais nada', () => {
    const item = baseItem({ enhance: 15 });
    const result = attemptEnhance({ item, seed: 1, rates: alwaysSucceeds, substatWeights });
    expect(result.success).toBe(false);
    expect(result.item.enhance).toBe(15);
  });

  it('é determinístico: mesma seed e mesmo item produzem o mesmo resultado sempre', () => {
    const item = baseItem({ enhance: 6 });
    const a = attemptEnhance({ item, seed: 77, rates: alwaysSucceeds, substatWeights });
    const b = attemptEnhance({ item, seed: 77, rates: alwaysSucceeds, substatWeights });
    expect(a).toEqual(b);
  });

  it('sobe do +0 ao +15 em 5 tentativas bem-sucedidas, nunca passando de 4 substats', () => {
    let item = baseItem({ enhance: 0, substats: [] });
    for (let i = 0; i < 5; i++) {
      const result = attemptEnhance({ item, seed: 99, rates: alwaysSucceeds, substatWeights });
      expect(result.success).toBe(true);
      item = result.item;
      expect(item.substats.length).toBeLessThanOrEqual(4);
    }
    expect(item.enhance).toBe(15);
  });
});
