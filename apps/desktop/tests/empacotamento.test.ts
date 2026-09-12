import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// §2 (M21, sub-sessão 2/N) — a CONFIG do empacotamento, conferida sem empacotar.
//
// Produzir um instalador leva minutos e baixa centenas de MB; o erro mais provável, porém, é
// banal e barato de pegar: **esquecer um diretório na lista `files`**. Quando isso acontece o
// build passa, o instalador é gerado, e o jogo abre em branco na máquina do jogador — sem
// erro no CI e sem pista no log.
//
// Este arquivo lê a config como dado e afirma o que ela precisa conter. Não substitui o build
// de verdade (que a fatia também roda), mas é o que roda em `pnpm test` a cada commit.

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');

interface PackageJson {
  readonly main: string;
  readonly dependencies?: Readonly<Record<string, string>>;
  readonly build: {
    readonly appId: string;
    readonly files: readonly string[];
    readonly extraResources?: readonly { readonly from: string; readonly to: string }[];
    readonly publish?: readonly { readonly provider: string; readonly url?: string }[];
    readonly win?: { readonly target?: unknown };
    readonly mac?: { readonly target?: unknown };
    readonly linux?: { readonly target?: unknown };
  };
}

const pkg = JSON.parse(readFileSync(join(raiz, 'package.json'), 'utf8')) as PackageJson;

describe('a config do empacotamento', () => {
  it('o `main` aponta para um arquivo que o build produz', () => {
    // `main` é o ponto de entrada que o Electron carrega. Apontar para um caminho que o
    // `tsc` não emite dá um app que não abre — e só na máquina que instalou.
    expect(pkg.main).toBe('dist/main.js');
    expect(existsSync(join(raiz, 'dist', 'main.js')), 'rode `pnpm --filter @paths-beyond/desktop build`').toBe(true);
  });

  it('o `preload` referenciado pelo main existe como CommonJS', () => {
    // Com `sandbox: true` o Electron carrega o preload como CJS, e o pacote é `type: module`
    // — a extensão `.cjs` é o que impede o Node de lê-lo como ESM.
    expect(existsSync(join(raiz, 'dist', 'preload.cjs'))).toBe(true);
  });

  it('os `files` incluem o que o app precisa para abrir', () => {
    const arquivos = pkg.build.files.join(' ');

    // O processo principal e o preload.
    expect(arquivos).toContain('dist');
    // O `package.json`, sem o qual o Electron não sabe qual é o `main`.
    expect(arquivos).toContain('package.json');
  });

  it('o CLIENTE entra no pacote — sem ele o app abre em branco', () => {
    // O erro que este arquivo existe para pegar. O cliente é buildado em outro pacote do
    // workspace, então ele precisa entrar por `extraResources` (ou equivalente) — e é
    // exatamente o tipo de linha que se esquece.
    const recursos = pkg.build.extraResources ?? [];
    const cliente = recursos.find((r) => r.from.includes('client'));

    expect(cliente, '`extraResources` não traz o cliente buildado').toBeDefined();
    expect(existsSync(join(raiz, cliente!.from)), 'rode `pnpm --filter @paths-beyond/client build`').toBe(true);
  });

  it('o `ambiente.json` entra no pacote — sem ele o app instalado não sabe para onde falar', () => {
    // M28 2/N. A URL do servidor chega a quem INSTALOU por este recurso (ver `ambiente.ts`);
    // é por ambiente, está no `.gitignore`, e quem empacota o escreve antes. O modelo
    // versionado é `ambiente.exemplo.json` — e ele precisa ser JSON válido com o campo que
    // `ambiente.ts` lê, senão vira um modelo que ensina o formato errado.
    const recursos = pkg.build.extraResources ?? [];
    const ambiente = recursos.find((r) => r.from === 'ambiente.json');

    expect(ambiente, '`extraResources` não traz o `ambiente.json`').toBeDefined();
    expect(ambiente!.to).toBe('ambiente.json');

    const exemplo = JSON.parse(readFileSync(join(raiz, 'ambiente.exemplo.json'), 'utf8')) as { apiBaseUrl?: unknown };
    expect(typeof exemplo.apiBaseUrl).toBe('string');
    expect(exemplo.apiBaseUrl).toMatch(/^https?:\/\//);
  });

  it('há alvo declarado para as três plataformas', () => {
    // Windows é provado localmente nesta fatia; macOS e Linux ficam configurados e só o CI
    // os executa. Declarar os três aqui é o que faz a ausência de um deles ser visível.
    expect(pkg.build.win?.target).toBeDefined();
    expect(pkg.build.mac?.target).toBeDefined();
    expect(pkg.build.linux?.target).toBeDefined();
  });

  it('o `appId` é estável — ele é a identidade do app no sistema e na loja', () => {
    // Mudar o `appId` entre versões faz o sistema tratar a atualização como outro programa:
    // dois ícones, duas pastas de dados, e o save do jogador "sumindo".
    expect(pkg.build.appId).toBe('com.pathsbeyond.game');
  });
});

describe('o cliente empacotado', () => {
  const indexHtml = join(raiz, '..', 'client', 'dist', 'index.html');

  it('referencia os assets por caminho RELATIVO', () => {
    // Sob `file://`, `/assets/...` aponta para a raiz do disco do jogador e a tela abre em
    // branco sem erro visível. É o segundo modo de falha silenciosa desta fatia.
    expect(existsSync(indexHtml), 'rode `pnpm --filter @paths-beyond/client build`').toBe(true);

    const html = readFileSync(indexHtml, 'utf8');
    expect(html).toMatch(/src="\.\/assets\//);
    expect(html).not.toMatch(/src="\/assets\//);
  });
});

// §2/§9.4 (M21, sub-sessão 4/N) — a config do AUTO-UPDATE.
//
// O modo de falha desta fatia é o mesmo da 2/N e igualmente silencioso: **sem o bloco
// `publish`, o electron-builder não emite `latest.yml`**. Tudo compila, o instalador sai, o
// jogador instala — e a atualização automática simplesmente nunca acontece, sem erro em
// lugar nenhum, porque o `electron-updater` não tem o que ler.
describe('a config do auto-update', () => {
  it('existe bloco `publish` — sem ele não há metadado de atualização', () => {
    const publicacao = pkg.build.publish ?? [];

    expect(publicacao.length, 'sem `publish` o electron-builder não gera `latest.yml`').toBeGreaterThan(0);
    expect(publicacao[0]!.url, 'o provider `generic` precisa saber de onde baixar').toBeTruthy();
  });

  it('a URL de atualização é HTTPS', () => {
    // O `electron-updater` confere o sha512 do que baixou, mas a lista do que existe vem
    // deste endereço. Em HTTP, quem está no meio escolhe qual versão o jogador "tem".
    for (const destino of pkg.build.publish ?? []) {
      expect(destino.url, destino.provider).toMatch(/^https:\/\//);
    }
  });

  it('`electron-updater` é dependência de RUNTIME, não de desenvolvimento', () => {
    // Ele roda dentro do app empacotado. Como devDependency, o build passa e o app quebra na
    // máquina do jogador ao tentar carregar o módulo — o pior lugar para descobrir.
    expect(pkg.dependencies?.['electron-updater']).toBeDefined();
  });
});
