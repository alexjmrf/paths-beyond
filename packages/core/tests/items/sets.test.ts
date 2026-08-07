import { describe, expect, it } from 'vitest';
import { resolveSetBonuses } from '../../src/items/sets.js';
import type { ItemInstance, ItemSet } from '../../src/items/types.js';

const attackSet: ItemSet = {
  id: 'set-ataque',
  name: 'Ataque',
  effects: [{ t: 'stat', pieces: 4, stat: 'atk', pct: 350 }],
};
const critSet: ItemSet = {
  id: 'set-critico',
  name: 'Crítico',
  effects: [{ t: 'stat', pieces: 2, stat: 'chc', flat: 120 }],
};
const duelistSet: ItemSet = {
  id: 'set-duelista',
  name: 'Duelista',
  effects: [{ t: 'special', pieces: 4, effectId: 'effect-duelista-0pp', description: 'Contra-atacar custa 0 PP na primeira troca.' }],
};

const itemSets: Record<string, ItemSet> = {
  [attackSet.id]: attackSet,
  [critSet.id]: critSet,
  [duelistSet.id]: duelistSet,
};

function item(setId: string, slot: ItemInstance['slot']): ItemInstance {
  return {
    id: `${setId}-${slot}`,
    setId,
    slot,
    rarity: 'epic',
    ilvl: 80,
    mainstat: { stat: 'atk', value: 100 },
    substats: [],
    enhance: 0,
    reforged: false,
  };
}

describe('resolveSetBonuses — §7.4', () => {
  it('nenhum bônus com menos peças que o limiar', () => {
    const equipped = [item(attackSet.id, 'weapon'), item(attackSet.id, 'helmet')]; // 2 de 4
    expect(resolveSetBonuses(equipped, itemSets)).toEqual([]);
  });

  it('aplica o bônus quando o número de peças atinge o limiar', () => {
    const equipped = [
      item(attackSet.id, 'weapon'),
      item(attackSet.id, 'helmet'),
      item(attackSet.id, 'armor'),
      item(attackSet.id, 'necklace'),
    ];
    expect(resolveSetBonuses(equipped, itemSets)).toEqual([{ stat: 'atk', flat: undefined, pct: 350 }]);
  });

  it('conta peças em excesso do limiar normalmente (5/4 ainda aplica)', () => {
    const equipped = [
      item(attackSet.id, 'weapon'),
      item(attackSet.id, 'helmet'),
      item(attackSet.id, 'armor'),
      item(attackSet.id, 'necklace'),
      item(attackSet.id, 'ring'),
    ];
    expect(resolveSetBonuses(equipped, itemSets)).toEqual([{ stat: 'atk', flat: undefined, pct: 350 }]);
  });

  it('resolve múltiplos sets simultaneamente (2pc de um, 4pc de outro)', () => {
    const equipped = [
      item(critSet.id, 'ring'),
      item(critSet.id, 'necklace'),
      item(attackSet.id, 'weapon'),
      item(attackSet.id, 'helmet'),
      item(attackSet.id, 'armor'),
      item(attackSet.id, 'boots'),
    ];
    const result = resolveSetBonuses(equipped, itemSets);
    expect(result).toContainEqual({ stat: 'chc', flat: 120, pct: undefined });
    expect(result).toContainEqual({ stat: 'atk', flat: undefined, pct: 350 });
  });

  it('itens de um set desconhecido (não em itemSets) são ignorados sem travar', () => {
    const equipped = [item('set-fantasma', 'weapon'), item('set-fantasma', 'helmet')];
    expect(resolveSetBonuses(equipped, itemSets)).toEqual([]);
  });

  it('efeitos `special` não viram StatModifier (corte de M4, ver DECISIONS.md)', () => {
    const equipped = [
      item(duelistSet.id, 'weapon'),
      item(duelistSet.id, 'helmet'),
      item(duelistSet.id, 'armor'),
      item(duelistSet.id, 'necklace'),
    ];
    expect(resolveSetBonuses(equipped, itemSets)).toEqual([]);
  });
});
