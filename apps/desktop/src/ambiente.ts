// §9.4 (M28, 2/N) — para onde o cliente EMPACOTADO fala, lido em cascata.
//
// **O que o M21 2/N acertou e o que faltava.** A URL do servidor vem do shell, e não é
// assada no build: o mesmo código aponta para produção ou staging. Mas o único veículo era
// `process.env.PATHS_BEYOND_API_URL`, que um dev exporta no terminal e um jogador que
// instalou não tem como exportar — sem ela, o cliente cai em `/api` relativo, que aberto por
// `file://` é `file:///api`, e falha com "fetch failed" e nenhuma pista.
//
// A cascata, do mais específico ao mais geral:
//
//   1. `PATHS_BEYOND_API_URL`             — o laço de dev e o CI, como sempre.
//   2. `<userData>/ambiente.json`         — override por usuário: o autor testando o mesmo
//                                            build contra dois servidores, sem reempacotar.
//   3. `<resourcesPath>/ambiente.json`    — o que o instalador entrega, via `extraResources`.
//   4. nenhuma                            — o relativo, que é o comportamento do navegador.
//
// A consequência honesta: staging e produção viram dois INSTALADORES (mesmo código, recurso
// diferente), não um binário só. Para o playtest é irrelevante; para a loja é o esperado.
//
// Função pura com contexto injetado, pelo mesmo motivo de `updates.ts`: o que decide o
// comportamento roda em `pnpm test` sem Electron e sem disco.

export const ARQUIVO_DE_AMBIENTE = 'ambiente.json';

export interface ContextoDoShell {
  readonly env: Readonly<Record<string, string | undefined>>;
  readonly userDataDir: string;
  readonly resourcesDir: string;
  /** `null` quando o arquivo não existe. Quem chama decide como juntar caminhos. */
  readonly lerArquivo: (caminho: string) => string | null;
}

export type OrigemDaUrl = 'env' | 'userData' | 'recursos' | 'nenhuma';

export interface UrlResolvida {
  readonly url: string | null;
  readonly origem: OrigemDaUrl;
}

// Sem barra final: o cliente concatena `/api/...` por cima.
//
// **Host sem esquema ganha `https://`.** A primeira versão recusava — e o primeiro instalador
// do M28 saiu exatamente assim (`"paths-beyond-production.up.railway.app"`), caiu no relativo
// (`file:///api`) e falhou com "Failed to fetch" sem pista: a guarda escondeu o erro que
// existia para evitar. Para um host remoto o único esquema sensato é https; completar é mais
// honesto que recusar em silêncio. O que continua sendo recusado é o que não pode ser um
// host: vazio, número, `ftp://`, caminho relativo, texto com espaço.
function normalizar(valor: unknown): string | null {
  if (typeof valor !== 'string') return null;
  const aparado = valor.trim();
  if (/^https?:\/\/\S+$/.test(aparado)) return aparado.replace(/\/+$/, '');
  if (/^[a-z0-9.-]+(:\d+)?(\/\S*)?$/i.test(aparado) && aparado.includes('.')) {
    return `https://${aparado}`.replace(/\/+$/, '');
  }
  return null;
}

function lerDoArquivo(ctx: ContextoDoShell, dir: string): string | null {
  const conteudo = ctx.lerArquivo(juntar(dir, ARQUIVO_DE_AMBIENTE));
  if (conteudo === null) return null;
  try {
    const lido = JSON.parse(conteudo) as { apiBaseUrl?: unknown } | null;
    return normalizar(lido?.apiBaseUrl);
  } catch {
    // Malformado é ignorado e a cascata segue: um arquivo ruim no userData não pode
    // derrubar o do instalador, que está são.
    return null;
  }
}

// Junção de caminho sem `node:path`, para o módulo continuar puro e o teste continuar
// falando de caminhos POSIX literais. O `main.ts` passa diretórios reais; aqui só se
// acrescenta o nome do arquivo.
function juntar(dir: string, nome: string): string {
  return `${dir.replace(/[\\/]+$/, '')}/${nome}`;
}

export function resolverApiBaseUrl(ctx: ContextoDoShell): UrlResolvida {
  const doEnv = normalizar(ctx.env.PATHS_BEYOND_API_URL);
  if (doEnv) return { url: doEnv, origem: 'env' };

  const doUsuario = lerDoArquivo(ctx, ctx.userDataDir);
  if (doUsuario) return { url: doUsuario, origem: 'userData' };

  const doInstalador = lerDoArquivo(ctx, ctx.resourcesDir);
  if (doInstalador) return { url: doInstalador, origem: 'recursos' };

  return { url: null, origem: 'nenhuma' };
}
