import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse as parseYaml } from 'yaml';
import { describe, expect, it } from 'vitest';
import { ENV_DO_COMPOSE, ENV_OPCIONAL, ENV_DE_PRODUCAO } from '../src/env.js';

// M28, sub-sessão 1/N — o AMBIENTE conferido contra o CÓDIGO, sem subir nada.
//
// **Por que este arquivo existe.** O M19 pôs o servidor em Postgres e o M21 fez o cliente
// empacotado receber a URL do shell pelo `preload`: as duas metades certas de uma ponte que
// não tinha margem do outro lado. O compose é essa margem — e um compose errado falha do
// pior jeito possível, que é subir. Um serviço sem uma variável de ambiente sobe e morre no
// primeiro request; um `Dockerfile` que esquece `packages/data` sobe um servidor SEM JOGO,
// e responde 200 em `/health` enquanto isso.
//
// É a mesma família de `migrations.test.ts` (SQL × TypeScript, sem banco) e de
// `empacotamento.test.ts` (a config do instalador, sem instalar): ler a configuração como
// DADO e afirmar o que o código exige dela. Não substitui `docker compose up` — a fatia roda
// isso e cola a saída —, mas é o que roda a cada commit, inclusive em máquina sem Docker.
//
// **E todas as asserções aqui DERIVAM.** Nenhuma lista de variáveis escrita à mão: a lista
// vive em `src/env.ts`, os pontos de entrada a consomem, e o primeiro teste confere que
// nenhum `process.env` escapou dela. É a lição que o M29 vai ter de aprender à força em
// `conteudoTraduzido.test.ts` — teste que enumera o que já está pronto fica vacuamente verde
// sobre o que falta.

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const raizDoServidor = join(raiz, 'apps', 'server');

const composeServerSrc = readFileSync(join(raizDoServidor, 'src', 'composeServer.ts'), 'utf8');
const indexSrc = readFileSync(join(raizDoServidor, 'src', 'index.ts'), 'utf8');
const dockerfile = readFileSync(join(raizDoServidor, 'Dockerfile'), 'utf8');
const viteConfig = readFileSync(join(raiz, 'apps', 'client', 'vite.config.ts'), 'utf8');

interface ServicoDoCompose {
  readonly image?: string;
  readonly build?: unknown;
  readonly command?: unknown;
  readonly environment?: Readonly<Record<string, string>>;
  readonly ports?: readonly string[];
  readonly healthcheck?: { readonly test?: unknown };
  readonly depends_on?: Readonly<Record<string, { readonly condition?: string }>>;
}

const compose = parseYaml(readFileSync(join(raiz, 'compose.yaml'), 'utf8')) as {
  readonly services: Readonly<Record<string, ServicoDoCompose>>;
};

/** Todo `process.env.X` / `process.env['X']` lido por um arquivo-fonte. */
function envLidoPor(src: string): readonly string[] {
  const nomes = new Set<string>();
  for (const m of src.matchAll(/process\.env\.([A-Z0-9_]+)/g)) nomes.add(m[1]!);
  for (const m of src.matchAll(/process\.env\[['"]([A-Z0-9_]+)['"]\]/g)) nomes.add(m[1]!);
  return [...nomes].sort();
}

/**
 * Os diretórios que o `Dockerfile` copia INTEIROS.
 *
 * Distinguir isto de "o Dockerfile menciona o caminho" não é preciosismo — é o achado do
 * mutation check desta fatia. Apagar `COPY packages/data packages/data` deixava o teste
 * VERDE, porque `COPY packages/data/package.json packages/data/`, que existe para o
 * `--frozen-lockfile` conferir o workspace, também casava com uma busca por menção. A imagem
 * ficava com o manifesto de `packages/data` e sem uma única missão dentro.
 */
function diretoriosCopiadosInteiros(): readonly string[] {
  const dirs: string[] = [];
  for (const linha of dockerfile.split('\n')) {
    const m = /^COPY\s+(.+)$/.exec(linha.trim());
    if (!m) continue;

    // O último token é o destino; os anteriores são as origens.
    const tokens = m[1]!.trim().split(/\s+/);
    for (const origem of tokens.slice(0, -1)) {
      if (!origem.endsWith('.json') && !origem.endsWith('.yaml')) dirs.push(origem);
    }
  }
  return dirs;
}

/** As dependências de workspace do servidor — o que ele importa em tempo de execução. */
function dependenciasDeWorkspace(): readonly string[] {
  const pkg = JSON.parse(readFileSync(join(raizDoServidor, 'package.json'), 'utf8')) as {
    readonly dependencies?: Readonly<Record<string, string>>;
  };
  return Object.entries(pkg.dependencies ?? {})
    .filter(([, versao]) => versao.startsWith('workspace:'))
    .map(([nome]) => nome)
    .sort();
}

describe('as variáveis de ambiente estão declaradas num lugar só', () => {
  it('o ponto de entrada do compose não lê nenhuma variável fora da declaração', () => {
    // A asserção que faz todas as outras derivarem. Sem ela, alguém acrescenta um
    // `process.env.REDIS_URL` no `composeServer.ts`, esquece o `compose.yaml`, e o teste
    // continua verde porque a lista escrita à mão não sabe da variável nova.
    const declarado = new Set<string>([...ENV_DO_COMPOSE, ...ENV_OPCIONAL]);
    const naoDeclarado = envLidoPor(composeServerSrc).filter((nome) => !declarado.has(nome));

    expect(naoDeclarado, 'acrescente em `src/env.ts` e no `compose.yaml`').toEqual([]);
  });

  it('o ponto de entrada de produção também não lê nada fora da declaração', () => {
    const declarado = new Set<string>([...ENV_DE_PRODUCAO, ...ENV_OPCIONAL]);
    const naoDeclarado = envLidoPor(indexSrc).filter((nome) => !declarado.has(nome));

    expect(naoDeclarado).toEqual([]);
  });

  it('toda variável declarada é de fato lida — a lista não vira documentação velha', () => {
    // A direção contrária das duas asserções acima, e ela é metade do valor do arquivo.
    // Sem esta, uma variável que deixasse de ser usada continuaria no `compose.yaml` e no
    // `.env.example` para sempre, e a próxima pessoa a preencheria achando que precisa.
    const lidoPeloCompose = new Set(envLidoPor(composeServerSrc));
    for (const nome of ENV_DO_COMPOSE) {
      expect(lidoPeloCompose, `${nome} está declarada e ninguém a lê`).toContain(nome);
    }

    const lidoPorProducao = new Set(envLidoPor(indexSrc));
    for (const nome of ENV_DE_PRODUCAO) {
      expect(lidoPorProducao, `${nome} está declarada e ninguém a lê`).toContain(nome);
    }
  });

  it('produção exige tudo o que o compose exige, e mais a identidade da plataforma', () => {
    // O compose é um SUBCONJUNTO de produção, nunca um conjunto diferente: se um dia o
    // servidor precisar de uma variável nova para funcionar, ela vale nos dois lugares.
    for (const nome of ENV_DO_COMPOSE) {
      expect(ENV_DE_PRODUCAO, `${nome} sumiu de produção`).toContain(nome);
    }
    expect(ENV_DE_PRODUCAO).toContain('STEAM_WEB_API_KEY');
    expect(ENV_DE_PRODUCAO).toContain('STEAM_APP_ID');
  });
});

describe('o compose declara a origem de tudo o que o servidor exige', () => {
  it('o serviço do servidor declara toda variável obrigatória', () => {
    const ambiente = compose.services.server?.environment ?? {};

    for (const nome of ENV_DO_COMPOSE) {
      expect(Object.keys(ambiente), `\`${nome}\` não tem origem no compose`).toContain(nome);
    }
  });

  it('o serviço de migration declara a sua', () => {
    // Ele roda `migrate.ts`, que lança sem `DATABASE_URL`. Um serviço de migration que
    // falha ao subir é um servidor que nunca sobe — mas a mensagem estaria no lugar errado.
    const ambiente = compose.services.migrate?.environment ?? {};
    expect(Object.keys(ambiente)).toContain('DATABASE_URL');
  });

  it('nenhum segredo real está escrito no compose', () => {
    // O compose é versionado. O segredo do ticket de batalha (§9.4) é o que impede o
    // cliente de escolher a própria seed; um valor de verdade aqui vazaria no primeiro
    // `git push`. O de desenvolvimento é fixo E ÓBVIO, para nunca ser confundido com um.
    const cru = readFileSync(join(raiz, 'compose.yaml'), 'utf8');
    expect(cru).not.toMatch(/STEAM_WEB_API_KEY:\s*\S/);
    expect(compose.services.server?.environment?.BATTLE_TICKET_SECRET).toMatch(/desenvolvimento/);
  });
});

describe('as migrations entram no caminho de subida', () => {
  it('existe um serviço de migration que roda o `migrate` do servidor', () => {
    // O roadmap do M28: *"existe `migrate.ts` e nada o chama fora do CI"*. É este serviço.
    const comando = JSON.stringify(compose.services.migrate?.command ?? '');
    expect(comando).toContain('migrate');
  });

  it('o servidor não sobe antes de as migrations TERMINAREM', () => {
    // `service_started` não serve: o servidor subiria em paralelo com a migration e o
    // primeiro request bateria numa tabela que ainda não existe. Falha de corrida, que é a
    // que só aparece na máquina dos outros.
    expect(compose.services.server?.depends_on?.migrate?.condition).toBe(
      'service_completed_successfully',
    );
  });

  it('a migration espera o Postgres estar SAUDÁVEL, não apenas iniciado', () => {
    // A lição já está escrita em `ci.yml`, com estas palavras: *"sem o health check o job
    // corre para o `migrate` antes de o banco aceitar conexão"*. Aqui ela vira asserção.
    expect(compose.services.postgres?.healthcheck?.test).toBeDefined();
    expect(compose.services.migrate?.depends_on?.postgres?.condition).toBe('service_healthy');
  });
});

describe('a imagem carrega o jogo, e não só o servidor', () => {
  it('toda dependência de workspace do servidor é copiada para a imagem', () => {
    // O erro barato e provável, e o mais silencioso de todos: `loadCatalogFromDisk` lê
    // `packages/data` do DISCO. Sem esse diretório na imagem o servidor sobe, o `/health`
    // responde, e não existe uma classe, um mapa nem uma missão dentro dele.
    //
    // Deriva do `package.json`: uma dependência de workspace nova sem uma linha no
    // `Dockerfile` fica vermelha aqui, que é o mesmo espírito do `files` do M21.
    const copiados = diretoriosCopiadosInteiros();

    for (const nome of dependenciasDeWorkspace()) {
      const dir = `packages/${nome.replace('@paths-beyond/', '')}`;
      expect(copiados, `\`${nome}\` não entra na imagem`).toContain(dir);
    }
  });

  it('o próprio servidor é copiado', () => {
    expect(diretoriosCopiadosInteiros()).toContain('apps/server');
  });
});

describe('a ponte tem margem dos dois lados', () => {
  it('a porta publicada é a que o cliente de desenvolvimento procura por padrão', () => {
    // A frase do critério de aceite é *"sem passo manual"*. O proxy do Vite cai num alvo
    // padrão quando `PATHS_BEYOND_SERVER` não está definida; se o compose publicar noutra
    // porta, o passo manual volta — e volta como "não conecta", sem dizer por quê.
    const alvo = /http:\/\/127\.0\.0\.1:(\d+)/.exec(viteConfig)?.[1];
    expect(alvo, 'o alvo padrão do proxy sumiu do vite.config.ts').toBeDefined();

    const publicadas = (compose.services.server?.ports ?? []).map((p) => String(p).split(':')[0]);
    expect(publicadas).toContain(alvo);
  });
});

describe('o ponto de entrada do compose não é o de produção (M20)', () => {
  it('o compose monta o validador de DEV', () => {
    // Numa máquina limpa não há chave da Steam, e o cliente de desenvolvimento se
    // autentica com `dev:<id>`. É o que faz o critério "sem passo manual" ser possível.
    expect(composeServerSrc).toContain('createDevIdentityValidator');
  });

  it('produção continua montando o da Steam, e falhando alto sem ela', () => {
    // A decisão do M20 ao pé da letra: *"o validador de dev NUNCA é o padrão"*. Ele não
    // está no caminho de produção — nem por variável de ambiente, que foi a alternativa
    // recusada, porque uma configuração errada passaria a aceitar `dev:<id>` e aí qualquer
    // um se autenticaria como qualquer conta.
    expect(indexSrc).not.toContain('createDevIdentityValidator');
    expect(indexSrc).toContain('createSteamIdentityValidator');
  });

  it('o compose usa os repositórios de POSTGRES, e não os de memória', () => {
    // Sem isto o compose seria o `devServer` num contêiner: não exercitaria migration
    // nenhuma, e o critério 5 (destravar o julgamento na tela) continuaria bloqueado pela
    // mesma ausência que a milestone existe para remover.
    expect(composeServerSrc).toContain('createPostgresPlayerRepository');
    expect(composeServerSrc).not.toMatch(/createMemory\w+Repository/);
  });
});
