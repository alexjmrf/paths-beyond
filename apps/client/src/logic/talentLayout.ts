import type { TalentNode } from '@paths-beyond/core';

// §8.2 — teto de "8 pontos por árvore", convenção da spec aplicada externamente ao core
// (`validateAllocation` recebe `maxPointsPerTree` como parâmetro — número de dados, não
// hardcoded no motor, mesma decisão de M5). Não é específico de conteúdo de demonstração;
// árvores reais de M8 seguem a mesma convenção (8 linhas por árvore).
export const MAX_POINTS_PER_TREE = 8;

export interface PositionedTalentNode {
  readonly node: TalentNode;
  readonly col: 0 | 1 | 2;
}

// `TalentNode` (core) não tem noção de posição visual — layout é decisão só do cliente.
// Antes de M9, a coluna vinha hand-authored em `data/campaign/talents.ts` pro conjunto
// fixo de nós de demonstração; árvores reais (`ClassDef.talentTree`, M5/M8) não têm esse
// campo, então essa função deriva a coluna a partir da própria estrutura da árvore: nós
// que aparecem sozinhos numa linha ficam centralizados (col 1); pares `exclusiveWith` na
// mesma linha (o padrão real de bifurcação da spec, ex. golpe-fragilizante vs.
// contra-simples em class-espadachim) ficam um de cada lado (col 0/2), ordenados por id
// pra determinismo (mesma árvore sempre produz o mesmo layout).
export function layoutTalentTree(nodes: readonly TalentNode[]): readonly PositionedTalentNode[] {
  const byRow = new Map<number, TalentNode[]>();
  for (const node of nodes) {
    const row = byRow.get(node.row) ?? [];
    row.push(node);
    byRow.set(node.row, row);
  }

  const positioned: PositionedTalentNode[] = [];
  for (const rowNodes of byRow.values()) {
    const sorted = [...rowNodes].sort((a, b) => a.id.localeCompare(b.id));
    if (sorted.length <= 1) {
      for (const node of sorted) positioned.push({ node, col: 1 });
      continue;
    }
    sorted.forEach((node, index) => {
      const col = (index % 3) as 0 | 1 | 2;
      positioned.push({ node, col: sorted.length === 2 ? (index === 0 ? 0 : 2) : col });
    });
  }

  return positioned;
}
