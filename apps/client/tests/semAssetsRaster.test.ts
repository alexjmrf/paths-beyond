import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// M16, critério de aceite 1 — "nenhum arquivo de imagem entra no repositório".
//
// Hoje são zero, medido antes de começar o milestone. O valor deste teste não é constatar
// isso: é transformar "está zero" em "continua zero". A direção de arte decidida na auditoria
// de 2026-08-14 é visual programático — código que desenha —, e a forma mais provável de ela
// se perder não é uma decisão explícita de mudar de rumo, é um `.png` entrando junto de um
// commit que fazia outra coisa.
//
// Base64 embutido em código conta como asset: é o mesmo arquivo com outro nome, e escaparia de
// uma varredura de extensão. Por isso a segunda metade do teste.

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

const EXTENSOES_DE_IMAGEM = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.tiff', '.ico', '.svg', '.avif'];
const EXTENSOES_DE_CODIGO = ['.ts', '.tsx', '.css', '.html'];

// Não são o código do projeto: dependências, saída de build e artefatos de ferramenta.
const IGNORADOS = new Set(['node_modules', '.git', 'dist', 'build', 'coverage', '.vite', 'playwright-report']);

function arquivosDe(dir: string, aceita: (caminho: string) => boolean, encontrados: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (IGNORADOS.has(entry)) continue;
    const caminho = join(dir, entry);
    if (statSync(caminho).isDirectory()) {
      arquivosDe(caminho, aceita, encontrados);
      continue;
    }
    if (aceita(caminho)) encontrados.push(caminho.slice(repoRoot.length + 1));
  }
  return encontrados;
}

describe('M16 — zero assets de imagem no repositório (critério de aceite 1)', () => {
  it('nenhum arquivo raster ou vetorial versionado', () => {
    const imagens = arquivosDe(repoRoot, (caminho) => EXTENSOES_DE_IMAGEM.includes(extname(caminho).toLowerCase()));
    expect(imagens).toEqual([]);
  });

  it('nenhuma imagem embutida em base64 no código do cliente', () => {
    const codigo = arquivosDe(join(repoRoot, 'apps', 'client', 'src'), (caminho) =>
      EXTENSOES_DE_CODIGO.includes(extname(caminho)),
    );
    const suspeitos = codigo.filter((relativo) =>
      /data:image\/[a-z.+-]+;base64,/i.test(readFileSync(join(repoRoot, relativo), 'utf8')),
    );
    expect(suspeitos).toEqual([]);
  });

  it('o teste não é vacuamente verdadeiro: ele enxerga os arquivos do cliente', () => {
    const codigo = arquivosDe(join(repoRoot, 'apps', 'client', 'src'), (caminho) =>
      EXTENSOES_DE_CODIGO.includes(extname(caminho)),
    );
    expect(codigo.length).toBeGreaterThan(10);
  });
});
