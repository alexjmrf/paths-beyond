import { describe, expect, it } from 'vitest';
import {
  SET_SPECIAL_DUELISTA,
  SET_SPECIAL_IMUNIDADE,
  SET_SPECIAL_RESERVA,
  resolveSetBonuses,
  resolveSetSpecialEffects,
} from '../../src/items/sets.js';
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
  effects: [{ t: 'special', pieces: 4, effectId: SET_SPECIAL_DUELISTA, description: 'Contra-atacar custa 0 PP na primeira troca.' }],
};
// Set misto: 2 peças dão stat, 4 mudam comportamento — exatamente o que §7.4 descreve.
const immunitySet: ItemSet = {
  id: 'set-imunidade',
  name: 'Imunidade',
  effects: [
    { t: 'stat', pieces: 2, stat: 'efr', flat: 100 },
    { t: 'special', pieces: 4, effectId: SET_SPECIAL_IMUNIDADE, description: 'Imune a debuffs na troca 1 do duelo.' },
  ],
};
// Fixture com limiar de 2 (e não 4) de propósito: prova que o resolvedor lê `pieces` do
// dado em vez de assumir que todo efeito `special` é de 4 peças.
const twoPieceSpecialSet: ItemSet = {
  id: 'set-reserva-teste',
  name: 'Reserva (fixture de 2 peças)',
  effects: [{ t: 'special', pieces: 2, effectId: SET_SPECIAL_RESERVA, description: '+1 AP máximo.' }],
};

const itemSets: Record<string, ItemSet> = {
  [attackSet.id]: attackSet,
  [critSet.id]: critSet,
  [duelistSet.id]: duelistSet,
  [immunitySet.id]: immunitySet,
  [twoPieceSpecialSet.id]: twoPieceSpecialSet,
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

// §7.4 (M10, sub-sessão 6/N) — a outra metade de um ItemSet: "2 peças dão stat, 4 peças
// mudam comportamento". `resolveSetBonuses` acima resolve a primeira metade; esta função
// resolve a segunda, devolvendo os ids que o duelo/batalha reconhecem.
describe('resolveSetSpecialEffects — §7.4', () => {
  it('nenhum efeito com menos peças que o limiar', () => {
    const equipped = [item(duelistSet.id, 'weapon'), item(duelistSet.id, 'helmet')]; // 2 de 4
    expect(resolveSetSpecialEffects(equipped, itemSets)).toEqual([]);
  });

  it('emite o effectId quando o limiar de peças é atingido', () => {
    const equipped = [
      item(duelistSet.id, 'weapon'),
      item(duelistSet.id, 'helmet'),
      item(duelistSet.id, 'armor'),
      item(duelistSet.id, 'necklace'),
    ];
    expect(resolveSetSpecialEffects(equipped, itemSets)).toEqual([SET_SPECIAL_DUELISTA]);
  });

  it('lê o limiar do dado — um special de 2 peças dispara com 2', () => {
    const equipped = [item(twoPieceSpecialSet.id, 'ring'), item(twoPieceSpecialSet.id, 'boots')];
    expect(resolveSetSpecialEffects(equipped, itemSets)).toEqual([SET_SPECIAL_RESERVA]);
  });

  it('efeitos `stat` não viram efeito special (simétrico ao corte acima)', () => {
    const equipped = [
      item(attackSet.id, 'weapon'),
      item(attackSet.id, 'helmet'),
      item(attackSet.id, 'armor'),
      item(attackSet.id, 'necklace'),
    ];
    expect(resolveSetSpecialEffects(equipped, itemSets)).toEqual([]);
  });

  it('set misto (§7.4: 2 peças stat, 4 peças comportamento) resolve os dois limiares', () => {
    const equipped = [
      item(immunitySet.id, 'weapon'),
      item(immunitySet.id, 'helmet'),
      item(immunitySet.id, 'armor'),
      item(immunitySet.id, 'necklace'),
    ];
    expect(resolveSetBonuses(equipped, itemSets)).toEqual([{ stat: 'efr', flat: 100, pct: undefined }]);
    expect(resolveSetSpecialEffects(equipped, itemSets)).toEqual([SET_SPECIAL_IMUNIDADE]);
  });

  it('resolve dois sets special ao mesmo tempo (4 peças de um, 2 de outro)', () => {
    const equipped = [
      item(duelistSet.id, 'weapon'),
      item(duelistSet.id, 'helmet'),
      item(duelistSet.id, 'armor'),
      item(duelistSet.id, 'necklace'),
      item(twoPieceSpecialSet.id, 'ring'),
      item(twoPieceSpecialSet.id, 'boots'),
    ];
    const result = resolveSetSpecialEffects(equipped, itemSets);
    expect(result).toContain(SET_SPECIAL_DUELISTA);
    expect(result).toContain(SET_SPECIAL_RESERVA);
    expect(result).toHaveLength(2);
  });

  it('itens de um set desconhecido são ignorados sem travar', () => {
    const equipped = [item('set-fantasma', 'weapon'), item('set-fantasma', 'helmet')];
    expect(resolveSetSpecialEffects(equipped, itemSets)).toEqual([]);
  });
});
