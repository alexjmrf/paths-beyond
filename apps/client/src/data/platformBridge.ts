// §9.4 (M20/M21) — de onde o cliente tira o TICKET DE PLATAFORMA.
//
// Até o M20 o jogador digitava o próprio identificador numa caixa de texto (stub de M7). Ele
// deixou de existir: o servidor só aceita ticket de plataforma, e ticket é coisa que a
// plataforma emite, não que uma pessoa escreve.
//
// **A ponte tem dois lados, e a escolha entre eles é o que este arquivo faz.** Dentro do
// shell desktop (M21) o `preload` do Electron expõe `window.pathsBeyond`, e é dali que o
// ticket vem; no navegador — que continua sendo o laço de desenvolvimento — não existe Steam
// para pedir ticket, e a ponte de desenvolvimento devolve uma identidade fixa.
//
// Errar essa escolha é ruim nos dois sentidos, e por isso ela tem teste: cair na ponte de dev
// dentro do shell publicado autenticaria todo mundo como a mesma pessoa de mentira; exigir a
// ponte real no navegador quebraria o laço de desenvolvimento inteiro.
//
// O que NÃO se faz aqui: inventar um ticket que pareça o da Steam. O formato `dev:<id>` é
// deliberadamente diferente, e o servidor só o aceita quando montado com o validador de
// desenvolvimento — em produção ele é recusado como qualquer lixo.

export interface PlatformBridge {
  // `null` = a plataforma não está disponível (jogo aberto fora dela, Steam fechada). A tela
  // precisa distinguir isso de "ticket recusado", que é resposta do servidor.
  requestSessionTicket(): Promise<string | null>;
  // §9.4 (M21, 2/N) — para onde falar com o servidor. Só o shell sabe: no navegador o
  // caminho relativo é encaminhado pelo Vite, e empacotado não há proxy nenhum.
  readonly apiBaseUrl?: string;
  // §9.4 (M21, 3/N) — espelhar na plataforma as conquistas CUMPRIDAS.
  //
  // **Opcional de propósito**: no navegador não existe plataforma para desbloquear nada, e
  // isso não é uma falha — é o laço de desenvolvimento desde M6. Ausente, ninguém chama.
  //
  // A lista vem pronta do servidor (`/me/rewards` diz quais estão cumpridas e qual é o nome
  // de cada uma na plataforma): o cliente não avalia condição, ele encaminha strings.
  syncAchievements?(nomes: readonly string[]): Promise<unknown>;
  // §2/§9.4 (M21, 4/N) — a ATUALIZAÇÃO do jogo.
  //
  // Também opcional, e pelo mesmo motivo: no navegador atualizar é recarregar a página. Quem
  // baixa e instala é o shell; a tela só mostra o estado e oferece o reinício.
  //
  // Os dois sentidos são necessários: `updateStatus` porque a tela pode montar depois de a
  // atualização já ter baixado, e `onUpdateStatus` porque ela pode baixar com a tela aberta.
  updateStatus?(): Promise<unknown>;
  onUpdateStatus?(ouvinte: (estado: unknown) => void): () => void;
  restartToUpdate?(): Promise<unknown>;
}

// O estado que o shell publica (`apps/desktop/src/updates.ts`). Declarado aqui e não
// importado de lá pelo mesmo motivo da ponte: o cliente não depende do shell.
export type EstadoDaAtualizacao =
  | { readonly fase: 'ocioso' }
  | { readonly fase: 'desligado'; readonly motivo: string }
  | { readonly fase: 'verificando' }
  | { readonly fase: 'sem-atualizacao' }
  | { readonly fase: 'disponivel'; readonly versao: string }
  | { readonly fase: 'baixando'; readonly versao: string; readonly porcento: number }
  | { readonly fase: 'pronta'; readonly versao: string }
  | { readonly fase: 'erro'; readonly mensagem: string };

const FASES = new Set([
  'ocioso',
  'desligado',
  'verificando',
  'sem-atualizacao',
  'disponivel',
  'baixando',
  'pronta',
  'erro',
]);

// O que vem pelo IPC é `unknown` de verdade: uma versão velha do shell pode mandar uma fase
// que este cliente não conhece, e um `estado.fase` inesperado renderizado sem conferência
// vira tela quebrada por causa de um aviso de atualização.
export function lerEstadoDaAtualizacao(bruto: unknown): EstadoDaAtualizacao | null {
  if (typeof bruto !== 'object' || bruto === null) return null;
  const fase = (bruto as { fase?: unknown }).fase;
  if (typeof fase !== 'string' || !FASES.has(fase)) return null;
  return bruto as EstadoDaAtualizacao;
}

// O que o `preload` do shell expõe. Declarado aqui e não importado de `apps/desktop` porque
// o cliente não depende do shell — ele funciona sem ele, e essa independência é o que mantém
// o desenvolvimento no navegador possível.
declare global {
  interface Window {
    pathsBeyond?: PlatformBridge;
  }
}

const DEV_IDENTITY_STORAGE_KEY = 'paths-beyond/dev-identity';

// A identidade de desenvolvimento é ESTÁVEL entre recargas: a conta é criada na primeira
// sessão e reencontrada nas seguintes, que é o comportamento que o jogador terá com a Steam.
// Uma identidade sorteada a cada carga criaria uma conta nova a cada F5.
function devIdentity(): string {
  try {
    const guardada = globalThis.localStorage?.getItem(DEV_IDENTITY_STORAGE_KEY);
    if (guardada) return guardada;

    const nova = `dev-${Math.random().toString(36).slice(2, 10)}`;
    globalThis.localStorage?.setItem(DEV_IDENTITY_STORAGE_KEY, nova);
    return nova;
  } catch {
    // Armazenamento bloqueado (navegação privada, cookies desligados): a sessão vale
    // enquanto a aba viver, e é melhor que não abrir o jogo.
    return 'dev-sem-armazenamento';
  }
}

export function createDevPlatformBridge(): PlatformBridge {
  return {
    async requestSessionTicket() {
      return `dev:${devIdentity()}`;
    },
  };
}

// A ponte do SHELL, embrulhada. O `preload` já isola o processo do renderer do módulo nativo
// da Steam; o que se acrescenta aqui é que uma falha dele vira **indisponibilidade** e não
// uma tela quebrada — Steam fechada e steamworks que não inicializa são a mesma coisa do
// ponto de vista do jogador, e nenhuma das duas é motivo para o cliente cair.
function wrapShellBridge(shell: PlatformBridge): PlatformBridge {
  return {
    async requestSessionTicket() {
      try {
        return await shell.requestSessionTicket();
      } catch {
        return null;
      }
    },
    ...(shell.syncAchievements
      ? {
          // Conquista é enfeite de perfil; a plataforma falhar não pode custar a tela ao
          // jogador. A falha morre aqui, e a próxima sincronização (todo sign-in, toda
          // leitura de prêmios) tenta de novo sem ninguém precisar pedir.
          async syncAchievements(nomes: readonly string[]) {
            try {
              return await shell.syncAchievements!(nomes);
            } catch {
              return null;
            }
          },
        }
      : {}),
    ...(shell.updateStatus ? { updateStatus: () => shell.updateStatus!().catch(() => null) } : {}),
    ...(shell.onUpdateStatus ? { onUpdateStatus: shell.onUpdateStatus.bind(shell) } : {}),
    ...(shell.restartToUpdate ? { restartToUpdate: () => shell.restartToUpdate!().catch(() => null) } : {}),
    ...(shell.apiBaseUrl ? { apiBaseUrl: shell.apiBaseUrl } : {}),
  };
}

export function resolvePlatformBridge(): PlatformBridge {
  const shell = typeof window !== 'undefined' ? window.pathsBeyond : undefined;
  return shell ? wrapShellBridge(shell) : createDevPlatformBridge();
}

// Resolvida na carga do módulo: o shell injeta `window.pathsBeyond` no `preload`, que roda
// antes de qualquer script da página.
export const platformBridge: PlatformBridge = resolvePlatformBridge();

// §9.4 (M21, 2/N) — a URL base da API.
//
// No navegador o cliente sempre falou por caminho relativo e o Vite encaminhou (M13 2/N).
// Empacotado, o app abre por `file://` e um caminho relativo aponta para o disco do jogador —
// então quem informa é o SHELL, e o mesmo binário assinado pode apontar para produção ou
// staging sem rebuild.
//
// **Configuração ruim cai no relativo em vez de virar URL malformada.** Uma URL quebrada
// falha com "fetch failed" e nenhuma pista; o relativo falha do jeito conhecido, que é o
// comportamento do navegador.
const API_BASE_RELATIVO = '/api';

export function resolveApiBaseUrl(): string {
  const informada = typeof window !== 'undefined' ? window.pathsBeyond?.apiBaseUrl : undefined;
  if (typeof informada !== 'string') return API_BASE_RELATIVO;

  const limpa = informada.trim().replace(/\/+$/, '');
  if (limpa.length === 0) return API_BASE_RELATIVO;

  try {
    const url = new URL(limpa);
    // `file:` e afins não são servidor. Só os dois esquemas que um servidor de verdade usa —
    // `http` inclusive, porque o `devServer` local é o laço de trabalho desde M13.
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return API_BASE_RELATIVO;
  } catch {
    return API_BASE_RELATIVO;
  }

  return limpa;
}
