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

// M36 4/N (D47) — sobrou UMA rota: a VARREDURA. As outras três (arena, masmorra à mão,
// capítulo) eram submissões que resolviam a batalha inteira num disparo, e com a batalha viva
// esse instante não existe mais — o que elas protegiam virou a reconexão de `GET /matches/current`.
//
// A varredura ficou porque nela não há cliente jogando: ela continua sendo um pedido só que
// cobra energia e devolve loot, que é exatamente o caso que este arquivo existe para proteger.
const PEDIDO = {
  rota: 'dungeon-sweep' as const,
  dungeonId: 'dungeon-1',
  corpo: { nonce: 'nonce-1', heroIds: ['h1'] },
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
    globalThis.localStorage.setItem('paths-beyond/pedido-em-voo', '{"rota":"dungeon-sweep"}');
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

// M36 4/N (D47) — a ARENA saiu deste arquivo, e não por descuido.
//
// A auditoria do M22 a trouxe para cá porque ela resolvia no servidor, gravava replay e mexia no
// ELO num disparo só: cair no meio da submissão deixava o jogador sem saber se a partida valeu.
// Com a batalha viva não há submissão — o ELO é pago no comando que fecha a batalha, e quem cai
// volta para o ponto em que parou por `GET /matches/current`. O buraco não foi reaberto; ele
// deixou de existir.
describe('um pedido de uma versão ANTERIOR do jogo é descartado', () => {
  it('as rotas aposentadas não viram requisição — elas levariam 404', () => {
    // O jogador que atualizar o jogo no meio de uma submissão antiga tem isto guardado em
    // disco. Reenviá-lo bateria numa rota que não existe mais.
    for (const rota of ['arena-battle', 'dungeon-run', 'campaign-run']) {
      globalThis.localStorage.setItem(
        'paths-beyond/pedido-em-voo',
        JSON.stringify({ rota, dungeonId: 'd', chapterId: 'c', corpo: { nonce: 'n', heroIds: ['h1'] } }),
      );
      expect(lerPedido(), rota).toBeNull();
    }
  });
});
