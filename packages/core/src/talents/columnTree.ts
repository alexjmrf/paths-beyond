import type { Id } from '../types.js';
import type { TalentAllocation, TalentEffect } from './types.js';

// M17, sub-sessão 1/N — a árvore de talentos de duas colunas (§8.2).
//
// A árvore deixou de pertencer à CLASSE e passou a pertencer ao PERSONAGEM, e a forma mudou
// junto: duas colunas principais presentes em todas as linhas, uma coluna do meio ocasional, UM
// nó por linha, e a coluna amarrando a linha seguinte.
//
// A regra que dá forma à build está em duas frases de §8.2, e é tudo que este módulo faz valer:
// escolher um nó da coluna A na linha N **obriga** a linha N+1 a vir de A; escolher o nó do
// **meio** na linha N **libera** a linha N+1 para qualquer coluna, e a coluna escolhida ali volta
// a amarrar. A convergência é uma porta que custa o ponto da própria linha — trocar de lado não é
// livre e não é impossível.
//
// `TalentEffect` não muda: os 12 efeitos de §8.2 seguem idênticos e são reusados de `types.ts`.
// O que mudou é a topologia, não o que um talento faz.
//
// Esta fatia é motor e schema. O `allocate.ts` antigo (árvore de classe, gate por pontos gastos)
// continua de pé até a 2/N trocar os consumidores de uma vez — não por compatibilidade, que o §7
// do briefing proíbe, mas porque é a ordem em que a troca acontece sem deixar o repositório
// vermelho no meio.

export type TalentColumn = 'a' | 'b' | 'middle';

export interface ColumnTalentNode {
  readonly id: Id;
  readonly column: TalentColumn;
  readonly row: number; // 1..depth
  readonly maxRank: 1 | 2 | 3;
  // §10 (M14) — "Awakening (0–6): ... libera nós avançados de talento a partir de 5." Herdado
  // sem mudança: qual nó é avançado, e a partir de qual rank, é conteúdo e não motor.
  readonly minAwakening?: number;
  readonly effects: readonly TalentEffect[];
}

export interface ColumnTalentTree {
  readonly characterId: Id;
  readonly depth: number; // §8.2 — 5..9, e é FORMA, não poder
  readonly nodes: readonly ColumnTalentNode[];
}

export interface ValidationIssue {
  readonly nodeId: Id;
  readonly reason: string;
}

export interface ValidationResult {
  readonly valid: boolean;
  readonly issues: readonly ValidationIssue[];
}

export const MIN_DEPTH = 5;
export const MAX_DEPTH = 9;

// §8.2 — o orçamento é FIXO e igual para todo personagem, e não sai da profundidade da árvore.
//
// Decisão do usuário: a profundidade varia por personagem, o orçamento não. Se profundidade
// fosse orçamento, um personagem de 9 linhas teria quase o dobro dos pontos de um de 5 — e o
// torneio de balanceamento mediria "tem mais pontos" sem conseguir separar isso de "está mais
// bem desenhado". Com o orçamento fixo, a profundidade vira uma TROCA de forma: mais linhas
// contra ranks mais fundos, e o mesmo poder total nos dois extremos.
//
// O valor é a profundidade máxima: assim a árvore mais funda ainda é terminável (9 linhas, 9
// pontos, um por linha) e a mais rasa precisa de ranks múltiplos para absorver a sobra.
export const TALENT_POINT_BUDGET = MAX_DEPTH;

// ---------------------------------------------------------------------------
// A forma da árvore
// ---------------------------------------------------------------------------

// Valida a ÁRVORE, não a alocação. Existe separada porque os dois erros são de autores
// diferentes: uma árvore malformada é erro de quem escreveu o conteúdo, e uma alocação inválida é
// tentativa de quem joga (ou de um cliente adulterado, §9.2).
export function validateColumnTree(tree: ColumnTalentTree): ValidationResult {
  const issues: ValidationIssue[] = [];

  if (tree.depth < MIN_DEPTH || tree.depth > MAX_DEPTH) {
    issues.push({ nodeId: tree.characterId, reason: `profundidade ${tree.depth} fora de ${MIN_DEPTH}..${MAX_DEPTH} (§8.2)` });
  }

  const vistos = new Set<Id>();
  for (const node of tree.nodes) {
    if (vistos.has(node.id)) issues.push({ nodeId: node.id, reason: 'id repetido na árvore' });
    vistos.add(node.id);
    if (node.row < 1 || node.row > tree.depth) {
      issues.push({ nodeId: node.id, reason: `linha ${node.row} fora da profundidade ${tree.depth}` });
    }
  }

  // Toda linha precisa das duas colunas principais: uma linha com uma coluna só não oferece
  // escolha, e a árvore inteira existe para que cada linha seja uma decisão.
  for (let row = 1; row <= tree.depth; row++) {
    const naLinha = tree.nodes.filter((n) => n.row === row);
    for (const coluna of ['a', 'b'] as const) {
      const quantos = naLinha.filter((n) => n.column === coluna).length;
      if (quantos === 0) issues.push({ nodeId: `${tree.characterId}#${row}`, reason: `linha ${row} sem nó na coluna ${coluna}` });
      if (quantos > 1) issues.push({ nodeId: `${tree.characterId}#${row}`, reason: `linha ${row} com ${quantos} nós na coluna ${coluna}` });
    }
    // O meio é OPCIONAL — uma árvore sem convergência nenhuma é legítima (duas colunas
    // estanques, em que escolher a linha 1 escolhe a build). Mas dois meios na mesma linha
    // seriam duas portas na mesma parede.
    const meios = naLinha.filter((n) => n.column === 'middle').length;
    if (meios > 1) issues.push({ nodeId: `${tree.characterId}#${row}`, reason: `linha ${row} com ${meios} nós no meio` });
  }

  // A árvore precisa ter onde ABSORVER o orçamento inteiro. Um caminho gasta um ponto por linha
  // (`depth`) mais os ranks extras dos nós que ele atravessa; se o melhor caminho possível não
  // chega ao orçamento, sobram pontos sem onde ser gastos e o jogador termina com saldo e nada
  // para comprar. É erro de autoria, e é o preço de a profundidade ser livre.
  //
  // O teto é generoso de propósito (soma o extra de TODOS os nós, não só os de um caminho): o
  // motor recusa o impossível, e quanto o caminho realmente absorve é decisão de desenho de quem
  // autora a árvore, não invariante que o motor deva impor.
  const extraDisponivel = tree.nodes.reduce((acc, n) => acc + (n.maxRank - 1), 0);
  if (tree.depth + extraDisponivel < TALENT_POINT_BUDGET) {
    issues.push({
      nodeId: tree.characterId,
      reason: `a árvore não tem onde absorver os ${TALENT_POINT_BUDGET} pontos (profundidade ${tree.depth} + ${extraDisponivel} de rank)`,
    });
  }

  return { valid: issues.length === 0, issues };
}

// ---------------------------------------------------------------------------
// A alocação
// ---------------------------------------------------------------------------

// De qual coluna a linha seguinte pode vir, dada a coluna da linha atual. É a regra de §8.2
// escrita uma vez: do meio sai para qualquer lado; de uma coluna principal, continua-se nela ou
// entra-se no meio (que é a porta).
function permiteSeguir(anterior: TalentColumn, proxima: TalentColumn): boolean {
  if (anterior === 'middle') return true;
  return proxima === anterior || proxima === 'middle';
}

export interface ValidateColumnAllocationInput {
  readonly tree: ColumnTalentTree;
  readonly allocation: TalentAllocation;
  // Ausente vale 0, e não "sem gate": um personagem sem awakening declarado não ganha nó
  // avançado de graça.
  readonly awakening?: number;
}

export function validateColumnAllocation(input: ValidateColumnAllocationInput): ValidationResult {
  const { tree, allocation } = input;
  const porId = new Map(tree.nodes.map((n) => [n.id, n] as const));
  const issues: ValidationIssue[] = [];

  const alocados: { readonly node: ColumnTalentNode; readonly rank: number }[] = [];
  let total = 0;

  for (const [nodeId, rank] of Object.entries(allocation)) {
    if (rank <= 0) continue;
    const node = porId.get(nodeId);
    if (!node) {
      issues.push({ nodeId, reason: 'nó desconhecido na árvore' });
      continue;
    }
    if (rank > node.maxRank) issues.push({ nodeId, reason: `rank ${rank} excede maxRank ${node.maxRank}` });
    if (node.minAwakening !== undefined && (input.awakening ?? 0) < node.minAwakening) {
      issues.push({ nodeId, reason: `exige awakening ${node.minAwakening} (o personagem está em ${input.awakening ?? 0})` });
    }
    alocados.push({ node, rank });
    total += rank;
  }

  if (total > TALENT_POINT_BUDGET) {
    issues.push({ nodeId: tree.characterId, reason: `orçamento de ${TALENT_POINT_BUDGET} pontos excedido (${total} gastos)` });
  }

  // Um nó por linha.
  const porLinha = new Map<number, ColumnTalentNode>();
  for (const { node } of alocados) {
    const existente = porLinha.get(node.row);
    if (existente) {
      issues.push({ nodeId: node.id, reason: `linha ${node.row} já tem ${existente.id} alocado — é um nó por linha` });
      continue;
    }
    porLinha.set(node.row, node);
  }

  // Linhas contíguas a partir de 1: a árvore é um CAMINHO, não uma sacola de nós soltos. Sem
  // isto, o jogador compraria a linha 9 sem descer até ela.
  const linhas = [...porLinha.keys()].sort((a, b) => a - b);
  for (let i = 0; i < linhas.length; i++) {
    if (linhas[i] !== i + 1) {
      issues.push({ nodeId: porLinha.get(linhas[i]!)!.id, reason: `linha ${linhas[i]} alocada sem a linha ${i + 1}` });
      break;
    }
  }

  // A amarração de coluna, linha a linha.
  for (let row = 2; row <= linhas.length; row++) {
    const anterior = porLinha.get(row - 1);
    const atual = porLinha.get(row);
    if (!anterior || !atual) continue;
    if (!permiteSeguir(anterior.column, atual.column)) {
      issues.push({
        nodeId: atual.id,
        reason: `coluna ${atual.column} não segue a coluna ${anterior.column} da linha ${row - 1} — só o nó do meio libera a troca`,
      });
    }
  }

  return { valid: issues.length === 0, issues };
}

// O caminho alocado, em ordem de linha. É dado puro e serializável: quem desenha a árvore no
// cliente e quem resolve os efeitos leem daqui em vez de reordenar por conta própria.
export function allocatedPath(tree: ColumnTalentTree, allocation: TalentAllocation): readonly ColumnTalentNode[] {
  const porId = new Map(tree.nodes.map((n) => [n.id, n] as const));
  const alocados: ColumnTalentNode[] = [];

  for (const [nodeId, rank] of Object.entries(allocation)) {
    if (rank <= 0) continue;
    const node = porId.get(nodeId);
    if (node) alocados.push(node);
  }

  return alocados.sort((a, b) => a.row - b.row);
}
