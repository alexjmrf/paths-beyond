import { describe, expect, it } from 'vitest';
import { resetFromRow } from '../../src/talents/reset.js';
import { validateColumnAllocation } from '../../src/talents/columnTree.js';
import type { ColumnTalentTree } from '../../src/talents/columnTree.js';

// M17, sub-sessão 2/N — o reset mudou de forma junto com a árvore.
//
// Na topologia antiga havia duas árvores por classe e o reset era "zere UMA delas": a de
// spec caía na promoção e a de classe ficava. Com uma árvore por personagem (§8.1) essa
// assinatura perdeu o assunto — não há outra árvore para preservar.
//
// O que entrou no lugar não é a mesma função com um argumento a menos, e sim a operação
// que a forma nova exige. A árvore é um CAMINHO (decisão da 1/N: linhas contíguas a
// partir de 1), então tirar um ponto do meio dele deixaria tudo abaixo pendurado no
// nada. Desfazer um caminho é truncá-lo: escolhe-se a linha e tudo dali para baixo sai
// junto. `resetFromRow(tree, allocation, 1)` é o reset barato inteiro de §8.2, e é o
// mesmo código.

const tree: ColumnTalentTree = {
  characterId: 'personagem-de-teste',
  depth: 5,
  nodes: [
    { id: 'a1', column: 'a', row: 1, maxRank: 2, effects: [] },
    { id: 'b1', column: 'b', row: 1, maxRank: 1, effects: [] },
    { id: 'a2', column: 'a', row: 2, maxRank: 3, effects: [] },
    { id: 'b2', column: 'b', row: 2, maxRank: 1, effects: [] },
    { id: 'a3', column: 'a', row: 3, maxRank: 1, effects: [] },
    { id: 'b3', column: 'b', row: 3, maxRank: 1, effects: [] },
    { id: 'm3', column: 'middle', row: 3, maxRank: 1, effects: [] },
    { id: 'a4', column: 'a', row: 4, maxRank: 2, effects: [] },
    { id: 'b4', column: 'b', row: 4, maxRank: 1, effects: [] },
    { id: 'a5', column: 'a', row: 5, maxRank: 2, effects: [] },
    { id: 'b5', column: 'b', row: 5, maxRank: 1, effects: [] },
  ],
};

const caminhoInteiro = { a1: 2, a2: 3, a3: 1, a4: 2, a5: 1 };

describe('resetFromRow — §8.2 ("Reset barato... Experimentar build é conteúdo")', () => {
  it('a linha 1 zera a árvore inteira: é o reset barato da spec', () => {
    expect(resetFromRow(tree, caminhoInteiro, 1)).toEqual({});
  });

  it('trunca o caminho: a linha pedida e tudo abaixo dela saem, o que está acima fica', () => {
    expect(resetFromRow(tree, caminhoInteiro, 3)).toEqual({ a1: 2, a2: 3 });
  });

  it('o que sobra continua sendo um caminho legal — é o ponto todo de truncar em vez de tirar do meio', () => {
    const truncado = resetFromRow(tree, caminhoInteiro, 4);
    expect(validateColumnAllocation({ tree, allocation: truncado }).issues).toEqual([]);
  });

  it('truncar abaixo do que foi alocado não muda nada', () => {
    expect(resetFromRow(tree, { a1: 1, a2: 1 }, 5)).toEqual({ a1: 1, a2: 1 });
  });

  it('alocação vazia continua vazia', () => {
    expect(resetFromRow(tree, {}, 1)).toEqual({});
  });

  it('nó que não existe na árvore é descartado — ele não tem linha para ser comparada', () => {
    expect(resetFromRow(tree, { a1: 1, 'talent-de-outra-arvore': 2 }, 3)).toEqual({ a1: 1 });
  });

  it('é puro: não muta a alocação recebida', () => {
    const original = { ...caminhoInteiro };
    resetFromRow(tree, original, 2);
    expect(original).toEqual(caminhoInteiro);
  });
});
