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
// M24 — o mesmo critério, agora para SOM.
//
// **O teste não precisou de ajuste, e essa é a notícia.** O critério de aceite do M24 previa
// que um asset de áudio pudesse conflitar com este arquivo ("se ele precisar de ajuste, o
// ajuste é declarado e não silencioso"). Não precisou: o som do jogo é sintetizado por
// oscilador (`apps/client/src/audio/`), pela mesma razão que a arte é desenhada por código.
// O que se acrescenta aqui é a trava do outro lado — a decisão vira regra em vez de ficar
// dependendo de ninguém trazer um `.ogg` depois.
const EXTENSOES_DE_AUDIO = ['.mp3', '.ogg', '.wav', '.m4a', '.flac', '.aac', '.opus', '.mid', '.midi'];
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

  // M24 — a mesma regra, para som.
  it('nenhum arquivo de ÁUDIO versionado — o som é sintetizado', () => {
    const audios = arquivosDe(repoRoot, (caminho) => EXTENSOES_DE_AUDIO.includes(extname(caminho).toLowerCase()));
    expect(audios).toEqual([]);
  });

  it('nenhum áudio embutido em base64 no código do cliente', () => {
    // Mesmo argumento do base64 de imagem: é o mesmo arquivo com outro nome, e escaparia de
    // uma varredura de extensão.
    const codigo = arquivosDe(join(repoRoot, 'apps', 'client', 'src'), (caminho) =>
      EXTENSOES_DE_CODIGO.includes(extname(caminho)),
    );
    const suspeitos = codigo.filter((relativo) =>
      /data:audio\/[a-z.+-]+;base64,/i.test(readFileSync(join(repoRoot, relativo), 'utf8')),
    );
    expect(suspeitos).toEqual([]);
  });
});
