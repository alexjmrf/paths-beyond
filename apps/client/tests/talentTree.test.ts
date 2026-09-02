import { TALENT_POINT_BUDGET, validateColumnAllocation, type TalentAllocation } from '@paths-beyond/core';
import { describe, expect, it } from 'vitest';
import { catalog } from '../src/data/catalog.js';
import { encodeBuildCode, readBuildCodeFor } from '../src/logic/buildCode.js';
import { availabilityByNode, layoutColumnTree, pointsSpent } from '../src/logic/talentLayout.js';

// §8.2 (M17, sub-sessão 4/N) — a tela da árvore de duas colunas.
//
// O critério de aceite 1 do milestone é comportamento de CLIENTE: "um personagem aloca uma
// árvore de duas colunas ponta a ponta pelo cliente, a amarração impede as escolhas ilegais,
// e a convergência libera a troca". Este arquivo é a metade dele que um teste consegue
// provar; a outra metade é o usuário vendo no browser.
//
// A decisão de forma que atravessa tudo aqui: **o cliente não sabe a regra da amarração.**
// `permiteSeguir` mora em `packages/core/src/talents/columnTree.ts` e não é reescrita aqui —
// `availabilityByNode` monta a alocação candidata e PERGUNTA ao core se ela vale (regra 3 do
// CLAUDE.md: "nenhuma regra no cliente"). Reimplementar a amarração no cliente daria uma tela
// que concorda com o motor até o dia em que uma das duas cópias mudar.

const MIRON = catalog.characterTalentTrees['ally-clerigo']!;
const SYLLA = catalog.characterTalentTrees['ally-arqueiro']!;

// Miron é o caso de teste porque a árvore dele tem tudo que precisa ser exercido: duas
// convergências (linhas 3 e 5), um gate de despertar (`chamado`, minAwakening 5) e nós de
// `maxRank > 1` para o orçamento sobrar em cima.
const R1_A = 'talent-miron-imposicao-de-maos';
const R1_B = 'talent-miron-luz-punitiva';
const R2_A = 'talent-miron-oracao-constante';
const R2_B = 'talent-miron-zelo';
const R3_A = 'talent-miron-mao-que-alcanca';
const R3_MEIO = 'talent-miron-passo-de-fe';
const R4_A = 'talent-miron-calor-do-santuario';
const R4_B = 'talent-miron-fervor';
const R5_A = 'talent-miron-refugio';
const R5_MEIO = 'talent-miron-chamado';
const R6_A = 'talent-miron-vigilia-branca';
const R7_A = 'talent-miron-maestria-da-luz';

function disponiveis(allocation: TalentAllocation, awakening = 0): readonly string[] {
  const mapa = availabilityByNode({ tree: MIRON, allocation, awakening });
  return [...mapa.entries()]
    .filter(([, a]) => a.canAllocate)
    .map(([id]) => id)
    .sort();
}

describe('layout: três colunas e um nó por linha', () => {
  it('a coluna do dado vira a coluna da tela, e o meio fica no meio', () => {
    const posicoes = layoutColumnTree(MIRON);
    const porId = new Map(posicoes.map((p) => [p.node.id, p] as const));
    expect(porId.get(R1_A)!.col).toBe(0);
    expect(porId.get(R3_MEIO)!.col).toBe(1);
    expect(porId.get(R1_B)!.col).toBe(2);
  });

  it('toda árvore do elenco se desenha inteira, sem nó perdido e sem nó fora da grade', () => {
    // A completude importa porque o painel desenha a partir DESTA lista: um nó que o layout
    // esquecesse simplesmente não existiria na tela, e ninguém reclamaria.
    for (const [characterId, arvore] of Object.entries(catalog.characterTalentTrees)) {
      const posicoes = layoutColumnTree(arvore);
      expect(posicoes.length, characterId).toBe(arvore.nodes.length);
      for (const p of posicoes) {
        expect(p.row, `${characterId}/${p.node.id}`).toBeGreaterThanOrEqual(1);
        expect(p.row, `${characterId}/${p.node.id}`).toBeLessThanOrEqual(arvore.depth);
        expect([0, 1, 2], `${characterId}/${p.node.id}`).toContain(p.col);
      }
    }
  });
});

describe('a amarração impede a escolha ilegal (critério 1)', () => {
  it('na linha 1 as duas colunas estão abertas — é a escolha que ainda não foi feita', () => {
    expect(disponiveis({})).toEqual([R1_A, R1_B].sort());
  });

  it('escolhida a coluna A na linha 1, a linha 2 só oferece A', () => {
    const abertos = disponiveis({ [R1_A]: 1 });
    expect(abertos).toContain(R2_A);
    expect(abertos).not.toContain(R2_B);
  });

  it('a linha 3 não é comprável sem a linha 2 — a árvore é um caminho, não uma sacola', () => {
    expect(disponiveis({ [R1_A]: 1 })).not.toContain(R3_A);
  });

  it('o motivo do bloqueio é o texto do CORE, não uma frase escrita no cliente', () => {
    const mapa = availabilityByNode({ tree: MIRON, allocation: { [R1_A]: 1 }, awakening: 0 });
    const doCore = validateColumnAllocation({
      tree: MIRON,
      allocation: { [R1_A]: 1, [R2_B]: 1 },
      awakening: 0,
    });
    expect(mapa.get(R2_B)!.blockedReason).toBe(doCore.issues[0]!.reason);
  });
});

describe('a convergência libera a troca (critério 1)', () => {
  it('o nó do meio abre as DUAS colunas da linha seguinte', () => {
    const abertos = disponiveis({ [R1_A]: 1, [R2_A]: 1, [R3_MEIO]: 1 });
    expect(abertos).toContain(R4_A);
    expect(abertos).toContain(R4_B);
  });

  it('sem passar pelo meio, a coluna escolhida continua amarrando', () => {
    const abertos = disponiveis({ [R1_A]: 1, [R2_A]: 1, [R3_A]: 1 });
    expect(abertos).toContain(R4_A);
    expect(abertos).not.toContain(R4_B);
  });

  it('a coluna escolhida DEPOIS do meio volta a amarrar', () => {
    const abertos = disponiveis({ [R1_A]: 1, [R2_A]: 1, [R3_MEIO]: 1, [R4_B]: 1 });
    expect(abertos).not.toContain(R5_A);
  });
});

describe('o orçamento é do jogo, e é fixo em 9', () => {
  it('gasto o último ponto, nada mais é comprável', () => {
    // Sete linhas descendo a coluna A mais dois ranks extras: 9 pontos exatos (§8.2 — a
    // profundidade é troca de forma, e uma árvore de 7 linhas sobra 2 para rank).
    const cheia: TalentAllocation = {
      [R1_A]: 1,
      [R2_A]: 2,
      [R3_A]: 1,
      [R4_A]: 2,
      [R5_A]: 1,
      [R6_A]: 1,
      [R7_A]: 1,
    };
    expect(pointsSpent(cheia)).toBe(TALENT_POINT_BUDGET);
    expect(disponiveis(cheia)).toEqual([]);
  });

  it('o gate de despertar é do core e aparece na tela como bloqueio', () => {
    const ateQuatro: TalentAllocation = { [R1_A]: 1, [R2_A]: 1, [R3_MEIO]: 1, [R4_A]: 1 };
    expect(disponiveis(ateQuatro, 0)).not.toContain(R5_MEIO);
    expect(disponiveis(ateQuatro, 5)).toContain(R5_MEIO);
  });
});

describe('desfazer: o rank sai de qualquer nó, a LINHA só sai da ponta', () => {
  it('um nó de rank 2 volta para rank 1 mesmo no meio do caminho', () => {
    const mapa = availabilityByNode({
      tree: MIRON,
      allocation: { [R1_A]: 1, [R2_A]: 2, [R3_A]: 1 },
      awakening: 0,
    });
    expect(mapa.get(R2_A)!.canDeallocate).toBe(true);
  });

  it('tirar o último ponto de uma linha do meio é recusado — deixaria as de baixo penduradas', () => {
    const mapa = availabilityByNode({
      tree: MIRON,
      allocation: { [R1_A]: 1, [R2_A]: 1, [R3_A]: 1 },
      awakening: 0,
    });
    expect(mapa.get(R2_A)!.canDeallocate).toBe(false);
    // A ponta do caminho sai: é por ela que se desfaz, e é o que sobra para o jogador que
    // não quer resetar a árvore inteira.
    expect(mapa.get(R3_A)!.canDeallocate).toBe(true);
  });
});

describe('o cliente não reimplementa a amarração', () => {
  it('para todo nó, a resposta da tela é a do core sobre a alocação candidata', () => {
    // Guarda de regressão contra a "otimização" óbvia — reescrever `permiteSeguir` no
    // cliente para não chamar o validador N vezes por render. Duas cópias da regra é a
    // divergência que §9.1 chama de bug crítico, e ela não apareceria em nenhuma tela.
    const caminho: TalentAllocation = { [R1_A]: 1, [R2_A]: 1, [R3_MEIO]: 1 };
    const mapa = availabilityByNode({ tree: MIRON, allocation: caminho, awakening: 3 });
    for (const node of MIRON.nodes) {
      const rank = caminho[node.id] ?? 0;
      const candidata = { ...caminho, [node.id]: rank + 1 };
      const doCore = validateColumnAllocation({ tree: MIRON, allocation: candidata, awakening: 3 });
      expect(mapa.get(node.id)!.canAllocate, node.id).toBe(doCore.valid);
    }
  });
});

describe('build code: o código é de um PERSONAGEM, não de uma classe', () => {
  it('vai e volta preservando a alocação', () => {
    const talents: TalentAllocation = { [R1_A]: 1, [R2_A]: 2 };
    const lido = readBuildCodeFor('ally-clerigo', MIRON, encodeBuildCode({ characterId: 'ally-clerigo', talents }));
    expect(lido.ok).toBe(true);
    expect(lido.ok && lido.talents).toEqual(talents);
  });

  it('código de OUTRO personagem é recusado em vez de aplicado', () => {
    // Sem esta trava o código de Sylla entraria na árvore de Miron, todo nó seria
    // desconhecido, e `resolveTalentEffects` os ignoraria em silêncio (§8.2): o jogador
    // colaria uma build e ficaria com zero talento sem nenhum aviso.
    const daSylla = encodeBuildCode({
      characterId: 'ally-arqueiro',
      talents: { 'talent-sylla-pes-leves': 1 },
    });
    const lido = readBuildCodeFor('ally-clerigo', MIRON, daSylla);
    expect(lido.ok).toBe(false);
    expect(lido.ok === false && lido.reason).toContain('ally-arqueiro');
  });

  it('código do personagem certo mas com build impossível é recusado pelo core', () => {
    const impossivel = encodeBuildCode({ characterId: 'ally-clerigo', talents: { [R7_A]: 1 } });
    expect(readBuildCodeFor('ally-clerigo', MIRON, impossivel).ok).toBe(false);
  });

  it('lixo não derruba a tela', () => {
    expect(readBuildCodeFor('ally-clerigo', MIRON, 'não é base64 de nada').ok).toBe(false);
    expect(readBuildCodeFor('ally-clerigo', MIRON, '').ok).toBe(false);
  });

  it('a árvore de Sylla aceita a build de Sylla — a trava é o personagem, não a árvore de Miron', () => {
    const codigo = encodeBuildCode({
      characterId: 'ally-arqueiro',
      talents: { 'talent-sylla-pes-leves': 1, 'talent-sylla-folego-de-combate': 1 },
    });
    expect(readBuildCodeFor('ally-arqueiro', SYLLA, codigo).ok).toBe(true);
  });
});
