import type { Id } from '../types.js';
import type { TalentAllocation, TalentNode, TalentTree } from './types.js';

// §8.2 — "Reset barato (ouro). Experimentar build é conteúdo, não punição." Remove só os
// nós da árvore pedida; a outra árvore fica intacta (classe é "compartilhada entre
// specs" — resetar spec na promoção não deveria zerar os pontos de classe, ver
// promotion.ts).
export function resetTree(allocation: TalentAllocation, tree: TalentTree, treeNodes: readonly TalentNode[]): TalentAllocation {
  const idsInTree = new Set(treeNodes.filter((node) => node.tree === tree).map((node) => node.id));
  const next: Record<Id, number> = {};
  for (const [nodeId, rank] of Object.entries(allocation)) {
    if (idsInTree.has(nodeId)) continue;
    next[nodeId] = rank;
  }
  return next;
}
