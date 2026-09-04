import { afterEach, describe, expect, it, vi } from 'vitest';
import { createDevPlatformBridge, resolvePlatformBridge } from '../src/data/platformBridge.js';

// §9.4 (M21, 1/N) — de onde o cliente tira o ticket, agora que existe um shell.
//
// O M20 deixou a ponte injetável de propósito e usou a de desenvolvimento, porque no
// navegador não existe Steam para pedir ticket. O M21 põe o outro lado: dentro do Electron,
// o `preload` expõe `window.pathsBeyond`, e é dele que o ticket passa a vir.
//
// O que este arquivo trava é a ESCOLHA entre as duas — porque errá-la nos dois sentidos é
// ruim de jeitos diferentes: cair na ponte de dev dentro do shell publicado seria autenticar
// todo mundo como a mesma pessoa de mentira; e exigir a ponte real no navegador quebraria o
// laço de desenvolvimento que M13 em diante construiu.

afterEach(() => vi.unstubAllGlobals());

describe('a escolha da ponte', () => {
  it('sem `window.pathsBeyond`, cai na ponte de desenvolvimento', async () => {
    vi.stubGlobal('window', {});

    const bridge = resolvePlatformBridge();
    const ticket = await bridge.requestSessionTicket();

    // O formato de dev é deliberadamente diferente do da Steam: em produção o servidor o
    // recusa como qualquer lixo, porque lá o validador montado é o da Steam.
    expect(ticket).toMatch(/^dev:/);
  });

  it('com `window.pathsBeyond`, usa a ponte do shell', async () => {
    vi.stubGlobal('window', {
      pathsBeyond: { requestSessionTicket: async () => 'TICKET-DA-STEAM' },
    });

    const bridge = resolvePlatformBridge();

    expect(await bridge.requestSessionTicket()).toBe('TICKET-DA-STEAM');
  });

  // A plataforma pode estar indisponível mesmo dentro do shell: Steam fechada, jogo aberto
  // pelo executável direto. A tela precisa distinguir isso de "ticket recusado", que é
  // resposta do servidor — por isso `null` e não uma string vazia nem uma exceção.
  it('o shell devolvendo `null` é propagado, não convertido em ticket de dev', async () => {
    vi.stubGlobal('window', {
      pathsBeyond: { requestSessionTicket: async () => null },
    });

    expect(await resolvePlatformBridge().requestSessionTicket()).toBeNull();
  });

  it('o shell que LANÇA vira indisponibilidade, e não uma tela quebrada', async () => {
    vi.stubGlobal('window', {
      pathsBeyond: {
        requestSessionTicket: async () => {
          throw new Error('steamworks não inicializou');
        },
      },
    });

    expect(await resolvePlatformBridge().requestSessionTicket()).toBeNull();
  });
});

describe('a ponte de desenvolvimento', () => {
  it('a identidade é ESTÁVEL entre chamadas: F5 não cria conta nova', async () => {
    const guardado = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => guardado.get(k) ?? null,
      setItem: (k: string, v: string) => void guardado.set(k, v),
      removeItem: (k: string) => void guardado.delete(k),
    });

    const primeira = await createDevPlatformBridge().requestSessionTicket();
    // Ponte NOVA, como depois de recarregar a página.
    const segunda = await createDevPlatformBridge().requestSessionTicket();

    expect(primeira).toBe(segunda);
  });

  it('sem armazenamento, ainda devolve um ticket em vez de derrubar o jogo', async () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('armazenamento bloqueado');
      },
      setItem: () => {
        throw new Error('armazenamento bloqueado');
      },
      removeItem: () => undefined,
    });

    expect(await createDevPlatformBridge().requestSessionTicket()).toMatch(/^dev:/);
  });
});
