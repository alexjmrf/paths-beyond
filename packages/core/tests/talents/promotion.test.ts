import { describe, expect, it } from 'vitest';
import { canPromote, promote } from '../../src/talents/promotion.js';

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

describe('promote — a promoção troca a classe e NÃO toca na árvore (§8.1, M17)', () => {
  it('troca o classId', () => {
    const result = promote({ newClassId: 'class-cavaleiro', allocation: { 'talent-a1': 1, 'talent-a2': 2 } });
    expect(result.classId).toBe('class-cavaleiro');
  });

  // A regra ANTIGA resetava a árvore de especialização aqui. Ela morreu com a topologia
  // que a justificava: a árvore é do personagem (§8.2), e trocar a classe dele não troca
  // quem ele é. Este teste é o oposto exato do que estava escrito antes, de propósito.
  it('preserva a alocação inteira — não há mais árvore de classe para resetar', () => {
    const allocation = { 'talent-a1': 1, 'talent-a2': 2, 'talent-m3': 1 };
    const result = promote({ newClassId: 'class-berserker', allocation });
    expect(result.talents).toEqual(allocation);
  });
});
