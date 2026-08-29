import { describe, expect, it } from 'vitest';
import {
  allocatedPath,
  validateColumnAllocation,
  validateColumnTree,
  TALENT_POINT_BUDGET,
  type ColumnTalentNode,
  type ColumnTalentTree,
} from '../../src/talents/columnTree.js';
import type { TalentAllocation } from '../../src/talents/types.js';

// M17, sub-sessão 1/N — o motor da árvore de duas colunas (§8.2).
//
// A árvore deixou de ser da classe e passou a ser do personagem, e a forma mudou: duas colunas
// principais em todas as linhas, uma coluna do meio ocasional, UM nó por linha, e a coluna
// amarrando a linha seguinte. O nó do meio é a porta que libera trocar de lado — e ele custa o
// ponto da linha em que está, então trocar não é livre nem impossível.
//
// Esta fatia é motor e schema, sem conteúdo: o `allocate.ts` antigo continua de pé até a 2/N
// trocar os consumidores de uma vez. Manter os dois formatos convivendo não é a intenção (o §7
// do briefing proíbe), é a ordem em que a troca acontece sem deixar o repositório vermelho.

function node(id: string, column: 'a' | 'b' | 'middle', row: number, extra: Partial<ColumnTalentNode> = {}): ColumnTalentNode {
  return { id, column, row, maxRank: 1, effects: [], ...extra };
}

// Árvore de 5 linhas com convergência na 3. É a forma mínima que a spec permite (profundidade
// 5..9) e a menor que exercita as três colunas.
function arvore(overrides: Partial<ColumnTalentTree> = {}): ColumnTalentTree {
  const nodes: ColumnTalentNode[] = [];
  for (let row = 1; row <= 5; row++) {
    nodes.push(node(`a${row}`, 'a', row));
    nodes.push(node(`b${row}`, 'b', row));
  }
  nodes.push(node('m3', 'middle', 3));
  // Profundidade 5 com orçamento fixo de 9: sobram 4 pontos, e a árvore precisa ter onde
  // absorvê-los. É a troca que a profundidade virou — menos linhas, ranks mais fundos.
  const comRank = nodes.map((n) => (n.column === 'a' ? { ...n, maxRank: 3 as const } : n));
  return { characterId: 'personagem-teste', depth: 5, nodes: comRank, ...overrides };
}

function aloc(...ids: string[]): TalentAllocation {
  return Object.fromEntries(ids.map((id) => [id, 1]));
}

describe('M17 1/N — a forma da árvore (`validateColumnTree`)', () => {
  it('a árvore de referência é válida', () => {
    expect(validateColumnTree(arvore()).valid).toBe(true);
  });

  it('profundidade fora de 5..9 é recusada — a faixa é normativa em §8.2', () => {
    const rasa = validateColumnTree({ ...arvore(), depth: 4 });
    expect(rasa.valid).toBe(false);
    expect(rasa.issues.map((i) => i.reason).join(' ')).toContain('profundidade');
  });

  it('toda linha PRECISA ter as duas colunas principais — uma coluna faltando é uma linha sem escolha', () => {
    const semB = arvore({ nodes: arvore().nodes.filter((n) => n.id !== 'b3') });
    const r = validateColumnTree(semB);
    expect(r.valid).toBe(false);
    expect(r.issues.map((i) => i.reason).join(' ')).toContain('linha 3');
  });

  it('duas colunas do meio na mesma linha é recusado — a linha teria duas portas', () => {
    const duplo = arvore({ nodes: [...arvore().nodes, node('m3-bis', 'middle', 3)] });
    expect(validateColumnTree(duplo).valid).toBe(false);
  });

  it('o meio é OPCIONAL: uma árvore sem nenhuma convergência é válida', () => {
    // Ela vira duas colunas estanques — escolher a coluna 1 é escolher a build inteira. É uma
    // árvore legítima, e é decisão de quem autora, não do motor.
    const semMeio = arvore({ nodes: arvore().nodes.filter((n) => n.column !== 'middle') });
    expect(validateColumnTree(semMeio).valid).toBe(true);
  });

  it('id repetido é recusado', () => {
    const repetido = arvore({ nodes: [...arvore().nodes, node('a1', 'a', 5)] });
    expect(validateColumnTree(repetido).valid).toBe(false);
  });

  it(`o orçamento é FIXO em ${TALENT_POINT_BUDGET} pontos para todo personagem`, () => {
    // Decisão do usuário: a profundidade varia por personagem, o orçamento não. O que muda entre
    // um personagem e outro é a FORMA da árvore — mais linhas contra ranks mais fundos —, nunca
    // quanto poder ela entrega. Sem isso, profundidade viraria orçamento e o torneio mediria
    // "tem mais pontos" como se fosse "está mais bem desenhado".
    expect(TALENT_POINT_BUDGET).toBe(9);
  });

  it('a árvore PRECISA ter onde absorver o orçamento inteiro', () => {
    // Profundidade 5 e nenhum nó de rank múltiplo: 5 linhas para 9 pontos. Quatro pontos ficariam
    // sem onde ser gastos, e o jogador terminaria com saldo e nada para comprar — erro de autoria.
    const semRank = arvore({ nodes: arvore().nodes.map((n) => ({ ...n, maxRank: 1 as const })) });
    const r = validateColumnTree(semRank);
    expect(r.valid).toBe(false);
    expect(r.issues.map((i) => i.reason).join(' ')).toContain('absorver');
  });

  it('uma árvore da profundidade máxima dispensa rank múltiplo — ela já gasta os 9 em linhas', () => {
    const nodes: ColumnTalentNode[] = [];
    for (let row = 1; row <= 9; row++) {
      nodes.push(node(`a${row}`, 'a', row));
      nodes.push(node(`b${row}`, 'b', row));
    }
    expect(validateColumnTree({ characterId: 'fundo', depth: 9, nodes }).valid).toBe(true);
  });

});

describe('M17 1/N — a coluna amarra (`validateColumnAllocation`)', () => {
  it('descer por uma coluna só é válido', () => {
    expect(validateColumnAllocation({ tree: arvore(), allocation: aloc('a1', 'a2', 'a3', 'a4', 'a5') }).valid).toBe(true);
  });

  it('trocar de coluna SEM passar pela convergência é recusado — é a regra central', () => {
    const r = validateColumnAllocation({ tree: arvore(), allocation: aloc('a1', 'a2', 'b3') });
    expect(r.valid).toBe(false);
    expect(r.issues.map((i) => i.reason).join(' ')).toContain('coluna');
  });

  it('passar pela convergência LIBERA a linha seguinte para a outra coluna', () => {
    // a1 → a2 → m3 (a porta) → b4 → b5. É o caminho que a fatia inteira existe para permitir.
    expect(validateColumnAllocation({ tree: arvore(), allocation: aloc('a1', 'a2', 'm3', 'b4', 'b5') }).valid).toBe(true);
  });

  it('e a coluna escolhida DEPOIS da convergência volta a amarrar', () => {
    // Entrou em `b` na linha 4, não pode voltar para `a` na 5 sem outra porta.
    const r = validateColumnAllocation({ tree: arvore(), allocation: aloc('a1', 'a2', 'm3', 'b4', 'a5') });
    expect(r.valid).toBe(false);
  });

  it('entrar na convergência é permitido vindo de QUALQUER coluna', () => {
    expect(validateColumnAllocation({ tree: arvore(), allocation: aloc('b1', 'b2', 'm3') }).valid).toBe(true);
    expect(validateColumnAllocation({ tree: arvore(), allocation: aloc('a1', 'a2', 'm3') }).valid).toBe(true);
  });

  it('dois nós na mesma linha é recusado — é UM nó por linha', () => {
    const r = validateColumnAllocation({ tree: arvore(), allocation: aloc('a1', 'a2', 'b2') });
    expect(r.valid).toBe(false);
    expect(r.issues.map((i) => i.reason).join(' ')).toContain('linha');
  });

  it('pular uma linha é recusado — a árvore é um caminho, não uma sacola', () => {
    const r = validateColumnAllocation({ tree: arvore(), allocation: aloc('a1', 'a3') });
    expect(r.valid).toBe(false);
  });

  it('alocação vazia é válida: um personagem novo não tem nada gasto', () => {
    expect(validateColumnAllocation({ tree: arvore(), allocation: {} }).valid).toBe(true);
  });

  it('parar no meio do caminho é válido — nem todo personagem chega ao fim', () => {
    expect(validateColumnAllocation({ tree: arvore(), allocation: aloc('a1', 'a2') }).valid).toBe(true);
  });
});

describe('M17 1/N — orçamento, rank e awakening', () => {
  it('gastar mais que o orçamento é recusado', () => {
    const t = arvore();
    const r = validateColumnAllocation({
      tree: t,
      allocation: { a1: 3, a2: 3, a3: 3, a4: 1 }, // 10 pontos num orçamento de 9
    });
    expect(r.valid).toBe(false);
    expect(r.issues.map((i) => i.reason).join(' ')).toContain('orçamento');
  });

  it('rank acima do maxRank do nó é recusado', () => {
    expect(validateColumnAllocation({ tree: arvore(), allocation: { b1: 2 } }).valid).toBe(false);
  });

  it('o ponto extra do orçamento aprofunda um nó do caminho, e isso é válido', () => {
    const r = validateColumnAllocation({
      tree: arvore(),
      allocation: { a1: 3, a2: 3, a3: 1, a4: 1, a5: 1 }, // 9 pontos em 5 linhas
    });
    expect(r.valid).toBe(true);
  });

  it('nó fora da árvore é recusado', () => {
    expect(validateColumnAllocation({ tree: arvore(), allocation: aloc('nao-existe') }).valid).toBe(false);
  });

  it('`minAwakening` continua valendo, e o rank exigido vem do DADO', () => {
    // Herdado de M14: §10 nomeia 5 para o caso que descreve, mas travar o 5 no motor proibiria
    // um personagem futuro de exigir outro.
    const t = arvore();
    const nodes = t.nodes.map((n) => (n.id === 'a3' ? { ...n, minAwakening: 5 } : n));
    const arv = { ...t, nodes };
    expect(validateColumnAllocation({ tree: arv, allocation: aloc('a1', 'a2', 'a3'), awakening: 4 }).valid).toBe(false);
    expect(validateColumnAllocation({ tree: arv, allocation: aloc('a1', 'a2', 'a3'), awakening: 5 }).valid).toBe(true);
    // Ausente vale 0, e não "sem gate": um personagem sem awakening declarado não ganha nó
    // avançado de graça.
    expect(validateColumnAllocation({ tree: arv, allocation: aloc('a1', 'a2', 'a3') }).valid).toBe(false);
  });
});

describe('M17 1/N — `allocatedPath`: o caminho como dado', () => {
  it('devolve os nós na ordem das linhas', () => {
    const path = allocatedPath(arvore(), aloc('a1', 'a2', 'm3', 'b4'));
    expect(path.map((n) => n.id)).toEqual(['a1', 'a2', 'm3', 'b4']);
  });

  it('alocação vazia devolve caminho vazio', () => {
    expect(allocatedPath(arvore(), {})).toEqual([]);
  });

  it('é puro: não muta a alocação nem a árvore', () => {
    const t = arvore();
    const a = aloc('a1', 'a2');
    const antes = JSON.stringify({ t, a });
    allocatedPath(t, a);
    expect(JSON.stringify({ t, a })).toBe(antes);
  });
});
