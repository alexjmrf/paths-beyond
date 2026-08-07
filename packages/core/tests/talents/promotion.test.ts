import { describe, expect, it } from 'vitest';
import { canPromote, promote } from '../../src/talents/promotion.js';
import type { TalentNode } from '../../src/talents/types.js';

const tree: TalentNode[] = [
  { id: 'class-a', tree: 'class', row: 1, maxRank: 1, effects: [{ t: 'stat', stat: 'hp', flat: 50 }] },
  { id: 'spec-a', tree: 'spec', row: 1, maxRank: 1, effects: [{ t: 'maxAp', n: 1 }] },
  { id: 'spec-b', tree: 'spec', row: 1, maxRank: 1, effects: [{ t: 'maxPp', n: 1 }] },
];

describe('canPromote — §8.1 ("Promoção exige item + nível mínimo")', () => {
  it('permite quando o nível é suficiente e não há item exigido', () => {
    const result = canPromote({ heroLevel: 20, requirement: { minLevel: 20 }, hasRequiredItem: false });
    expect(result.allowed).toBe(true);
  });

  it('bloqueia quando o nível é insuficiente', () => {
    const result = canPromote({ heroLevel: 19, requirement: { minLevel: 20 }, hasRequiredItem: false });
    expect(result.allowed).toBe(false);
  });

  it('bloqueia quando falta o item exigido', () => {
    const result = canPromote({
      heroLevel: 20,
      requirement: { minLevel: 20, itemId: 'item-promocao' },
      hasRequiredItem: false,
    });
    expect(result.allowed).toBe(false);
  });

  it('permite quando nível e item exigido estão satisfeitos', () => {
    const result = canPromote({
      heroLevel: 20,
      requirement: { minLevel: 20, itemId: 'item-promocao' },
      hasRequiredItem: true,
    });
    expect(result.allowed).toBe(true);
  });
});

describe('promote — troca de classe e reset seletivo (§8.2: "Classe... compartilhada entre specs")', () => {
  it('troca o classId e reseta só a árvore de especialização', () => {
    const result = promote({
      newClassId: 'class-cavaleiro',
      allocation: { 'class-a': 1, 'spec-a': 1, 'spec-b': 1 },
      specTreeNodes: tree,
    });
    expect(result.classId).toBe('class-cavaleiro');
    expect(result.talents).toEqual({ 'class-a': 1 });
  });

  it('não mexe na alocação de classe', () => {
    const result = promote({ newClassId: 'class-berserker', allocation: { 'class-a': 1 }, specTreeNodes: tree });
    expect(result.talents).toEqual({ 'class-a': 1 });
  });
});
