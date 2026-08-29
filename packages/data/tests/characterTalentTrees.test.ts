import { describe, expect, it } from 'vitest';
import characterTalentTreeSchema from '../schemas/character-talent-trees.schema.js';

// M17, sub-sessão 1/N — o schema da árvore de duas colunas (§8.2).
//
// O schema trava a FORMA do dado; a coerência da árvore (toda linha com as duas colunas, o
// orçamento cabendo na profundidade) é do motor, em `packages/core/src/talents/columnTree.ts`.
// Duplicar aquelas regras em Zod seria a segunda implementação que diverge em silêncio — o
// precedente é `weapon-duel-ranges`, cujo schema também só garante o formato.

function arvore(overrides: Record<string, unknown> = {}) {
  return {
    characterId: 'personagem-teste',
    depth: 5,
    budget: 5,
    nodes: [
      { id: 'a1', column: 'a', row: 1, maxRank: 1, effects: [{ t: 'stat', stat: 'atk', pct: 50 }] },
      { id: 'b1', column: 'b', row: 1, maxRank: 1, effects: [{ t: 'maxPp', n: 1 }] },
      { id: 'm3', column: 'middle', row: 3, maxRank: 2, effects: [{ t: 'grantReaction', reactionId: 'skill-assistir' }] },
    ],
    ...overrides,
  };
}

describe('schema da árvore de talentos por personagem', () => {
  it('aceita uma árvore bem formada', () => {
    expect(() => characterTalentTreeSchema.parse(arvore())).not.toThrow();
  });

  it('as três colunas de §8.2 são aceitas, e nenhuma outra', () => {
    for (const column of ['a', 'b', 'middle']) {
      expect(() => characterTalentTreeSchema.parse(arvore({ nodes: [{ id: 'x', column, row: 1, maxRank: 1, effects: [] }] }))).not.toThrow();
    }
    expect(() => characterTalentTreeSchema.parse(arvore({ nodes: [{ id: 'x', column: 'c', row: 1, maxRank: 1, effects: [] }] }))).toThrow();
  });

  it('a profundidade é limitada a 5..9 já no schema — é faixa normativa, não sabor', () => {
    expect(() => characterTalentTreeSchema.parse(arvore({ depth: 4 }))).toThrow();
    expect(() => characterTalentTreeSchema.parse(arvore({ depth: 10 }))).toThrow();
    expect(() => characterTalentTreeSchema.parse(arvore({ depth: 9, budget: 9 }))).not.toThrow();
  });

  it('maxRank fora de 1..3 é recusado', () => {
    expect(() => characterTalentTreeSchema.parse(arvore({ nodes: [{ id: 'x', column: 'a', row: 1, maxRank: 4, effects: [] }] }))).toThrow();
  });

  it('linha e orçamento precisam ser inteiros positivos', () => {
    expect(() => characterTalentTreeSchema.parse(arvore({ nodes: [{ id: 'x', column: 'a', row: 0, maxRank: 1, effects: [] }] }))).toThrow();
    expect(() => characterTalentTreeSchema.parse(arvore({ budget: 5.5 }))).toThrow();
  });

  it('`tree`, `requires` e `exclusiveWith` da forma ANTIGA são recusados', () => {
    // A topologia velha (gate por pontos gastos, choice nodes por exclusão) não sobrevive: quem
    // amarra agora é a coluna. Deixar os campos passarem convidaria a autorar no formato errado.
    const antigo = { id: 'x', column: 'a', row: 1, maxRank: 1, effects: [], tree: 'class', requires: ['y'] };
    expect(() => characterTalentTreeSchema.parse(arvore({ nodes: [antigo] }))).toThrow();
  });

  it('minAwakening é opcional e sobrevive à mudança de forma', () => {
    const comGate = { id: 'x', column: 'a', row: 1, maxRank: 1, minAwakening: 5, effects: [] };
    expect(() => characterTalentTreeSchema.parse(arvore({ nodes: [comGate] }))).not.toThrow();
  });
});
