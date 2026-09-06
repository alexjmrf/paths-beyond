import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import unitArtSchema from '../schemas/unit-art.schema.js';

// M26 — a DECLARAÇÃO de arte de cada unidade.
//
// O critério de aceite do milestone: "todo personagem e todo inimigo de `packages/data` tem
// asset declarado **ou** cai explicitamente no glifo programático, com teste que reprova
// conteúdo novo sem uma das duas coisas".
//
// A palavra que carrega o peso é **explicitamente**. Sem ela, "sem sprite" e "esqueci de gerar
// o sprite" são o mesmo estado do repositório, e a diferença só aparece quando alguém abre o
// jogo e vê um disco cinza no meio de cinquenta personagens desenhados. Por isso o glifo
// também precisa de um arquivo, e o arquivo precisa de um `motivo`: a ausência de arte passa a
// ser uma frase que alguém escreveu, não um silêncio.
//
// A bijeção é o teste inteiro. Unidade sem entrada é conteúdo novo entrando sem arte; entrada
// sem unidade é sprite órfão que ninguém desenha e ninguém apaga — e o segundo é o que
// acumula, porque não quebra nada.

const dataRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = join(dataRoot, '..', '..');

function idsDe(tipo: string): string[] {
  const dir = join(dataRoot, tipo);
  return readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .map((f) => JSON.parse(readFileSync(join(dir, f), 'utf8')).id as string);
}

interface Entrada {
  readonly arquivoJson: string;
  readonly conteudo: ReturnType<typeof unitArtSchema.parse>;
}

function entradas(): Entrada[] {
  const dir = join(dataRoot, 'unit-art');
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .map((f) => ({
      arquivoJson: f,
      conteudo: unitArtSchema.parse(JSON.parse(readFileSync(join(dir, f), 'utf8'))),
    }));
}

const UNIDADES = [...idsDe('characters'), ...idsDe('enemies')];

describe('M26 — arte declarada por unidade', () => {
  it('o teste não é vacuamente verdadeiro: ele enxerga o elenco e os inimigos', () => {
    // Sem esta âncora, um `readdirSync` que passasse a apontar para o lugar errado deixaria
    // todas as afirmações abaixo verdadeiras sobre uma lista vazia.
    expect(UNIDADES.length).toBeGreaterThanOrEqual(50);
    expect(UNIDADES).toContain('hero-jogador');
    expect(UNIDADES).toContain('enemy-bandido');
  });

  it('toda unidade tem exatamente uma declaração — sprite OU glifo, nunca nenhuma', () => {
    const declarados = entradas().map((e) => e.conteudo.unitId);
    const semDeclaracao = UNIDADES.filter((id) => !declarados.includes(id));
    expect(semDeclaracao).toEqual([]);
  });

  it('nenhuma declaração órfã — entrada sem unidade é sprite que ninguém desenha', () => {
    const orfas = entradas()
      .map((e) => e.conteudo.unitId)
      .filter((id) => !UNIDADES.includes(id));
    expect(orfas).toEqual([]);
  });

  it('uma unidade não é declarada duas vezes', () => {
    const declarados = entradas().map((e) => e.conteudo.unitId);
    expect(declarados.length).toBe(new Set(declarados).size);
  });

  it('o nome do arquivo é o `unitId` — é o que torna a duplicata impossível de commitar', () => {
    for (const e of entradas()) {
      expect(e.arquivoJson, e.arquivoJson).toBe(`${e.conteudo.unitId}.json`);
    }
  });

  it('todo sprite declarado EXISTE em disco — as TRÊS peças', () => {
    // O manifesto é uma promessa; este teste é o que a cobra. Uma entrada apontando para um
    // PNG que não veio no commit passa em toda validação de schema e quebra só na tela.
    //
    // M26 2/N — são três arquivos por unidade: a peça do tabuleiro e as duas de duelo. Conferir
    // só a primeira deixaria a tela de duelo quebrar com o manifesto verde.
    const faltando = entradas()
      .filter((e) => e.conteudo.kind === 'sprite')
      .flatMap((e) => {
        const c = e.conteudo as { arquivo: string; duelo: Record<string, string> };
        return [c.arquivo, ...Object.values(c.duelo)];
      })
      .filter((arquivo) => !existsSync(join(repoRoot, arquivo)));
    expect(faltando).toEqual([]);
  });

  it('as três peças de uma unidade são arquivos DIFERENTES', () => {
    // Um gerador que escrevesse o mesmo caminho três vezes passaria no teste acima e poria os
    // dois lados da cena de duelo olhando para o mesmo lado.
    for (const e of entradas()) {
      if (e.conteudo.kind !== 'sprite') continue;
      const c = e.conteudo as { arquivo: string; duelo: Record<string, string> };
      const todos = [c.arquivo, ...Object.values(c.duelo)];
      expect(new Set(todos).size, e.conteudo.unitId).toBe(todos.length);
    }
  });

  it('todo glifo declarado diz POR QUE — "ainda não gerado" é uma frase, não um silêncio', () => {
    for (const e of entradas()) {
      if (e.conteudo.kind !== 'glyph') continue;
      expect((e.conteudo as { motivo: string }).motivo.length, e.conteudo.unitId).toBeGreaterThan(10);
    }
  });

  it('toda procedência declara prompt, seed e licença — o aceite do M26 pede os três', () => {
    for (const e of entradas()) {
      if (e.conteudo.kind !== 'sprite') continue;
      const p = (e.conteudo as { procedencia: Record<string, unknown> }).procedencia;
      expect(p.prompt, e.conteudo.unitId).toBeTruthy();
      expect(typeof p.seed, e.conteudo.unitId).toBe('number');
      expect(p.licenca, e.conteudo.unitId).toBeTruthy();
    }
  });
});

describe('M26 — o schema da declaração', () => {
  const sprite = {
    unitId: 'ally-guerreiro',
    kind: 'sprite',
    arquivo: 'apps/client/src/art/units/ally-guerreiro.png',
    duelo: {
      sudeste: 'apps/client/src/art/units/ally-guerreiro-sudeste.png',
      sudoeste: 'apps/client/src/art/units/ally-guerreiro-sudoeste.png',
    },
    frameSize: 64,
    procedencia: {
      ferramenta: 'pixellab',
      endpoint: '/create-character-v3',
      modelo: 'character-v3',
      prompt: 'axe warrior, brown leather armor',
      seed: 424242,
      characterId: 'abc-123',
      licenca: 'PixelLab — assinatura Tier 1, uso comercial (pixellab.ai/termsofservice)',
      geradoEm: '2026-09-05',
    },
  };
  const glifo = { unitId: 'enemy-bandido', kind: 'glyph', motivo: 'Ainda não gerado — entra na sub-sessão 2/N.' };

  it('aceita as duas formas bem formadas', () => {
    expect(() => unitArtSchema.parse(sprite)).not.toThrow();
    expect(() => unitArtSchema.parse(glifo)).not.toThrow();
  });

  it('sprite sem procedência não passa — imagem sem origem é exatamente o que o M16 barrava', () => {
    const { procedencia: _, ...semProcedencia } = sprite;
    expect(() => unitArtSchema.parse(semProcedencia)).toThrow();
  });

  it('sprite sem seed não passa — sem seed a imagem não é regerável, e o manifesto vira decoração', () => {
    expect(() => unitArtSchema.parse({ ...sprite, procedencia: { ...sprite.procedencia, seed: undefined } })).toThrow();
  });

  it('glifo sem motivo não passa', () => {
    expect(() => unitArtSchema.parse({ unitId: 'enemy-bandido', kind: 'glyph' })).toThrow();
  });

  it('glifo não pode carregar arquivo, nem sprite pode carregar motivo — `.strict()` nos dois', () => {
    expect(() => unitArtSchema.parse({ ...glifo, arquivo: 'x.png' })).toThrow();
    expect(() => unitArtSchema.parse({ ...sprite, motivo: 'não deveria estar aqui' })).toThrow();
  });

  it('o arquivo do sprite mora no diretório de arte do cliente, e o schema exige isso', () => {
    // Sem a trava, um caminho qualquer valida — e o teste de `semAssetsRaster` do cliente,
    // que varre um diretório conhecido, deixaria de ver a imagem.
    expect(() => unitArtSchema.parse({ ...sprite, arquivo: 'apps/server/pirata.png' })).toThrow();
    expect(() => unitArtSchema.parse({ ...sprite, arquivo: 'ally-guerreiro.png' })).toThrow();
  });

  it('sprite sem as poses de duelo não passa — quem tem peça tem as três', () => {
    // O estado "tem peça de tabuleiro, não tem de duelo" não pode existir: o gerador baixa as
    // três na mesma passada, e deixá-lo opcional criaria um caso que nenhum caminho produz e
    // que a tela teria de tratar para sempre.
    const { duelo: _, ...semDuelo } = sprite;
    expect(() => unitArtSchema.parse(semDuelo)).toThrow();
    expect(() => unitArtSchema.parse({ ...sprite, duelo: { sudeste: sprite.duelo.sudeste } })).toThrow();
  });

  it('`kind` fora das duas opções não passa — não existe terceira via', () => {
    expect(() => unitArtSchema.parse({ ...glifo, kind: 'talvez' })).toThrow();
  });
});
