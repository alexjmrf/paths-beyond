import { RULES_VERSION } from '@paths-beyond/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { guardarPedido, lerPedido, limparPedido, reenviarPedidoPendente } from '../src/logic/pedidoEmVoo.js';

// §9.4 (M22, sub-sessão 2/N) — o pedido em voo, do lado do cliente.
//
// O servidor passou a guardar a resposta por nonce, então reenviar a mesma requisição
// devolve a mesma run. Reenviar, porém, exige TER o nonce — e o cliente jogava o dele fora:
// ele vivia numa variável da store, e a queda de conexão (ou o jogo fechando) levava junto a
// única chave capaz de recuperar uma run que já tinha sido cobrada.
//
// Por isso `localStorage` e não memória: o caso que importa é o que derruba o processo.

function armazenamentoFalso() {
  const dados = new Map<string, string>();
  return {
    getItem: (k: string) => dados.get(k) ?? null,
    setItem: (k: string, v: string) => void dados.set(k, v),
    removeItem: (k: string) => void dados.delete(k),
    dados,
  };
}

beforeEach(() => vi.stubGlobal('localStorage', armazenamentoFalso()));
afterEach(() => vi.unstubAllGlobals());

const PEDIDO = {
  rota: 'dungeon-run' as const,
  dungeonId: 'dungeon-1',
  corpo: { nonce: 'nonce-1', heroIds: ['h1'], commands: [] },
};

describe('o pedido guardado', () => {
  it('sobrevive ao processo — é lido de volta como foi escrito', () => {
    guardarPedido(PEDIDO);
    expect(lerPedido()).toEqual(PEDIDO);
  });

  it('some quando limpo', () => {
    guardarPedido(PEDIDO);
    limparPedido();
    expect(lerPedido()).toBeNull();
  });

  it('lixo no armazenamento não vira requisição', () => {
    // O que está guardado pode ter sido escrito por uma versão anterior do jogo. Reenviar
    // lixo com um nonce de verdade seria pior que não reenviar nada.
    globalThis.localStorage.setItem('paths-beyond/pedido-em-voo', '{"rota":"dungeon-run"}');
    expect(lerPedido()).toBeNull();

    globalThis.localStorage.setItem('paths-beyond/pedido-em-voo', 'não é json');
    expect(lerPedido()).toBeNull();
  });

  it('armazenamento bloqueado não derruba o jogo', () => {
    // Navegação privada, cookies desligados: o que se perde é a recuperação, não a partida.
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('bloqueado');
      },
      setItem: () => {
        throw new Error('bloqueado');
      },
      removeItem: () => {
        throw new Error('bloqueado');
      },
    });

    expect(() => guardarPedido(PEDIDO)).not.toThrow();
    expect(lerPedido()).toBeNull();
    expect(() => limparPedido()).not.toThrow();
  });
});

describe('reenviarPedidoPendente()', () => {
  it('sem pedido guardado, não faz requisição nenhuma', async () => {
    const fetchFalso = vi.fn();
    vi.stubGlobal('fetch', fetchFalso);

    expect(await reenviarPedidoPendente('ticket')).toBeNull();
    expect(fetchFalso).not.toHaveBeenCalled();
  });

  it('reenvia o MESMO nonce — é isso que faz o servidor devolver a run original', async () => {
    const enviados: string[] = [];
    vi.stubGlobal('fetch', async (_url: string, init: RequestInit) => {
      enviados.push(String(init.body));
      return { ok: true, status: 200, text: async () => JSON.stringify({ outcome: 'victory' }) } as unknown as Response;
    });

    guardarPedido(PEDIDO);
    const recuperado = await reenviarPedidoPendente('ticket');

    const corpo = JSON.parse(enviados[0]!);
    expect(corpo.nonce).toBe('nonce-1');
    expect(corpo.rulesVersion).toBe(RULES_VERSION);
    expect(recuperado?.resposta).toEqual({ outcome: 'victory' });
    // Respondido é resolvido: o pedido sai do armazenamento.
    expect(lerPedido()).toBeNull();
  });

  it('falha de REDE mantém o pedido guardado para a próxima tentativa', async () => {
    // O cenário de quem está com a internet oscilando: desistir na primeira tentativa
    // desistiria justamente do caso que esta fatia existe para resolver.
    vi.stubGlobal('fetch', async () => {
      throw new TypeError('failed to fetch');
    });

    guardarPedido(PEDIDO);
    await expect(reenviarPedidoPendente('ticket')).rejects.toThrow();

    expect(lerPedido()).toEqual(PEDIDO);
  });
});

// Auditoria do M22 (2026-09-04) — a ARENA tinha o mesmo buraco, e não estava coberta.
describe('a arena também é recuperável', () => {
  const ARENA = {
    rota: 'arena-battle' as const,
    corpo: {
      nonce: 'nonce-arena',
      attackerHeroIds: ['h1'],
      defenderPlayerId: 'player-2',
      commands: [],
      rulesVersion: RULES_VERSION,
    },
  };

  it('o pedido de arena sobrevive e é reenviado com o mesmo nonce', async () => {
    // Ela resolve no servidor, grava replay e mexe no ELO: cair no meio da submissão
    // deixava o jogador sem saber se a partida valeu, com o ELO já mudado do outro lado.
    const enviados: { url: string; body: string }[] = [];
    vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
      enviados.push({ url: String(url), body: String(init.body) });
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ result: { outcome: 'victory' } }),
      } as unknown as Response;
    });

    guardarPedido(ARENA);
    const recuperado = await reenviarPedidoPendente('ticket');

    expect(enviados[0]!.url).toContain('/battles');
    expect(JSON.parse(enviados[0]!.body).nonce).toBe('nonce-arena');
    expect(recuperado?.pedido.rota).toBe('arena-battle');
    expect(lerPedido()).toBeNull();
  });

  it('pedido de arena sem oponente é recusado na leitura', () => {
    globalThis.localStorage.setItem(
      'paths-beyond/pedido-em-voo',
      JSON.stringify({ rota: 'arena-battle', corpo: { nonce: 'n' } }),
    );

    expect(lerPedido()).toBeNull();
  });
});
