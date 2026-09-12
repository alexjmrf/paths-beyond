import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { CATALOGOS } from '../src/i18n/catalogos.js';
import { IDIOMA_PADRAO } from '../src/i18n/idioma.js';

// M29 — a frase e QUEM A CHAMA, conferidos um contra o outro.
//
// `catalogos.test.ts` já trava a metade do catálogo: todas as línguas têm as mesmas chaves e
// os mesmos marcadores de interpolação. **A outra metade não tinha dono:** nada conferia se a
// tela fornece os marcadores que a frase declara. Quando ela não fornece, o jogador lê
// `{capitulo}` — a chave crua, na tela, em produção.
//
// O defeito que motivou o arquivo é do M27, e é o padrão que esta sessão encontrou em três
// lugares diferentes: **duas metades certas que não se encontram.**
// `campanha.primeiraVitoria` anunciava só uma das duas regras de D31, e
// `premiumOnChapterClear` chegava do servidor e ficava guardado no store sem que nada o
// mostrasse.

const raizSrc = join(dirname(fileURLToPath(import.meta.url)), '..', 'src');

function fontes(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entrada) => {
    const caminho = join(dir, entrada.name);
    if (entrada.isDirectory()) return fontes(caminho);
    return /\.tsx?$/.test(entrada.name) ? [caminho] : [];
  });
}

/** Os `{marcadores}` que uma frase declara. */
function marcadoresDa(chave: string): readonly string[] {
  const frase = CATALOGOS[IDIOMA_PADRAO][chave];
  if (frase === undefined) return [];
  return [...frase.matchAll(/\{(\w+)\}/g)].map((m) => m[1]!).sort();
}

interface Chamada {
  readonly arquivo: string;
  readonly chave: string;
  readonly fornecidos: readonly string[];
}

/**
 * Toda chamada `t('chave', { ... })` do cliente, com os nomes fornecidos.
 *
 * **O objeto de parâmetros ANINHA**, e a primeira versão deste extrator não sabia disso:
 * `t('talento.no', { coluna: t('talento.colunaLetra', { letra: ... }), ... })` tem um objeto
 * dentro do outro. Parar no primeiro `}` truncava a lista e acusava quatro telas CORRETAS de
 * deixar marcador sem valor — seis "defeitos" que não existiam.
 *
 * Por isso a varredura conta chaves e só recolhe os nomes do NÍVEL 1. O `t` interno vira uma
 * chamada própria, conferida por si.
 */
function chamadasComParametros(): readonly Chamada[] {
  const encontradas: Chamada[] = [];

  for (const arquivo of fontes(raizSrc)) {
    const src = readFileSync(arquivo, 'utf8');

    for (const m of src.matchAll(/\bt\(\s*'([\w.]+)'\s*,\s*\{/g)) {
      const inicio = m.index! + m[0].length;

      let profundidade = 1;
      let fim = inicio;
      while (fim < src.length && profundidade > 0) {
        const c = src[fim];
        if (c === '{') profundidade += 1;
        else if (c === '}') profundidade -= 1;
        if (profundidade > 0) fim += 1;
      }

      // Os nomes do nível 1: parte o corpo nas vírgulas de nível 0 e lê cada segmento.
      // **Precisa cobrir o atalho** (`{ total, round }`, sem `:`) — um regex de `nome:`
      // deixava três telas corretas passarem por defeituosas.
      const corpo = src.slice(inicio, fim);
      const segmentos: string[] = [];
      let nivel = 0;
      let atual = '';
      for (const c of corpo) {
        if (c === '{' || c === '(' || c === '[') nivel += 1;
        else if (c === '}' || c === ')' || c === ']') nivel -= 1;

        if (c === ',' && nivel === 0) {
          segmentos.push(atual);
          atual = '';
        } else {
          atual += c;
        }
      }
      segmentos.push(atual);

      const fornecidos = segmentos
        .map((seg) => {
          const corte = seg.indexOf(':');
          // Com `:` o nome é o que vem antes; sem `:`, o segmento inteiro é o atalho.
          return (corte >= 0 ? seg.slice(0, corte) : seg).trim();
        })
        .filter((n) => /^\w+$/.test(n));

      encontradas.push({ arquivo, chave: m[1]!, fornecidos: fornecidos.sort() });
    }
  }

  return encontradas;
}

const nome = (caminho: string) => caminho.split(/[/\\]/).pop();

describe('a tela fornece o que a frase pede', () => {
  it('há chamadas com parâmetros para conferir — senão este teste não afirma nada', () => {
    // A guarda contra o próprio arquivo virar vacuamente verde: se o extrator parar de casar
    // (uma mudança de formatação, um `t` renomeado), tudo passa e ninguém percebe. É o mesmo
    // defeito que o M29 veio consertar em `conteudoTraduzido.test.ts`.
    expect(chamadasComParametros().length).toBeGreaterThan(5);
  });

  it('nenhuma chamada deixa um marcador sem valor', () => {
    const faltando = chamadasComParametros()
      .map((c) => ({ ...c, ausentes: marcadoresDa(c.chave).filter((m) => !c.fornecidos.includes(m)) }))
      .filter((c) => c.ausentes.length > 0)
      .map((c) => `${c.chave} (${nome(c.arquivo)}): falta ${c.ausentes.join(', ')}`);

    expect(faltando, 'o jogador veria o marcador cru na tela').toEqual([]);
  });

  it('nem fornece um valor que a frase não usa', () => {
    // A direção contrária, e ela pega o caso real do M27 de cabeça para baixo: um parâmetro
    // que ninguém interpola é uma informação que o código julgou relevante e a frase esqueceu
    // de dizer.
    const sobrando = chamadasComParametros()
      .map((c) => ({ ...c, extras: c.fornecidos.filter((f) => !marcadoresDa(c.chave).includes(f)) }))
      .filter((c) => c.extras.length > 0)
      .map((c) => `${c.chave} (${nome(c.arquivo)}): sobra ${c.extras.join(', ')}`);

    expect(sobrando, 'a frase ignora um valor que a tela achou que importava').toEqual([]);
  });
});
