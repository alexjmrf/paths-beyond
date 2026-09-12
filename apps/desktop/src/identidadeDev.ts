// §9.4 (M28, 2/N; pendência do M21) — a identidade de DESENVOLVIMENTO do shell.
//
// **O defeito que este arquivo substitui.** A identidade era
// `shell-${app.getPath('userData').length}` — o COMPRIMENTO do caminho da pasta de dados.
// Atendia ao único objetivo do M21 (estável entre execuções: uma identidade nova a cada
// abertura seria uma conta nova a cada abertura) e falhava em tudo o que um segundo testador
// exige: dois usuários com nome do mesmo tamanho produzem o mesmo número e caem na MESMA
// conta, e `dev:shell-52` é enumerável em segundos. D36 aceitou, para o hospedado de
// playtest, o preço "quem souber a URL se autentica como qualquer conta"; ele não aceitou
// "os testadores se misturam", e com o hospedado na internet "quem souber a URL" viraria
// "qualquer um que a encontre".
//
// Um UUID gerado uma vez e gravado em `userData` é estável E único E não enumerável
// (`randomUUID`, 122 bits). Perder o arquivo é uma conta nova — aceitável e coerente com o
// que "identidade de desenvolvimento" significa, e D36 já tem prazo de validade. O ticket
// continua sendo `dev:<id>`: `devIdentity.ts` do servidor não muda uma linha.
//
// `PATHS_BEYOND_DEV_IDENTITY` continua sendo o override, como no M21.

export const ARQUIVO_DE_IDENTIDADE = 'identidade-dev.json';

export interface ContextoDaIdentidade {
  readonly env: Readonly<Record<string, string | undefined>>;
  readonly userDataDir: string;
  /** `null` quando o arquivo não existe. */
  readonly lerArquivo: (caminho: string) => string | null;
  /** Cria diretórios no caminho se preciso. */
  readonly escreverArquivo: (caminho: string, conteudo: string) => void;
  readonly gerarUuid: () => string;
}

export type OrigemDaIdentidade = 'env' | 'arquivo' | 'gerada';

export interface IdentidadeResolvida {
  readonly id: string;
  readonly origem: OrigemDaIdentidade;
}

function juntar(dir: string, nome: string): string {
  return `${dir.replace(/[\\/]+$/, '')}/${nome}`;
}

function lerIdGravado(ctx: ContextoDaIdentidade, caminho: string): string | null {
  const conteudo = ctx.lerArquivo(caminho);
  if (conteudo === null) return null;
  try {
    const lido = JSON.parse(conteudo) as { id?: unknown } | null;
    return typeof lido?.id === 'string' && lido.id.length > 0 ? lido.id : null;
  } catch {
    return null;
  }
}

export function identidadeDeDesenvolvimento(ctx: ContextoDaIdentidade): IdentidadeResolvida {
  const doEnv = ctx.env.PATHS_BEYOND_DEV_IDENTITY;
  if (doEnv) return { id: doEnv, origem: 'env' };

  const caminho = juntar(ctx.userDataDir, ARQUIVO_DE_IDENTIDADE);
  const gravado = lerIdGravado(ctx, caminho);
  if (gravado) return { id: gravado, origem: 'arquivo' };

  // Ausente ou corrompido: gera e sobrescreve. Corrompido não pode deixar o jogo sem
  // identidade, e também não pode virar uma identidade nova a cada abertura — por isso a
  // escrita, que faz a próxima leitura encontrar este mesmo id.
  const id = ctx.gerarUuid();
  ctx.escreverArquivo(caminho, JSON.stringify({ id }));
  return { id, origem: 'gerada' };
}
