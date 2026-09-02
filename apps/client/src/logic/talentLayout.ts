import {
  TALENT_POINT_BUDGET,
  validateColumnAllocation,
  type ColumnTalentNode,
  type ColumnTalentTree,
  type Id,
  type TalentAllocation,
} from '@paths-beyond/core';

// §8.2 (M17, sub-sessão 4/N) — o layout da árvore de duas colunas.
//
// A forma antiga (duas árvores por classe, coluna DERIVADA de `exclusiveWith`, teto de 8
// pontos por árvore) saiu inteira. Aqui a coluna não é mais adivinhada a partir da
// estrutura: ela é dado (`ColumnTalentNode.column`), e este módulo só a traduz para uma
// posição de tela. O orçamento também deixou de morar no cliente — `TALENT_POINT_BUDGET` é
// constante do jogo e vem do core, porque quem valida a alocação é ele.

export interface PositionedTalentNode {
  readonly node: ColumnTalentNode;
  // a = 0, meio = 1, b = 2. A ordem é a do diagrama de §8.2, e o meio no meio é o que faz
  // a convergência se ler como porta entre as duas colunas em vez de uma terceira trilha.
  readonly col: 0 | 1 | 2;
  readonly row: number;
}

const COL_INDEX = { a: 0, middle: 1, b: 2 } as const;

export function layoutColumnTree(tree: ColumnTalentTree): readonly PositionedTalentNode[] {
  return tree.nodes.map((node) => ({ node, col: COL_INDEX[node.column], row: node.row }));
}

export function pointsSpent(allocation: TalentAllocation): number {
  return Object.values(allocation).reduce((soma, rank) => soma + Math.max(0, rank), 0);
}

// ---------------------------------------------------------------------------
// O que a tela pode oferecer
//
// **Nada aqui decide a regra.** A amarração de coluna, o caminho contíguo, o teto de rank,
// o gate de despertar e o orçamento vivem em `validateColumnAllocation` (packages/core), e
// a única coisa que este módulo faz é montar a alocação CANDIDATA — a que existiria se o
// jogador clicasse — e perguntar ao core se ela vale.
//
// É a regra 3 do CLAUDE.md aplicada onde ela é mais fácil de furar: reescrever `permiteSeguir`
// aqui seria mais rápido por render e daria uma tela que concorda com o motor até o dia em que
// uma das duas cópias mudar. O custo real é uma validação por nó por render, sobre uma árvore
// de no máximo 27 nós.
// ---------------------------------------------------------------------------

export interface TalentNodeAvailability {
  readonly canAllocate: boolean;
  readonly canDeallocate: boolean;
  // O motivo do bloqueio, palavra por palavra como o core o escreveu. O cliente não
  // reescreve a explicação pelo mesmo motivo que não reescreve a regra: as duas frases
  // divergiriam, e a da tela é a que o jogador lê.
  readonly blockedReason?: string;
}

export interface AvailabilityInput {
  readonly tree: ColumnTalentTree;
  readonly allocation: TalentAllocation;
  // Ausente vale 0, a mesma leitura do core: personagem sem despertar declarado não ganha
  // nó avançado de graça.
  readonly awakening?: number;
}

export function availabilityByNode(input: AvailabilityInput): ReadonlyMap<Id, TalentNodeAvailability> {
  const { tree, allocation, awakening } = input;
  const resultado = new Map<Id, TalentNodeAvailability>();

  for (const node of tree.nodes) {
    const rank = allocation[node.id] ?? 0;

    const somando = validateColumnAllocation({
      tree,
      allocation: { ...allocation, [node.id]: rank + 1 },
      awakening,
    });

    // Tirar um ponto é a mesma pergunta ao contrário, e a resposta não é simétrica: um nó de
    // `maxRank > 1` volta de 2 para 1 no meio do caminho sem quebrar nada, mas tirar o
    // ÚLTIMO ponto de uma linha do meio deixaria as linhas de baixo penduradas — o core
    // recusa, e é para isso que existe o reset a partir de uma linha (`resetFromRow`).
    const tirando =
      rank > 0
        ? validateColumnAllocation({
            tree,
            allocation: { ...allocation, [node.id]: rank - 1 },
            awakening,
          })
        : null;

    resultado.set(node.id, {
      canAllocate: somando.valid,
      canDeallocate: tirando?.valid ?? false,
      blockedReason: somando.valid ? undefined : somando.issues[0]?.reason,
    });
  }

  return resultado;
}

export { TALENT_POINT_BUDGET };
