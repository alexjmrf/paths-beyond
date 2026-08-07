import { describe, expect, it } from 'vitest';
import { resetTree } from '../../src/talents/reset.js';
import type { TalentNode } from '../../src/talents/types.js';

const tree: TalentNode[] = [
  { id: 'class-a', tree: 'class', row: 1, maxRank: 1, effects: [{ t: 'stat', stat: 'hp', flat: 50 }] },
  { id: 'class-b', tree: 'class', row: 1, maxRank: 1, effects: [{ t: 'stat', stat: 'atk', flat: 20 }] },
  { id: 'spec-a', tree: 'spec', row: 1, maxRank: 1, effects: [{ t: 'maxAp', n: 1 }] },
  { id: 'spec-b', tree: 'spec', row: 1, maxRank: 1, effects: [{ t: 'maxPp', n: 1 }] },
];

describe('resetTree — §8.2 ("Reset barato... Experimentar build é conteúdo")', () => {
  it('remove só os nós da árvore pedida, mantendo a outra intacta', () => {
    const allocation = { 'class-a': 1, 'class-b': 1, 'spec-a': 1, 'spec-b': 1 };
    const result = resetTree(allocation, 'spec', tree);
    expect(result).toEqual({ 'class-a': 1, 'class-b': 1 });
  });

  it('resetar a árvore de classe mantém a de spec intacta', () => {
    const allocation = { 'class-a': 1, 'spec-a': 1 };
    const result = resetTree(allocation, 'class', tree);
    expect(result).toEqual({ 'spec-a': 1 });
  });

  it('resetar uma árvore sem pontos alocados não muda nada', () => {
    const allocation = { 'class-a': 1 };
    const result = resetTree(allocation, 'spec', tree);
    expect(result).toEqual({ 'class-a': 1 });
  });

  it('alocação vazia continua vazia após reset', () => {
    expect(resetTree({}, 'class', tree)).toEqual({});
  });
});
