import { describe, expect, it } from 'vitest';
import { validateAllocation } from '../../src/talents/allocate.js';
import type { TalentNode } from '../../src/talents/types.js';

// M14, sub-sessão 1/N — §10: "Awakening (0–6): multiplica a curva base e **libera nós
// avançados de talento a partir de 5**." A metade "multiplica a curva" existe desde M7; a
// metade "libera nós" não tinha onde acontecer — `TalentNode` não tinha como declarar
// exigência de awakening e `validateAllocation` não sabia o awakening do herói.
//
// Qual nó é avançado é decisão de CONTEÚDO (`minAwakening` no dado), não do motor: a spec
// diz "a partir de 5" para o caso nomeado, mas travar o 5 no código proibiria uma classe
// futura de exigir outro rank.

const arvore: readonly TalentNode[] = [
  { id: 'base-1', tree: 'class', row: 1, maxRank: 1, effects: [] },
  { id: 'base-2', tree: 'class', row: 2, maxRank: 1, effects: [] },
  { id: 'avancado', tree: 'class', row: 3, maxRank: 1, minAwakening: 5, effects: [] },
];

const alocacaoAteAvancado = { 'base-1': 1, 'base-2': 1, avancado: 1 };

describe('gate de awakening na alocação de talento', () => {
  it('nó com minAwakening é rejeitado abaixo do rank exigido', () => {
    const r = validateAllocation({ tree: arvore, allocation: alocacaoAteAvancado, maxPointsPerTree: 8, awakening: 4 });
    expect(r.valid).toBe(false);
    expect(r.issues.some((i) => i.nodeId === 'avancado' && i.reason.includes('awakening'))).toBe(true);
  });

  it('o mesmo nó é aceito a partir do rank exigido', () => {
    const r = validateAllocation({ tree: arvore, allocation: alocacaoAteAvancado, maxPointsPerTree: 8, awakening: 5 });
    expect(r.valid).toBe(true);
  });

  it('awakening ausente é tratado como 0 — o herói de M5 a M13 não ganha nó avançado de graça', () => {
    const r = validateAllocation({ tree: arvore, allocation: alocacaoAteAvancado, maxPointsPerTree: 8 });
    expect(r.valid).toBe(false);
  });

  it('nó sem minAwakening continua valendo com awakening 0 (nada de M5 muda)', () => {
    const r = validateAllocation({ tree: arvore, allocation: { 'base-1': 1, 'base-2': 1 }, maxPointsPerTree: 8 });
    expect(r.valid).toBe(true);
  });

  it('o gate é do dado, não do motor: um nó pode exigir outro rank que não 5', () => {
    const exigeDois: readonly TalentNode[] = [{ ...arvore[0]!, minAwakening: 2 }];
    expect(validateAllocation({ tree: exigeDois, allocation: { 'base-1': 1 }, maxPointsPerTree: 8, awakening: 1 }).valid).toBe(false);
    expect(validateAllocation({ tree: exigeDois, allocation: { 'base-1': 1 }, maxPointsPerTree: 8, awakening: 2 }).valid).toBe(true);
  });
});
