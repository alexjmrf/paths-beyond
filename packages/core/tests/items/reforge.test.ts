import { describe, expect, it } from 'vitest';
import { applyReforge } from '../../src/items/reforge.js';
import type { ItemInstance, SubstatWeightEntry } from '../../src/items/types.js';

const substatWeights: SubstatWeightEntry[] = [
  { stat: 'atk', weight: 25, valueRange: { min: 10, max: 20 }, reforgeBonusPct: 200 }, // +20%
  { stat: 'def', weight: 25, valueRange: { min: 8, max: 16 } }, // sem bônus de reforge declarado
];

function baseItem(overrides: Partial<ItemInstance> = {}): ItemInstance {
  return {
    id: 'item-1',
    setId: 'set-ataque',
    slot: 'helmet',
    rarity: 'epic',
    ilvl: 100,
    mainstat: { stat: 'hp', value: 800 },
    substats: [
      { stat: 'atk', value: 100, rolls: 5 },
      { stat: 'def', value: 50, rolls: 3 },
    ],
    enhance: 15,
    reforged: false,
    ...overrides,
  };
}

describe('applyReforge — §7.3 ("enhance=15 e ilvl=100, uma vez por item")', () => {
  it('aplica o bônus garantido em todos os substats com reforgeBonusPct declarado', () => {
    const result = applyReforge({ item: baseItem(), substatWeights });
    expect(result.applied).toBe(true);
    const atk = result.item.substats.find((s) => s.stat === 'atk');
    expect(atk?.value).toBe(120); // 100 + 20%
  });

  it('substat sem reforgeBonusPct declarado não muda de valor', () => {
    const result = applyReforge({ item: baseItem(), substatWeights });
    const def = result.item.substats.find((s) => s.stat === 'def');
    expect(def?.value).toBe(50);
  });

  it('marca reforged=true', () => {
    const result = applyReforge({ item: baseItem(), substatWeights });
    expect(result.item.reforged).toBe(true);
  });

  it('rejeita item com enhance abaixo de +15', () => {
    const result = applyReforge({ item: baseItem({ enhance: 12 }), substatWeights });
    expect(result.applied).toBe(false);
    expect(result.item).toEqual(baseItem({ enhance: 12 }));
  });

  it('rejeita item com ilvl abaixo de 100', () => {
    const result = applyReforge({ item: baseItem({ ilvl: 99 }), substatWeights });
    expect(result.applied).toBe(false);
  });

  it('rejeita item já reforjado (uma vez por item)', () => {
    const result = applyReforge({ item: baseItem({ reforged: true }), substatWeights });
    expect(result.applied).toBe(false);
  });
});
