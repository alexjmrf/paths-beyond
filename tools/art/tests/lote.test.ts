import { describe, expect, it } from 'vitest';
import { gerarLote, seedDe } from '../src/lote.js';
import type { EspecificacaoDeArte } from '../src/prompt.js';

// M26 3/N — o lote, exercitado sem falar com a PixelLab.
//
// Por que o lote existe, e por que ele é testado antes de rodar: o critério de aceite do M26
// diz "a geração é um script repetível", e a palavra que pesa é **repetível**. `gerar <unitId>`
// resolve UMA peça; quarenta e oito invocações à mão não são um script, são um turno de
// trabalho que ninguém refaz quando o bloco de estilo mudar.
//
// E o lote tem duas falhas próprias que a geração de uma peça não tem — as duas medidas de
// verdade em 1/N, não imaginadas aqui:
//
//   1. a API recusa trabalho excedente com 429 ("Not enough concurrent job slots"). Disparar as
//      48 de uma vez faria a metade voltar como erro, e o cliente reenvia mas a espera cresce;
//      o teto de trabalhos em voo é o que evita pagar essa espera 48 vezes.
//   2. uma execução de meia hora vai ser interrompida. Se retomar regerasse o que já ficou
//      pronto, cada interrupção custaria gerações da assinatura — que são finitas e do mês.
//
// `gerarUma` é injetada: o lote não sabe o que é uma requisição, e o teste não precisa de
// `fetch` falso para afirmar concorrência, retomada e isolamento de falha.

function espec(unitId: string): EspecificacaoDeArte {
  return {
    unitId,
    nome: unitId,
    side: 'player',
    weaponType: 'sword',
    unitType: 'infantry',
    moveType: 'foot',
  };
}

const SPECS = ['a', 'b', 'c', 'd', 'e', 'f', 'g'].map(espec);

describe('seedDe', () => {
  it('é derivada do id e estável entre execuções', () => {
    expect(seedDe('ally-guerreiro')).toBe(seedDe('ally-guerreiro'));
    expect(seedDe('ally-guerreiro')).not.toBe(seedDe('ally-arqueiro'));
  });

  it('cabe num uint32 — é o que a API aceita como seed', () => {
    for (const s of SPECS) {
      const seed = seedDe(s.unitId);
      expect(Number.isInteger(seed)).toBe(true);
      expect(seed).toBeGreaterThanOrEqual(0);
      expect(seed).toBeLessThanOrEqual(0xffffffff);
    }
  });
});

describe('gerarLote', () => {
  it('gera cada unidade uma vez, com a seed derivada do id', async () => {
    const vistos: { unitId: string; seed: number }[] = [];
    const relatorio = await gerarLote({
      specs: SPECS,
      paralelo: 3,
      jaTemSprite: () => false,
      gerarUma: async (e, seed) => {
        vistos.push({ unitId: e.unitId, seed });
      },
    });

    expect(vistos.map((v) => v.unitId).sort()).toEqual(['a', 'b', 'c', 'd', 'e', 'f', 'g']);
    for (const visto of vistos) expect(visto.seed).toBe(seedDe(visto.unitId));
    expect(relatorio.geradas).toEqual(['a', 'b', 'c', 'd', 'e', 'f', 'g']);
    expect(relatorio.puladas).toEqual([]);
    expect(relatorio.falhas).toEqual([]);
  });

  it('pula quem já tem sprite declarado — retomar não gasta geração de novo', async () => {
    const gerados: string[] = [];
    const relatorio = await gerarLote({
      specs: SPECS,
      paralelo: 2,
      jaTemSprite: (unitId) => unitId === 'a' || unitId === 'd',
      gerarUma: async (e) => {
        gerados.push(e.unitId);
      },
    });

    expect(gerados.sort()).toEqual(['b', 'c', 'e', 'f', 'g']);
    expect(relatorio.puladas).toEqual(['a', 'd']);
  });

  it('`refazer` ignora o que já existe e regera tudo — é como o estilo muda', async () => {
    const gerados: string[] = [];
    const relatorio = await gerarLote({
      specs: SPECS,
      paralelo: 2,
      refazer: true,
      jaTemSprite: () => true,
      gerarUma: async (e) => {
        gerados.push(e.unitId);
      },
    });

    expect(gerados).toHaveLength(7);
    expect(relatorio.puladas).toEqual([]);
  });

  it('nunca passa do teto de trabalhos em voo', async () => {
    let emVoo = 0;
    let pico = 0;
    await gerarLote({
      specs: SPECS,
      paralelo: 3,
      jaTemSprite: () => false,
      gerarUma: async () => {
        emVoo += 1;
        pico = Math.max(pico, emVoo);
        await new Promise((r) => setTimeout(r, 5));
        emVoo -= 1;
      },
    });

    // Igual e não menor: um lote que respeitasse o teto rodando um de cada vez também
    // passaria por "nunca passa de 3", e seria 3x mais lento sem ninguém notar.
    expect(pico).toBe(3);
  });

  it('uma unidade que falha não derruba as outras, e sai nomeada no relatório', async () => {
    const gerados: string[] = [];
    const relatorio = await gerarLote({
      specs: SPECS,
      paralelo: 3,
      jaTemSprite: () => false,
      gerarUma: async (e) => {
        if (e.unitId === 'c') throw new Error('a PixelLab desistiu');
        gerados.push(e.unitId);
      },
    });

    expect(gerados.sort()).toEqual(['a', 'b', 'd', 'e', 'f', 'g']);
    expect(relatorio.geradas).not.toContain('c');
    expect(relatorio.falhas).toEqual([{ unitId: 'c', erro: 'a PixelLab desistiu' }]);
  });

  it('`somente` corta o lote sem embaralhar a ordem — é como se olha um pedaço antes de soltar tudo', async () => {
    const gerados: string[] = [];
    await gerarLote({
      specs: SPECS,
      paralelo: 4,
      somente: 2,
      jaTemSprite: () => false,
      gerarUma: async (e) => {
        gerados.push(e.unitId);
      },
    });

    expect(gerados.sort()).toEqual(['a', 'b']);
  });

  it('`somente` conta o que vai GERAR, não o que vai percorrer', async () => {
    // A diferença aparece exatamente ao retomar: com 'a' e 'b' já prontas, `--somente 2`
    // contando a lista inteira geraria zero peças e diria que fez o pedido.
    const gerados: string[] = [];
    await gerarLote({
      specs: SPECS,
      paralelo: 4,
      somente: 2,
      jaTemSprite: (unitId) => unitId === 'a' || unitId === 'b',
      gerarUma: async (e) => {
        gerados.push(e.unitId);
      },
    });

    expect(gerados.sort()).toEqual(['c', 'd']);
  });

  it('avisa a cada peça — meia hora sem uma linha na tela é indistinguível de travado', async () => {
    const eventos: string[] = [];
    await gerarLote({
      specs: [espec('a'), espec('b')],
      paralelo: 1,
      jaTemSprite: () => false,
      aoTerminar: (evento) => eventos.push(`${evento.unitId}:${evento.estado}`),
      gerarUma: async (e) => {
        if (e.unitId === 'b') throw new Error('nao');
      },
    });

    expect(eventos).toEqual(['a:ok', 'b:falha']);
  });
});
