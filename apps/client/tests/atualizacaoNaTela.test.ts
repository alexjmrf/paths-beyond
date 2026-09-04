import { afterEach, describe, expect, it, vi } from 'vitest';
import { lerEstadoDaAtualizacao, resolvePlatformBridge } from '../src/data/platformBridge.js';

// §2/§9.4 (M21, sub-sessão 4/N) — o que o cliente faz com o estado da atualização.
//
// A regra é a mesma da ponte de conquistas: no navegador nada disso existe, e a ausência é o
// modo normal, não uma falha. O que este arquivo trava é a leitura do que vem pelo IPC —
// porque um shell de versão diferente pode mandar uma fase que este cliente não conhece, e
// renderizar isso sem conferir vira tela quebrada por causa de um aviso de atualização.

afterEach(() => vi.unstubAllGlobals());

describe('lerEstadoDaAtualizacao()', () => {
  it('aceita as fases conhecidas', () => {
    expect(lerEstadoDaAtualizacao({ fase: 'pronta', versao: '0.0.2' })).toEqual({ fase: 'pronta', versao: '0.0.2' });
    expect(lerEstadoDaAtualizacao({ fase: 'baixando', versao: '0.0.2', porcento: 40 })).toMatchObject({
      fase: 'baixando',
      porcento: 40,
    });
  });

  it('recusa o que não é estado — inclusive uma fase que este cliente não conhece', () => {
    // O shell e o cliente são empacotados juntos, mas o updater existe justamente para
    // momentos em que eles não são a mesma versão.
    expect(lerEstadoDaAtualizacao({ fase: 'fase-do-futuro' })).toBeNull();
    expect(lerEstadoDaAtualizacao(null)).toBeNull();
    expect(lerEstadoDaAtualizacao(undefined)).toBeNull();
    expect(lerEstadoDaAtualizacao('pronta')).toBeNull();
    expect(lerEstadoDaAtualizacao({})).toBeNull();
  });
});

describe('a ponte de atualização', () => {
  it('no NAVEGADOR os três métodos não existem — atualizar ali é recarregar a página', () => {
    vi.stubGlobal('window', {});
    const bridge = resolvePlatformBridge();

    expect(bridge.updateStatus).toBeUndefined();
    expect(bridge.onUpdateStatus).toBeUndefined();
    expect(bridge.restartToUpdate).toBeUndefined();
  });

  it('no SHELL, o estado atravessa e a assinatura devolve o cancelamento', async () => {
    const ouvintes: ((estado: unknown) => void)[] = [];
    vi.stubGlobal('window', {
      pathsBeyond: {
        requestSessionTicket: async () => 'TICKET',
        updateStatus: async () => ({ fase: 'pronta', versao: '0.0.2' }),
        onUpdateStatus: (ouvinte: (estado: unknown) => void) => {
          ouvintes.push(ouvinte);
          return () => ouvintes.splice(ouvintes.indexOf(ouvinte), 1);
        },
        restartToUpdate: async () => null,
      },
    });

    const bridge = resolvePlatformBridge();
    expect(lerEstadoDaAtualizacao(await bridge.updateStatus!())).toEqual({ fase: 'pronta', versao: '0.0.2' });

    const cancelar = bridge.onUpdateStatus!(() => {});
    expect(ouvintes).toHaveLength(1);
    cancelar();
    expect(ouvintes).toHaveLength(0);
  });

  it('o shell falhando vira `null`, e não uma tela quebrada', async () => {
    // Erro de atualização nunca é erro do jogo — a mesma regra que o reducer do shell segue.
    vi.stubGlobal('window', {
      pathsBeyond: {
        requestSessionTicket: async () => 'TICKET',
        updateStatus: async () => {
          throw new Error('IPC caiu');
        },
        restartToUpdate: async () => {
          throw new Error('IPC caiu');
        },
      },
    });

    const bridge = resolvePlatformBridge();

    await expect(bridge.updateStatus!()).resolves.toBeNull();
    await expect(bridge.restartToUpdate!()).resolves.toBeNull();
  });
});
