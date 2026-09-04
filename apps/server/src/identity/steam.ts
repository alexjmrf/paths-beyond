import type { IdentityValidator, PlatformIdentity } from './types.js';

// §9.4 (M20) — o validador da Steam.
//
// O cliente pede um ticket de sessão à Steam (`GetAuthSessionTicket`) e o manda; o servidor
// pergunta à Steam Web API se aquele ticket vale para ESTE jogo. Nada é guardado: nem
// credencial, nem sessão nossa — o SteamID que volta é o único dado de identidade que entra
// no banco.
//
// **A chamada de verdade não é exercitada pela suíte**, e é decisão: exigiria chave de API e
// o shell desktop (M21). O que é testado é o contrato — o que se manda, o que se lê e o que
// se faz quando a Steam nega —, com `fetch` injetado.

const ENDPOINT = 'https://api.steampowered.com/ISteamUserAuth/AuthenticateUserTicket/v1/';

export interface SteamIdentityValidatorOptions {
  readonly apiKey: string;
  readonly appId: string;
  // Injetável para o teste. Em produção é o `fetch` global do Node 22.
  readonly fetchImpl?: typeof fetch;
}

interface SteamResposta {
  readonly response?: {
    readonly params?: {
      readonly result?: string;
      readonly steamid?: string;
      readonly ownersteamid?: string;
    };
  };
}

export function createSteamIdentityValidator(options: SteamIdentityValidatorOptions): IdentityValidator {
  const doFetch = options.fetchImpl ?? fetch;

  return {
    async validate(ticket: string): Promise<PlatformIdentity | null> {
      const url = `${ENDPOINT}?key=${encodeURIComponent(options.apiKey)}&appid=${encodeURIComponent(options.appId)}&ticket=${encodeURIComponent(ticket)}`;

      try {
        const resposta = await doFetch(url);
        // Steam fora do ar não pode derrubar o servidor nem virar 500 para o jogador: vira
        // recusa. Ele vê 401 e tenta de novo.
        if (!resposta.ok) return null;

        const corpo = (await resposta.json()) as SteamResposta;
        const params = corpo.response?.params;
        if (params?.result !== 'OK' || !params.steamid) return null;

        // `ownersteamid` diferente de `steamid` é licença de OUTRA conta (family sharing,
        // revenda). A própria Steam recomenda a checagem, e ignorá-la é aceitar conta
        // emprestada como se fosse dona.
        if (params.ownersteamid && params.ownersteamid !== params.steamid) return null;

        return { provider: 'steam', platformId: params.steamid };
      } catch {
        // Rede caída, JSON malformado, timeout: todos são "não sei quem é você". E o `catch`
        // é mudo de propósito — a URL carrega a chave da API, e ela não pode vazar por log
        // nem por mensagem de erro.
        return null;
      }
    },
  };
}
