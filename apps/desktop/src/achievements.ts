// §9.4 (M21, sub-sessão 3/N) — as CONQUISTAS no espelho da plataforma.
//
// O catálogo tem 10 conquistas autoradas desde o M18 4/N, e elas já pagam a moeda premium.
// O que faltava é o outro lado: elas aparecerem no perfil do jogador na plataforma.
//
// **Quem decide o que está cumprido é o SERVIDOR**, contra o banco (`rewards/conditions.ts`).
// Este arquivo não avalia condição nenhuma: ele recebe a lista de espelhos já cumpridos e
// cuida da única coisa que só pode ser feita aqui — falar com o módulo nativo, que só carrega
// no processo principal.
//
// **A porta é injetada**, no mesmo padrão de `now`, `newNonce` e do validador de identidade
// do M20. É isso que torna a sincronização provável sem App ID de parceiro, sem cliente da
// plataforma aberto e sem módulo nativo compilado: o que se prova aqui é a costura, e a
// implementação real é uma troca de porta.

export interface PlatformAchievements {
  // O nome é o *API name* da plataforma, autorado em `packages/data` como `platformId`.
  estaDesbloqueada(nome: string): boolean | Promise<boolean>;
  desbloquear(nome: string): void | Promise<void>;
}

export interface ResultadoDaSincronizacao {
  readonly desbloqueadas: readonly string[];
  readonly jaEstavam: readonly string[];
  // Uma conquista que falhou não impede as outras: a plataforma pode recusar uma por nome
  // desconhecido (espelho autorado errado) e aceitar as nove restantes normalmente.
  readonly falhas: readonly string[];
  // A plataforma inteira ausente é estado NORMAL, não erro: o jogo aberto pelo executável
  // direto, o cliente da loja fechado, o módulo nativo faltando. O jogador continua jogando.
  readonly indisponivel: boolean;
}

const VAZIO: ResultadoDaSincronizacao = {
  desbloqueadas: [],
  jaEstavam: [],
  falhas: [],
  indisponivel: false,
};

/**
 * Desbloqueia na plataforma as conquistas cumpridas que ainda não estão lá.
 *
 * É idempotente por construção: roda a cada sign-in e a cada leitura de prêmios, e a segunda
 * passada não faz chamada nenhuma. E é retroativa pelo mesmo motivo que a moeda é (M18, 4/N)
 * — o servidor confere a condição contra o estado de agora, então quem cumpriu antes de a
 * conquista existir a desbloqueia na primeira sincronização.
 */
export async function sincronizarConquistas(
  cumpridas: readonly string[],
  porta: PlatformAchievements | null,
): Promise<ResultadoDaSincronizacao> {
  if (!porta) return { ...VAZIO, indisponivel: true };

  // Duplicata na entrada viraria chamada repetida à plataforma sem mudar nada.
  const nomes = [...new Set(cumpridas)];
  const desbloqueadas: string[] = [];
  const jaEstavam: string[] = [];
  const falhas: string[] = [];

  for (const nome of nomes) {
    let presente = false;
    try {
      presente = await porta.estaDesbloqueada(nome);
    } catch {
      // Não conseguir LER o estado não é motivo para não escrever: desbloquear é idempotente
      // na plataforma, e a alternativa (desistir) deixaria a conquista de fora por causa da
      // pergunta, não da resposta.
      presente = false;
    }

    if (presente) {
      jaEstavam.push(nome);
      continue;
    }

    try {
      await porta.desbloquear(nome);
      desbloqueadas.push(nome);
    } catch {
      falhas.push(nome);
    }
  }

  return { desbloqueadas, jaEstavam, falhas, indisponivel: false };
}

/**
 * O pedido que chega do RENDERER, conferido antes de virar chamada à plataforma.
 *
 * O renderer é o processo menos confiável do shell — é ele que carrega a página — e um
 * payload torto não pode derrubar o processo principal, que é quem segura a janela do jogo.
 * Só passam strings no formato que a plataforma aceita (o mesmo `^[A-Z0-9_]+$` que o schema
 * de `packages/data` exige do `platformId`); o resto é descartado em silêncio, porque
 * responder erro ao renderer não daria a ele nada que fazer.
 */
export function sincronizarPedidoDoRenderer(
  nomes: unknown,
  porta: PlatformAchievements | null,
): Promise<ResultadoDaSincronizacao> {
  if (!Array.isArray(nomes)) return Promise.resolve({ ...VAZIO, indisponivel: true });

  const validos = nomes.filter((nome): nome is string => typeof nome === 'string' && /^[A-Z0-9_]+$/.test(nome));
  return sincronizarConquistas(validos, porta);
}

// A implementação REAL, e por que ela é um `import` dinâmico dentro de `try`.
//
// `steamworks.js` é módulo NATIVO: ele não existe em toda plataforma, não compila em toda
// máquina, e no laço de desenvolvimento no navegador ele não faz sentido nenhum. Um `import`
// estático faria o processo principal morrer na carga em qualquer máquina sem ele — inclusive
// a do CI, que builda o instalador. Ausente, a porta é `null` e o jogo abre igual.
//
// **Esta função não foi provada nesta máquina, e isso está declarado**: desbloquear de
// verdade exige App ID de parceiro, o cliente da loja aberto e o módulo compilado. O que roda
// em `pnpm test` é a sincronização contra uma porta de mentira — que é onde mora a lógica.
interface ClienteDaPlataforma {
  readonly achievement: {
    activate(nome: string): boolean;
    isActivated(nome: string): boolean;
  };
}

export async function criarPortaDaPlataforma(): Promise<PlatformAchievements | null> {
  // O App ID vem do ambiente pelo mesmo motivo que a URL da API vem (2/N): o mesmo binário
  // assinado precisa poder apontar para o app de produção ou para o de teste sem rebuild.
  const appId = Number(process.env.PATHS_BEYOND_STEAM_APP_ID);
  if (!Number.isInteger(appId) || appId <= 0) return null;

  try {
    // Especificador em variável de propósito: a dependência é opcional e pode não estar
    // instalada, e um literal faria o TypeScript exigir os tipos dela para compilar o shell.
    const especificador = 'steamworks.js';
    const modulo = (await import(especificador)) as { init(appId: number): ClienteDaPlataforma };
    const cliente = modulo.init(appId);

    return {
      estaDesbloqueada: (nome) => cliente.achievement.isActivated(nome),
      desbloquear: (nome) => {
        cliente.achievement.activate(nome);
      },
    };
  } catch {
    // Módulo ausente, loja fechada, App ID que não é deste app: do ponto de vista do jogador
    // é tudo a mesma coisa — a plataforma não está aí —, e nenhuma delas é motivo para o
    // jogo não abrir.
    return null;
  }
}
