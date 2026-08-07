import { describe, expect, it } from 'vitest';
import { validateAllocation } from '../../src/talents/allocate.js';
import type { TalentAllocation, TalentNode } from '../../src/talents/types.js';

const tree: TalentNode[] = [
  { id: 'row1-a', tree: 'class', row: 1, maxRank: 1, effects: [{ t: 'stat', stat: 'hp', flat: 50 }] },
  { id: 'row1-b', tree: 'class', row: 1, maxRank: 3, effects: [{ t: 'stat', stat: 'atk', flat: 20 }] },
  { id: 'row2-a', tree: 'class', row: 2, requires: ['row1-a'], maxRank: 1, effects: [{ t: 'grantSkill', skillId: 'skill-x' }] },
  { id: 'row2-choice-fire', tree: 'class', row: 2, exclusiveWith: ['row2-choice-ice'], maxRank: 1, effects: [{ t: 'passive', passiveId: 'fire' }] },
  { id: 'row2-choice-ice', tree: 'class', row: 2, exclusiveWith: ['row2-choice-fire'], maxRank: 1, effects: [{ t: 'passive', passiveId: 'ice' }] },
  { id: 'spec-row1', tree: 'spec', row: 1, maxRank: 2, effects: [{ t: 'maxAp', n: 1 }] },
];

function alloc(entries: Record<string, number>): TalentAllocation {
  return entries;
}

describe('validateAllocation — gate de linha (§8.2, critério de aceite do M5)', () => {
  it('aceita um nó de linha 1 sem nenhum ponto prévio', () => {
    const result = validateAllocation({ tree, allocation: alloc({ 'row1-a': 1 }), maxPointsPerTree: 8 });
    expect(result.valid).toBe(true);
  });

  it('rejeita um nó de linha 2 sem nenhum ponto gasto antes na árvore', () => {
    const result = validateAllocation({ tree, allocation: alloc({ 'row2-a': 1 }), maxPointsPerTree: 8 });
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.nodeId === 'row2-a')).toBe(true);
  });

  it('aceita linha 2 quando já há 1 ponto gasto na árvore (linha 1)', () => {
    const result = validateAllocation({
      tree,
      allocation: alloc({ 'row1-a': 1, 'row2-a': 1 }),
      maxPointsPerTree: 8,
    });
    expect(result.valid).toBe(true);
  });
});

describe('validateAllocation — exclusividade (choice nodes, critério de aceite do M5)', () => {
  it('rejeita alocar os dois lados de um choice node ao mesmo tempo', () => {
    const result = validateAllocation({
      tree,
      allocation: alloc({ 'row1-a': 1, 'row2-choice-fire': 1, 'row2-choice-ice': 1 }),
      maxPointsPerTree: 8,
    });
    expect(result.valid).toBe(false);
  });

  it('aceita alocar só um lado do choice node', () => {
    const result = validateAllocation({
      tree,
      allocation: alloc({ 'row1-a': 1, 'row2-choice-fire': 1 }),
      maxPointsPerTree: 8,
    });
    expect(result.valid).toBe(true);
  });
});

describe('validateAllocation — requires', () => {
  it('rejeita um nó cujo requires não está alocado', () => {
    const result = validateAllocation({ tree, allocation: alloc({ 'row2-a': 1 }), maxPointsPerTree: 8 });
    expect(result.issues.some((i) => i.reason.includes('row1-a'))).toBe(true);
  });
});

describe('validateAllocation — maxRank e teto de pontos', () => {
  it('rejeita rank acima do maxRank do nó', () => {
    const result = validateAllocation({ tree, allocation: alloc({ 'row1-a': 2 }), maxPointsPerTree: 8 });
    expect(result.valid).toBe(false);
  });

  it('aceita até o maxRank do nó', () => {
    const result = validateAllocation({ tree, allocation: alloc({ 'row1-b': 3 }), maxPointsPerTree: 8 });
    expect(result.valid).toBe(true);
  });

  it('rejeita quando o total gasto numa árvore excede maxPointsPerTree', () => {
    const result = validateAllocation({
      tree,
      allocation: alloc({ 'row1-a': 1, 'row1-b': 3 }),
      maxPointsPerTree: 2,
    });
    expect(result.valid).toBe(false);
  });

  it('árvores diferentes (class/spec) têm orçamentos independentes', () => {
    const result = validateAllocation({
      tree,
      allocation: alloc({ 'row1-a': 1, 'spec-row1': 2 }),
      maxPointsPerTree: 2,
    });
    expect(result.valid).toBe(true);
  });
});

describe('validateAllocation — nó desconhecido', () => {
  it('rejeita um id de nó que não existe na árvore', () => {
    const result = validateAllocation({ tree, allocation: alloc({ fantasma: 1 }), maxPointsPerTree: 8 });
    expect(result.valid).toBe(false);
  });
});

describe('validateAllocation — alocação vazia', () => {
  it('alocação vazia é sempre válida', () => {
    const result = validateAllocation({ tree, allocation: alloc({}), maxPointsPerTree: 8 });
    expect(result.valid).toBe(true);
  });
});
