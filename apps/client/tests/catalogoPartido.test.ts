import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { CONTEUDO_SO_DO_SERVIDOR } from '@paths-beyond/content/src/catalogoDoCliente.js';
import { catalog } from '../src/data/catalog.js';

// M36 3/N (D47/D48) — O CATÁLOGO ESTÁ PARTIDO, e este arquivo é a trava.
//
// **O buraco que a fatia fechou.** A 2/N escondeu o inimigo no fio: nenhuma resposta de rota de
// batalha carrega stat, skill, script, `moveType` ou alcance de unidade inimiga. Mas o cliente
// empacotava o catálogo INTEIRO em build-time, e `packages/data/encounters/`,
// `dungeon-encounters/` e `enemies/` descrevem, com nome e número, todo inimigo de PvE. Esconder
// no fio e distribuir no instalador é o mesmo teatro que o teorema de D47 usou para proibir a
// simulação no cliente: o dado está na máquina de quem joga, e dado que está na máquina se lê.
//
// **Por que a asserção é DUPLA.** Uma delas olha o objeto em memória e a outra olha o código do
// adapter, e as duas fazem falta por motivos diferentes:
//
//   1. O catálogo carregado não tem as três chaves — é o que o resto do cliente vê.
//   2. O adapter não GLOBA os três diretórios — é o que decide o que entra no bundle. Um
//      `import.meta.glob` com `eager: true` puxa o JSON inteiro para dentro do arquivo
//      empacotado; ler só um campo dele depois não desfaz isso, porque tree-shaking não entra
//      em literal de objeto. Sem esta segunda asserção, alguém poderia voltar a globar e
//      descartar as chaves na saída, e o teste 1 continuaria verde com o dado no disco do
//      jogador.
//
// Este é o padrão "lacuna de eixo e não de profundidade" que o projeto já pegou várias vezes:
// medir o resultado não é medir o que produziu o resultado.

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const ADAPTER = readFileSync(join(RAIZ, 'apps', 'client', 'src', 'data', 'loadCatalogFromBrowser.ts'), 'utf8');

/** Os diretórios de `packages/data` que os três conjuntos só-servidor ocupam. */
const DIRETORIOS_PROIBIDOS = ['encounters', 'dungeon-encounters', 'enemies'] as const;

describe('o catálogo do cliente não conhece o inimigo de PvE', () => {
  it('as três chaves não existem no catálogo carregado', () => {
    const chaves = Object.keys(catalog as unknown as Record<string, unknown>);
    for (const chave of CONTEUDO_SO_DO_SERVIDOR) {
      expect(chaves, `${chave} ainda está no catálogo do cliente`).not.toContain(chave);
    }
    // E não é vacuamente verdadeiro: o catálogo continua tendo o resto.
    expect(chaves).toContain('classes');
    expect(chaves).toContain('characters');
    expect(chaves).toContain('maps');
    expect(chaves).toContain('dungeons');
  });

  it('o adapter de browser não globa nenhum dos três diretórios', () => {
    for (const diretorio of DIRETORIOS_PROIBIDOS) {
      const glob = new RegExp(`import\\.meta\\.glob\\([^)]*packages/data/${diretorio}/`);
      expect(glob.test(ADAPTER), `o adapter ainda empacota packages/data/${diretorio}/`).toBe(false);
    }
  });

  it('e continua globando o que o cliente precisa — a asserção acima não passou por ele estar vazio', () => {
    for (const diretorio of ['classes', 'characters', 'maps', 'skills', 'items']) {
      const glob = new RegExp(`import\\.meta\\.glob\\([^)]*packages/data/${diretorio}/`);
      expect(glob.test(ADAPTER), `o adapter parou de empacotar packages/data/${diretorio}/`).toBe(true);
    }
  });

  it('nenhum módulo de `src` importa os três diretórios por outro caminho', () => {
    // A porta dos fundos: um `import x from '../../packages/data/enemies/foo.json'` em qualquer
    // arquivo do cliente empacotaria o mesmo dado sem passar pelo adapter.
    const arquivos = varrer(join(RAIZ, 'apps', 'client', 'src'));
    expect(arquivos.length).toBeGreaterThan(20);

    for (const arquivo of arquivos) {
      const fonte = readFileSync(arquivo, 'utf8');
      for (const diretorio of DIRETORIOS_PROIBIDOS) {
        // Só o que EMPACOTA conta: `import ... from '.../enemies/x.json'`, `import(...)` e
        // `import.meta.glob(...)`. Uma menção em comentário não põe byte nenhum no bundle, e
        // proibi-la tornaria o teste um censor de prosa em vez de uma trava de empacotamento.
        const importa = new RegExp(
          String.raw`(from\s*|import\(|glob\()['"\`][^'"\`]*packages/data/` + diretorio + '/',
        );
        expect(importa.test(fonte), `${arquivo} importa packages/data/${diretorio}/`).toBe(false);
      }
    }
  });
});

function varrer(dir: string): readonly string[] {
  const achados: string[] = [];
  for (const entrada of readdirSync(dir, { withFileTypes: true })) {
    const caminho = join(dir, entrada.name);
    if (entrada.isDirectory()) achados.push(...varrer(caminho));
    else if (/\.(ts|tsx)$/.test(entrada.name)) achados.push(caminho);
  }
  return achados;
}
