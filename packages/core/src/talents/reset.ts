import type { Id } from '../types.js';
import type { ColumnTalentTree } from './columnTree.js';
import type { TalentAllocation } from './types.js';

// §8.2 — "Reset barato (ouro). Experimentar build é conteúdo, não punição."
//
// M17, 2/N: a assinatura antiga (`resetTree(allocation, 'class'|'spec', nodes)`) morreu
// com a topologia que a justificava — não há mais uma segunda árvore para preservar.
// O que a forma nova pede é TRUNCAR: a árvore é um caminho (linhas contíguas a partir de
// 1), então tirar um ponto do meio dele deixaria as linhas de baixo penduradas no nada, e
// `validateColumnAllocation` recusaria a alocação resultante. Desfazer um caminho é
// desfazê-lo da ponta para trás.
//
// `fromRow = 1` é o reset inteiro que a spec nomeia, e não precisa de código próprio.
export function resetFromRow(tree: ColumnTalentTree, allocation: TalentAllocation, fromRow: number): TalentAllocation {
  const linhaPorId = new Map(tree.nodes.map((node) => [node.id, node.row] as const));
  const next: Record<Id, number> = {};

  for (const [nodeId, rank] of Object.entries(allocation)) {
    const row = linhaPorId.get(nodeId);
    // Nó que não é desta árvore não tem linha para comparar. Ele sai: manter um id que a
    // árvore não conhece só adiaria o "nó desconhecido" para a próxima validação.
    if (row === undefined) continue;
    if (row >= fromRow) continue;
    next[nodeId] = rank;
  }

  return next;
}
