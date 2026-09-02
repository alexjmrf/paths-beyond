import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  TALENT_POINT_BUDGET,
  validateColumnAllocation,
  validateColumnTree,
  type ColumnTalentNode,
  type ColumnTalentTree,
  type TalentAllocation,
  type TalentColumn,
} from '@paths-beyond/core';
import { findJsonFiles } from '@paths-beyond/data/validate.js';
import { describe, expect, it } from 'vitest';
import { loadCatalogFromDisk } from '../src/loadCatalogFromDisk.js';

// M17, sub-sessão 2/N — o ELENCO e as nove árvores.
//
// A 1/N entregou o motor da árvore de duas colunas sem uma linha de conteúdo. Este
// arquivo é o outro lado: prova que as nove árvores autoradas são jogáveis de verdade —
// que passam pelo motor, que um caminho ponta a ponta gasta o orçamento inteiro, e que
// obedecem às regras de DESENHO de §8.2, que o motor deliberadamente não impõe porque
// são julgamento de autoria e não invariante de estrutura.
//
// Mora em `packages/content` porque é o único pacote que enxerga `core` e `data` ao
// mesmo tempo: `packages/data` não depende do core (e portanto não pode chamar
// `validateColumnTree`), e o core não pode ler conteúdo (regra 1).

const DATA_DIR = join(fileURLToPath(new URL('.', import.meta.url)), '..', '..', 'data');

function readAll<T>(type: string): T[] {
  return findJsonFiles(join(DATA_DIR, type)).map((file) => JSON.parse(readFileSync(file, 'utf8')) as T);
}

interface CharacterFile {
  readonly id: string;
  readonly name: string;
  readonly classId: string;
}

const elenco = readAll<CharacterFile>('characters');
const arvores = readAll<ColumnTalentTree>('character-talent-trees');
const catalog = loadCatalogFromDisk();

const arvorePorPersonagem = new Map(arvores.map((t) => [t.characterId, t] as const));

// D7 — o elenco cresce de 6 para 9: as classes jogáveis passam a ter todas um consumidor.
const TAMANHO_DO_ELENCO = 9;

// §10 — "Awakening (0–6): ... libera nós avançados de talento a partir de 5."
const AWAKENING_AVANCADO = 5;

// Um nó é PREENCHIMENTO quando tudo que ele faz é mexer em número: nenhum efeito dele
// toca skill, reação, tática, economia ou passiva. §8.2 limita esses a 30% da árvore, e
// a razão está escrita na regra vizinha — "talento que só dá número é talento fraco
// neste jogo".
function ehPreenchimento(node: ColumnTalentNode): boolean {
  return node.effects.length > 0 && node.effects.every((e) => e.t === 'stat');
}

// §8.2 — "Ao menos 2 nós por árvore DEVEM tocar a economia de AP/PP ou o sistema de
// assistência." Estes são os efeitos que fazem isso, e `grantReaction` entra porque a
// reação que uma árvore concede é `skill-assistir` (§6.5).
const EFEITOS_DE_ECONOMIA = new Set(['maxAp', 'maxPp', 'apRefund', 'duelApCap', 'assistRangeBonus', 'grantReaction']);

function tocaEconomia(node: ColumnTalentNode): boolean {
  return node.effects.some((e) => EFEITOS_DE_ECONOMIA.has(e.t));
}

function nosDaColuna(tree: ColumnTalentTree, column: TalentColumn): ColumnTalentNode[] {
  return [...tree.nodes].filter((n) => n.column === column).sort((a, b) => a.row - b.row);
}

// O caminho que desce inteiro por UMA coluna principal, gastando o orçamento até o fim:
// um ponto por linha e, com o que sobrar, ranks a mais nos nós do próprio caminho — que
// é literalmente a troca que §8.2 descreve ("uma árvore de 5 linhas gasta 5 descendo e
// tem 4 pontos para aprofundar nós de maxRank > 1 no caminho").
function caminhoPuro(tree: ColumnTalentTree, column: 'a' | 'b'): TalentAllocation {
  const alocacao: Record<string, number> = {};
  const nos = nosDaColuna(tree, column);
  let restante = TALENT_POINT_BUDGET;

  for (const node of nos) {
    if (restante <= 0) break;
    alocacao[node.id] = 1;
    restante -= 1;
  }
  for (const node of nos) {
    if (restante <= 0) break;
    // Nunca compra uma linha que o caminho não alcançou: §8.2 é explícita em que os
    // pontos que sobram "só podem aprofundar nós já alocados".
    const atual = alocacao[node.id];
    if (atual === undefined) break;
    const extra = Math.min(node.maxRank - 1, restante);
    alocacao[node.id] = atual + extra;
    restante -= extra;
  }

  return alocacao;
}

function pontosGastos(alocacao: TalentAllocation): number {
  return Object.values(alocacao).reduce((acc, rank) => acc + rank, 0);
}

const porArvore = arvores.map((t) => [t.characterId, t] as const);

describe('M17 §8.1 — o elenco é fechado e cobre as classes jogáveis', () => {
  it(`tem exatamente ${TAMANHO_DO_ELENCO} personagens, todos com id e nome únicos`, () => {
    expect(elenco).toHaveLength(TAMANHO_DO_ELENCO);
    expect(new Set(elenco.map((c) => c.id)).size).toBe(TAMANHO_DO_ELENCO);
    expect(new Set(elenco.map((c) => c.name)).size).toBe(TAMANHO_DO_ELENCO);
  });

  it('cada personagem tem exatamente uma árvore, e nenhuma árvore é órfã', () => {
    expect(arvores).toHaveLength(TAMANHO_DO_ELENCO);
    for (const personagem of elenco) {
      expect(arvorePorPersonagem.get(personagem.id), `sem árvore: ${personagem.id}`).toBeDefined();
    }
    for (const arvore of arvores) {
      expect(
        elenco.some((c) => c.id === arvore.characterId),
        `árvore órfã: ${arvore.characterId}`,
      ).toBe(true);
    }
  });

  // D7 — o elenco cresceu justamente porque grifeiro, guerreiro e lanceiro ficariam sem
  // ninguém para jogá-las: classe autorada sem consumidor é o antipadrão que M10, M11 e
  // M15 passaram o projeto corrigindo.
  it('toda classe NÃO-promovida do catálogo tem exatamente um personagem', () => {
    const classesJogaveis = Object.values(catalog.classes)
      .filter((c) => c.promotesFrom === undefined)
      .map((c) => c.id)
      .sort();
    const classesDoElenco = elenco.map((c) => c.classId).sort();

    expect(classesDoElenco).toEqual(classesJogaveis);
  });

  it('a classe de todo personagem existe no catálogo', () => {
    for (const personagem of elenco) {
      expect(catalog.classes[personagem.classId], `classe inexistente em ${personagem.id}`).toBeDefined();
    }
  });
});

describe('M17 §8.2 — as nove árvores passam pelo motor', () => {
  it.each(porArvore)('%s: `validateColumnTree` aceita', (_id, arvore) => {
    expect(validateColumnTree(arvore).issues).toEqual([]);
  });

  it.each(porArvore)('%s: profundidade em 5..9', (_id, arvore) => {
    expect(arvore.depth).toBeGreaterThanOrEqual(5);
    expect(arvore.depth).toBeLessThanOrEqual(9);
  });

  // D9 — a profundidade é FORMA e não poder. Se todas as nove tivessem a mesma
  // profundidade, a decisão não teria sido exercida por conteúdo nenhum e o orçamento
  // fixo não teria o que separar.
  it('as profundidades VARIAM, e os dois extremos da faixa são exercidos', () => {
    const profundidades = arvores.map((t) => t.depth);
    expect(new Set(profundidades).size).toBeGreaterThanOrEqual(4);
    expect(Math.min(...profundidades)).toBe(5);
    expect(Math.max(...profundidades)).toBe(9);
  });
});

describe('M17 §8.2 — o orçamento de 9 é gastável ponta a ponta, dos dois lados', () => {
  const casos = arvores.flatMap((arvore) => (['a', 'b'] as const).map((coluna) => [arvore.characterId, coluna, arvore] as const));

  it.each(casos)('%s, coluna %s: o caminho puro gasta o orçamento inteiro e é legal', (_id, coluna, arvore) => {
    const alocacao = caminhoPuro(arvore, coluna);

    expect(pontosGastos(alocacao)).toBe(TALENT_POINT_BUDGET);
    // `awakening: 0` de propósito: um gate de despertar NUNCA pode ser o que impede um
    // personagem recém-recrutado de gastar os pontos que ele tem. Se um nó avançado
    // fosse a única saída de uma linha, esta asserção cairia.
    expect(validateColumnAllocation({ tree: arvore, allocation: alocacao, awakening: 0 }).issues).toEqual([]);
  });
});

describe('M17 §8.2 — as regras de DESENHO da árvore', () => {
  it.each(porArvore)('%s: no máximo 30% dos nós são preenchimento', (_id, arvore) => {
    const preenchimento = arvore.nodes.filter(ehPreenchimento).length;
    expect(preenchimento * 10).toBeLessThanOrEqual(arvore.nodes.length * 3);
  });

  it.each(porArvore)('%s: cada coluna principal ABASTECE os pools de AP/PP', (_id, arvore) => {
    // M17, 5/N — o teste acima conta `assistRangeBonus` e `grantReaction` como economia, e é
    // por essa brecha que uma coluna podia passar sem NENHUMA fonte de AP ou PP. Era o caso
    // das colunas de apoio de Miron e de Wren, e o torneio mediu o preço: com o resto igual,
    // uma coluna sem pool joga um jogo em que ela não pode pagar pelo que a árvore concede.
    //
    // O que este teste NÃO pega, e é honesto dizer: ele não afere PODER. Duas colunas com um
    // `maxPp` cada podem valer coisas muito diferentes, e foi exatamente assim que as nove
    // árvores saíram da 2/N com 25 pontos percentuais de diferença entre elas. Quem mede isso
    // é `pnpm balance` (regra 10) — ver `DECISIONS.md`, "M17 — sub-sessão 5/N", que registra o
    // método de isolar a força de cada árvore a partir da matriz.
    const ABASTECEM = new Set(['maxAp', 'maxPp', 'apRefund', 'duelApCap']);
    for (const coluna of ['a', 'b'] as const) {
      const fontes = nosDaColuna(arvore, coluna).filter((n) =>
        // `n > 0`: `contraSimples` traz um `maxAp(-1)` como CUSTO do contra-ataque grátis, e
        // um custo não é uma fonte.
        n.effects.some((e) => ABASTECEM.has(e.t) && (e as { n?: number }).n !== undefined && (e as { n: number }).n > 0),
      );
      expect(fontes.length, `coluna ${coluna} sem nenhuma fonte de AP/PP`).toBeGreaterThanOrEqual(1);
    }
  });

  it.each(porArvore)('%s: cada coluna principal tem ao menos 2 nós de economia', (_id, arvore) => {
    for (const coluna of ['a', 'b'] as const) {
      expect(nosDaColuna(arvore, coluna).filter(tocaEconomia).length, `coluna ${coluna}`).toBeGreaterThanOrEqual(2);
    }
  });

  // §8.2 — "As duas colunas DEVEM ser papéis diferentes de verdade, não a mesma build
  // com números distintos." A heurística que dá para automatizar: cada lado precisa
  // oferecer ao menos um tipo de efeito que o outro não oferece. Não prova que os papéis
  // são interessantes; prova que eles não são a mesma coisa duas vezes.
  it.each(porArvore)('%s: A e B oferecem efeitos que o outro lado não tem', (_id, arvore) => {
    const tipos = (coluna: 'a' | 'b') => new Set(nosDaColuna(arvore, coluna).flatMap((n) => n.effects.map((e) => e.t)));
    const a = tipos('a');
    const b = tipos('b');

    expect([...a].some((t) => !b.has(t)), 'A não tem nada que B não tenha').toBe(true);
    expect([...b].some((t) => !a.has(t)), 'B não tem nada que A não tenha').toBe(true);
  });

  // §8.2 — "O nó de convergência DEVE valer a pena pelo efeito dele, e não só pela porta
  // que abre — senão trocar de coluna custa um ponto morto."
  it.each(porArvore)('%s: todo nó do meio tem efeito próprio, e nenhum é só número', (_id, arvore) => {
    const meios = arvore.nodes.filter((n) => n.column === 'middle');
    expect(meios.length, 'sem convergência nenhuma').toBeGreaterThanOrEqual(1);
    for (const meio of meios) {
      expect(meio.effects.length, meio.id).toBeGreaterThan(0);
      expect(ehPreenchimento(meio), `${meio.id} é preenchimento`).toBe(false);
    }
  });
});

describe('M17 §10 — o gate de despertar reencontrou lugar', () => {
  it.each(porArvore)('%s: tem nó avançado, e ele exige awakening >= 5', (_id, arvore) => {
    const gated = arvore.nodes.filter((n) => n.minAwakening !== undefined);
    expect(gated.length, 'nenhum nó avançado').toBeGreaterThanOrEqual(1);
    for (const node of gated) {
      expect(node.minAwakening, node.id).toBeGreaterThanOrEqual(AWAKENING_AVANCADO);
    }
  });

  // O gate mora numa CONVERGÊNCIA e não numa coluna principal, e isso não é decoração:
  // um nó gated numa coluna principal seria um buraco na linha — quem descesse por ali
  // com awakening baixo travaria o caminho e ficaria com pontos sem onde gastar. No
  // meio, o gate tira uma PORTA de quem ainda não despertou, nunca o chão.
  it.each(porArvore)('%s: o gate está no meio, nunca numa coluna principal', (_id, arvore) => {
    for (const node of arvore.nodes.filter((n) => n.minAwakening !== undefined)) {
      expect(node.column, node.id).toBe('middle');
    }
  });

  it.each(porArvore)('%s: sempre sobra uma convergência aberta em awakening 0', (_id, arvore) => {
    const abertas = arvore.nodes.filter((n) => n.column === 'middle' && n.minAwakening === undefined);
    expect(abertas.length, 'toda convergência exige despertar').toBeGreaterThanOrEqual(1);
  });
});

describe('M17 — as árvores só referenciam conteúdo que existe', () => {
  it.each(porArvore)('%s: skills, reações e efeitos referenciados existem no catálogo', (_id, arvore) => {
    for (const node of arvore.nodes) {
      for (const efeito of node.effects) {
        if (efeito.t === 'grantSkill') expect(catalog.skills[efeito.skillId], `${node.id} → ${efeito.skillId}`).toBeDefined();
        if (efeito.t === 'grantReaction') expect(catalog.skills[efeito.reactionId], `${node.id} → ${efeito.reactionId}`).toBeDefined();
        if (efeito.t === 'modifySkill') {
          expect(catalog.skills[efeito.skillId], `${node.id} → ${efeito.skillId}`).toBeDefined();
          for (const aplicacao of efeito.patch.effects ?? []) {
            expect(catalog.effects[aplicacao.effectId], `${node.id} → ${aplicacao.effectId}`).toBeDefined();
          }
        }
      }
    }
  });

  // A skill que a árvore toca não pode ser de OUTRA classe: um talento do Clérigo
  // remendando a especial do Arqueiro passaria em todas as asserções acima e não faria
  // sentido nenhum no jogo.
  //
  // A regra é escrita pela negativa, e não como "termina no slug da própria classe",
  // porque nem toda skill de uma classe carrega o slug dela: `skill-folego-de-combate` é
  // a reação própria do Arqueiro e `skill-ultimo-suspiro` é a do Couraçado — as duas
  // ficariam de fora de uma regra pela positiva, e ficar de fora significaria conteúdo
  // autorado sem consumidor, que é exatamente o que D7 acabou de corrigir.
  it.each(porArvore)('%s: nenhuma skill tocada pertence a outra classe', (_id, arvore) => {
    const personagem = elenco.find((c) => c.id === arvore.characterId)!;
    const proprio = personagem.classId.replace(/^class-/, '');
    const alheios = Object.keys(catalog.classes)
      .map((id) => id.replace(/^class-/, ''))
      .filter((slug) => slug !== proprio);

    for (const node of arvore.nodes) {
      for (const efeito of node.effects) {
        const skillId =
          efeito.t === 'grantSkill' || efeito.t === 'modifySkill' ? efeito.skillId : efeito.t === 'grantReaction' ? efeito.reactionId : undefined;
        if (skillId === undefined) continue;
        const deOutraClasse = alheios.find((slug) => skillId.endsWith(`-${slug}`));
        expect(deOutraClasse, `${node.id} → ${skillId}`).toBeUndefined();
      }
    }
  });
});
