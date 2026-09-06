import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, extname, join, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// M16, critério de aceite 1 — e a REABERTURA formal dele pelo M26.
//
// O critério nasceu como "nenhum arquivo de imagem entra no repositório", porque a direção de
// arte decidida na auditoria de 2026-08-14 era visual programático — código que desenha —, e a
// forma mais provável de ela se perder não era uma decisão explícita de mudar de rumo: era um
// `.png` entrando junto de um commit que fazia outra coisa.
//
// **D22 mudou a direção, de olhos abertos, e disse o que fazer com este arquivo:** "o critério
// 1 do M16 está reaberto por esta decisão. Imagem passa a entrar, confinada a um diretório de
// assets com manifesto e procedência declarada, e `semAssetsRaster.test.ts` muda de 'zero
// imagens' para 'imagem só onde é declarada'. Ele não é apagado: vira a trava do novo
// contrato."
//
// É exatamente o que está abaixo. O teste ficou MAIS forte, não mais fraco: antes ele
// perguntava uma coisa ("existe imagem?"); agora pergunta três — se a imagem está no lugar
// declarado, se ela está no manifesto, e se o manifesto não promete arquivo que não existe. As
// três juntas são o que impede o repositório de acumular imagem sem origem, que é o defeito de
// verdade — não a imagem em si.
//
// Base64 embutido em código continua contando como asset: é o mesmo arquivo com outro nome, e
// escaparia de uma varredura de extensão. Ele NÃO tem a saída que o PNG declarado tem, porque
// não há como um manifesto apontar para bytes dentro de um `.ts`.

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

// M26 — as duas metades do contrato novo, e por que ele mora em dois pacotes.
//
// AQUI: toda imagem do repositório está no lugar declarado e tem entrada no manifesto.
// EM `packages/data/tests/arteDeUnidade.test.ts`: todo sprite declarado existe em disco, e
// toda unidade tem uma declaração (sprite ou glifo explícito).
//
// Nenhuma das duas basta sozinha. Sem esta, um PNG entra em qualquer canto do repositório sem
// origem; sem a outra, o manifesto promete arquivos que não vieram no commit.
const DIRETORIO_DE_ARTE = join('apps', 'client', 'src', 'art', 'units');

function declaracoesDoManifesto(): { unitId: string; kind: string; arquivo?: string; duelo?: Record<string, string> }[] {
  const dir = join(repoRoot, 'packages', 'data', 'unit-art');
  return readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .map((f) => JSON.parse(readFileSync(join(dir, f), 'utf8')));
}

describe('M16/M26 — imagem só onde é declarada (critério de aceite 1, reaberto por D22)', () => {
  it('nenhuma imagem fora do diretório de arte declarado', () => {
    // Toda a força antiga do teste, preservada para o resto do repositório: um `.png` de
    // ícone, de textura ou de fundo entrando em `apps/`, `packages/` ou `docs/` continua
    // reprovando. O que mudou foi abrir UMA porta, e ela tem porteiro logo abaixo.
    const imagens = arquivosDe(repoRoot, (caminho) => EXTENSOES_DE_IMAGEM.includes(extname(caminho).toLowerCase()));
    const foraDoLugar = imagens.filter((relativo) => !relativo.startsWith(DIRETORIO_DE_ARTE));
    expect(foraDoLugar).toEqual([]);
  });

  it('toda imagem do diretório de arte está NO MANIFESTO, com procedência', () => {
    // O porteiro. Sem ele, o diretório de arte vira o lugar onde qualquer imagem entra sem ter
    // de dizer de onde veio — e a procedência é metade do que D22 cobrou em troca de reabrir o
    // critério. O rótulo de IA na Steam já é o preço da decisão (D25); imagem sem origem
    // rastreável seria pagar o preço sem receber a contrapartida.
    const declarados = new Set(
      declaracoesDoManifesto()
        .filter((d) => d.kind === 'sprite')
        // M26 2/N — são TRÊS por unidade: a peça do tabuleiro e as duas da tela de duelo.
        // Contar só a primeira faria as outras duas entrarem no repositório sem porteiro.
        .flatMap((d) => [d.arquivo!, ...Object.values(d.duelo ?? {})])
        .map((a) => a.split('/').join(sep)),
    );
    const imagens = arquivosDe(repoRoot, (caminho) => EXTENSOES_DE_IMAGEM.includes(extname(caminho).toLowerCase()));
    const semDeclaracao = imagens.filter((relativo) => !declarados.has(relativo));
    expect(semDeclaracao).toEqual([]);
  });

  it('o manifesto existe e é lido de verdade — o teste acima não passa por vazio', () => {
    // Sem esta âncora, apagar o diretório do manifesto tornaria a asserção anterior
    // verdadeira sobre um conjunto vazio, e a trava sumiria em silêncio.
    const declaracoes = declaracoesDoManifesto();
    expect(declaracoes.length).toBeGreaterThanOrEqual(50);
    expect(declaracoes.every((d) => d.kind === 'sprite' || d.kind === 'glyph')).toBe(true);
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
