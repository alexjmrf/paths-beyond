// M26 — o cliente da PixelLab (API v2).
//
// Mesmo padrão de `apps/server/src/identity/steam.ts` (M20) e do atualizador (M21 4/N): o
// `fetch` é INJETADO, e a suíte exercita o contrato — o que se manda, o que se lê e o que se
// faz quando o outro lado nega — sem falar com o serviço. Aqui a razão é mais forte que lá:
// cada chamada de verdade gasta uma geração da assinatura, então uma suíte que falasse com a
// PixelLab seria uma suíte que ninguém roda.
//
// A chave NUNCA mora no repositório. Ela vem de `PIXELLAB_API_KEY`, que o `.gitignore` cobre
// desde sempre — e o construtor recusa uma chave vazia em vez de chamar a API anônimo e
// receber um 401 lá adiante, longe da causa.

export const BASE_URL_PADRAO = 'https://api.pixellab.ai/v2';

// D25, "detalhe de encanamento": as URLs de quadro do armazenamento RECUSAM `Authorization` e
// exigem `User-Agent` de navegador. Custou uma rodada de 403 para descobrir na sessão de
// decisão; a constante existe para não custar de novo.
export const USER_AGENT_DE_NAVEGADOR =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';

export interface OpcoesDoCliente {
  readonly apiKey: string;
  readonly fetchImpl?: typeof fetch;
  readonly baseUrl?: string;
  // Injetáveis para o teste. Sem eles, exercitar o laço de espera custaria minutos de relógio
  // de parede por execução.
  readonly sleep?: (ms: number) => Promise<void>;
  readonly intervaloMs?: number;
  readonly maxConsultas?: number;
  // Quantas vezes reenviar um pedido que a API recusou por FILA CHEIA. Ver `api()`.
  readonly maxReenvios?: number;
}

export interface PedidoDePersonagem {
  readonly description: string;
  readonly seed: number;
  readonly frameSize: number;
  readonly view?: 'low top-down' | 'high top-down' | 'side';
  readonly detail?: string;
  readonly outline?: string;
}

export type Direcao = 'south' | 'north' | 'east' | 'west' | 'south-east' | 'south-west' | 'north-east' | 'north-west';

export interface PersonagemPronto {
  readonly characterId: string;
  readonly size: { readonly width: number; readonly height: number };
  readonly rotations: Partial<Record<Direcao, string>>;
}

export interface PedidoDeAnimacao {
  readonly characterId: string;
  readonly animationName: string;
  // `template` usa esqueleto a partir de um template pronto (1 geração por direção);
  // `v3` gera do texto. D25 mediu o segundo e o achou tímido — daí o primeiro ser o padrão.
  readonly mode: 'template' | 'v3';
  readonly templateAnimationId?: string;
  readonly actionDescription?: string;
  readonly frameCount?: number;
  readonly directions?: readonly Direcao[];
  readonly seed?: number;
}

export interface AnimacaoPronta {
  readonly animationType: string;
  readonly frames: readonly string[];
}

export interface ClientePixelLab {
  criarPersonagem(pedido: PedidoDePersonagem): Promise<{ characterId: string }>;
  esperarPersonagem(characterId: string): Promise<PersonagemPronto>;
  criarAnimacao(pedido: PedidoDeAnimacao): Promise<void>;
  esperarAnimacao(characterId: string, animationType: string, direcao: Direcao): Promise<AnimacaoPronta>;
  baixar(url: string): Promise<Uint8Array>;
}

interface RespostaDePersonagem {
  readonly id?: string;
  readonly status?: string;
  readonly size?: { width: number; height: number };
  readonly rotation_urls?: Partial<Record<Direcao, string | null>> | null;
  readonly animations?: readonly {
    readonly animation_type: string;
    readonly directions: readonly { readonly direction: string; readonly frames: readonly string[] }[];
  }[];
}

export function criarClientePixelLab(opcoes: OpcoesDoCliente): ClientePixelLab {
  if (opcoes.apiKey.trim().length === 0) {
    throw new Error(
      'PIXELLAB_API_KEY ausente. A chave mora em `.env` (que o .gitignore cobre) e nunca no repositório.',
    );
  }

  const doFetch = opcoes.fetchImpl ?? fetch;
  const baseUrl = opcoes.baseUrl ?? BASE_URL_PADRAO;
  const sleep = opcoes.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const intervaloMs = opcoes.intervaloMs ?? 5_000;
  // ~5 min a 5s. Um personagem leva ~4 min (D25); mais que isso é a API travada, e travar para
  // sempre num laço de geração de cinquenta unidades é pior que falhar.
  const maxConsultas = opcoes.maxConsultas ?? 60;
  const maxReenvios = opcoes.maxReenvios ?? 20;

  // A PixelLab limita quantos jobs uma conta tem em voo, e recusa o excedente com 429 (às
  // vezes com 500, quando nenhum job do lote conseguiu entrar). **Isso não é erro: é fila.**
  //
  // Medido na bateria de comparação do M26 1/N: disparadas 16 animações de uma vez, 8 entraram
  // e 8 voltaram com "Not enough concurrent job slots". Sem reenvio, a geração das cinquenta
  // unidades da 2/N vira um trabalho de babá — e pior, um trabalho onde a metade que falhou é
  // silenciosa até alguém conferir o diretório.
  //
  // Espera crescente e com TETO: crescer sem teto transformaria uma fila momentânea numa
  // espera de meia hora, e o teto de reenvios transforma "a API está fora do ar" em falha em
  // vez de espera eterna.
  function eFilaCheia(status: number, corpo: string): boolean {
    return status === 429 || (status === 500 && /concurrent|job slot|Failed to start any/i.test(corpo));
  }

  async function api<T>(caminho: string, init?: RequestInit): Promise<T> {
    for (let tentativa = 0; ; tentativa++) {
      const resposta = await doFetch(`${baseUrl}${caminho}`, {
        ...init,
        headers: {
          authorization: `Bearer ${opcoes.apiKey}`,
          'content-type': 'application/json',
          ...((init?.headers ?? {}) as Record<string, string>),
        },
      });
      if (resposta.ok) return (await resposta.json()) as T;

      // O corpo entra na mensagem porque a API descreve o erro nele; a URL não entra, e a
      // chave nunca — mesmo argumento do `catch` mudo de `steam.ts`.
      const corpo = await resposta.text();
      if (!eFilaCheia(resposta.status, corpo) || tentativa >= maxReenvios) {
        throw new Error(`PixelLab respondeu ${resposta.status} em ${caminho}: ${corpo}`);
      }
      await sleep(Math.min(intervaloMs * (tentativa + 1), 60_000));
    }
  }

  async function consultarPersonagem(characterId: string): Promise<RespostaDePersonagem> {
    return api<RespostaDePersonagem>(`/characters/${encodeURIComponent(characterId)}`);
  }

  return {
    async criarPersonagem(pedido) {
      const corpo = await api<{ character_id?: string }>('/create-character-v3', {
        method: 'POST',
        body: JSON.stringify({
          description: pedido.description,
          seed: pedido.seed,
          // Quadrado: a peça ocupa um tile, e o tile é quadrado.
          image_size: { width: pedido.frameSize, height: pedido.frameSize },
          view: pedido.view ?? 'low top-down',
          no_background: true,
          ...(pedido.detail ? { detail: pedido.detail } : {}),
          ...(pedido.outline ? { outline: pedido.outline } : {}),
        }),
      });
      if (!corpo.character_id) throw new Error('PixelLab não devolveu `character_id` na criação.');
      return { characterId: corpo.character_id };
    },

    async esperarPersonagem(characterId) {
      // A API devolve `character_id` NA HORA e as rotações depois. Ler cedo é ler `null`, e o
      // erro apareceria adiante como um sprite faltando em vez de como uma falha.
      for (let i = 0; i < maxConsultas; i++) {
        const corpo = await consultarPersonagem(characterId);
        if (corpo.status === 'failed') throw new Error(`A geração de ${characterId} falhou na PixelLab.`);
        if (corpo.status === 'completed' && corpo.rotation_urls) {
          const rotations: Partial<Record<Direcao, string>> = {};
          for (const [direcao, url] of Object.entries(corpo.rotation_urls)) {
            if (url) rotations[direcao as Direcao] = url;
          }
          return { characterId, size: corpo.size ?? { width: 0, height: 0 }, rotations };
        }
        if (i + 1 < maxConsultas) await sleep(intervaloMs);
      }
      throw new Error(`Desisti de esperar ${characterId}: ${maxConsultas} consultas sem ficar pronto.`);
    },

    async criarAnimacao(pedido) {
      await api('/characters/animations', {
        method: 'POST',
        body: JSON.stringify({
          character_id: pedido.characterId,
          animation_name: pedido.animationName,
          mode: pedido.mode,
          ...(pedido.templateAnimationId ? { template_animation_id: pedido.templateAnimationId } : {}),
          ...(pedido.actionDescription ? { action_description: pedido.actionDescription } : {}),
          ...(pedido.frameCount ? { frame_count: pedido.frameCount } : {}),
          ...(pedido.directions ? { directions: [...pedido.directions] } : {}),
          ...(pedido.seed !== undefined ? { seed: pedido.seed } : {}),
        }),
      });
    },

    async esperarAnimacao(characterId, animationType, direcao) {
      for (let i = 0; i < maxConsultas; i++) {
        const corpo = await consultarPersonagem(characterId);
        const grupo = corpo.animations?.find((a) => a.animation_type === animationType);
        const lado = grupo?.directions.find((d) => d.direction === direcao);
        if (lado && lado.frames.length > 0) return { animationType, frames: lado.frames };
        if (i + 1 < maxConsultas) await sleep(intervaloMs);
      }
      throw new Error(`Desisti de esperar a animação ${animationType} de ${characterId}.`);
    },

    async baixar(url) {
      // Sem `Authorization` e COM `User-Agent` de navegador — ver a constante acima.
      const resposta = await doFetch(url, { headers: { 'user-agent': USER_AGENT_DE_NAVEGADOR } });
      if (!resposta.ok) throw new Error(`Falha ao baixar ${url}: ${resposta.status}`);
      return new Uint8Array(await resposta.arrayBuffer());
    },
  };
}
