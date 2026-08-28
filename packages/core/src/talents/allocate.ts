import type { Id } from '../types.js';
import type { TalentAllocation, TalentNode, TalentTree } from './types.js';

export interface ValidateAllocationInput {
  readonly tree: readonly TalentNode[]; // nós das duas árvores (class+spec) do herói
  readonly allocation: TalentAllocation;
  readonly maxPointsPerTree: number; // §8.2 — 8 pontos por árvore
  // §10 (M14) — "Awakening (0–6): ... libera nós avançados de talento a partir de 5".
  // Opcional e tratado como 0 quando ausente: todo chamador de M5 a M13 continua válido,
  // e um herói sem awakening declarado não ganha nó avançado de graça.
  readonly awakening?: number;
}

export interface ValidationIssue {
  readonly nodeId: Id;
  readonly reason: string;
}

export interface ValidationResult {
  readonly valid: boolean;
  readonly issues: readonly ValidationIssue[];
}

function pointsSpentByTree(allocation: TalentAllocation, nodesById: ReadonlyMap<Id, TalentNode>): Map<TalentTree, number> {
  const points = new Map<TalentTree, number>();
  for (const [nodeId, rank] of Object.entries(allocation)) {
    if (rank <= 0) continue;
    const node = nodesById.get(nodeId);
    if (!node) continue;
    points.set(node.tree, (points.get(node.tree) ?? 0) + rank);
  }
  return points;
}

// §8.2 — valida uma TalentAllocation contra a árvore: gate de linha (row N exige N-1
// pontos já gastos na mesma árvore, fora do próprio nó — decisão registrada em
// DECISIONS.md), `requires`, `exclusiveWith` (choice nodes), `maxRank` e teto de pontos
// por árvore.
export function validateAllocation(input: ValidateAllocationInput): ValidationResult {
  const nodesById = new Map(input.tree.map((node) => [node.id, node] as const));
  const issues: ValidationIssue[] = [];

  for (const [nodeId, rank] of Object.entries(input.allocation)) {
    if (rank <= 0) continue;
    if (!nodesById.has(nodeId)) {
      issues.push({ nodeId, reason: 'nó desconhecido na árvore' });
    }
  }

  const pointsByTree = pointsSpentByTree(input.allocation, nodesById);
  for (const [tree, points] of pointsByTree) {
    if (points > input.maxPointsPerTree) {
      issues.push({ nodeId: tree, reason: `teto de ${input.maxPointsPerTree} pontos excedido (${points} gastos)` });
    }
  }

  for (const [nodeId, rank] of Object.entries(input.allocation)) {
    if (rank <= 0) continue;
    const node = nodesById.get(nodeId);
    if (!node) continue;

    if (rank > node.maxRank) {
      issues.push({ nodeId, reason: `rank ${rank} excede maxRank ${node.maxRank}` });
    }

    const pointsInTreeExcludingSelf = (pointsByTree.get(node.tree) ?? 0) - rank;
    if (pointsInTreeExcludingSelf < node.row - 1) {
      issues.push({
        nodeId,
        reason: `linha ${node.row} exige ${node.row - 1} pontos já gastos na árvore (há ${pointsInTreeExcludingSelf})`,
      });
    }

    // O RANK exigido é do dado, não do motor: §10 nomeia 5 para o caso que descreve, mas
    // travar o 5 aqui proibiria uma classe futura de exigir outro.
    if (node.minAwakening !== undefined && (input.awakening ?? 0) < node.minAwakening) {
      issues.push({
        nodeId,
        reason: `exige awakening ${node.minAwakening} (o herói está em ${input.awakening ?? 0})`,
      });
    }

    for (const requiredId of node.requires ?? []) {
      if ((input.allocation[requiredId] ?? 0) <= 0) {
        issues.push({ nodeId, reason: `requer ${requiredId} alocado` });
      }
    }

    for (const exclusiveId of node.exclusiveWith ?? []) {
      if ((input.allocation[exclusiveId] ?? 0) > 0) {
        issues.push({ nodeId, reason: `exclusivo com ${exclusiveId}, que já está alocado` });
      }
    }
  }

  return { valid: issues.length === 0, issues };
}
