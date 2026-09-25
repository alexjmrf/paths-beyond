import { RULES_VERSION, RULES_VERSION_MISMATCH_CODE } from '@paths-beyond/core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError, api, onRulesVersionMismatch } from '../src/data/api.js';

// §3.3/§9.4 (M22, sub-sessão 1/N) — o cliente diante da recusa por versão.
//
// Duas coisas são medidas aqui, e as duas são fronteira: **o cliente MANDA a versão** nas
// rotas que reexecutam comandos (sem isso o servidor recusa tudo, e o buraco do M17 5/N
// continuaria aberto do outro lado), e **reconhece a recusa por código**, não por mensagem —
// mensagem é texto para humano e muda de redação sem ninguém perceber.

afterEach(() => vi.unstubAllGlobals());

function respostaDeMismatch(body: Record<string, unknown>) {
  return {
    ok: false,
    status: 409,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

const MISMATCH = {
  error: 'rulesVersion incompatível (esperado 0.19.0)',
  code: RULES_VERSION_MISMATCH_CODE,
  reason: 'different' as const,
  expected: '0.19.0',
  received: '0.18.0',
};

describe('o cliente manda a versão de regras', () => {
  // M36 4/N (D47) — a versão vai na ABERTURA da partida, e não numa submissão: a checagem
  // mudou de lugar junto com a batalha, e para melhor. Um cliente desatualizado é recusado
  // ANTES de investir a missão inteira, em vez de depois.
  it('abrir uma partida leva `rulesVersion`, nas três superfícies', async () => {
    const enviados: string[] = [];
    vi.stubGlobal('fetch', async (_url: string, init: RequestInit) => {
      enviados.push(String(init.body));
      return { ok: true, status: 200, text: async () => '{}' } as unknown as Response;
    });

    await api.abrirPartidaDeCampanha('ticket', 'encounter-campanha-1', ['h1']);
    await api.abrirPartidaDeMasmorra('ticket', 'dungeon-1', ['h1']);
    await api.abrirPartidaDeArena('ticket', ['h1'], 'player-2');

    for (const corpo of enviados) expect(JSON.parse(corpo).rulesVersion).toBe(RULES_VERSION);
    expect(enviados).toHaveLength(3);
  });

  it('a varredura também leva — ela continua sendo uma submissão', async () => {
    const enviados: string[] = [];
    vi.stubGlobal('fetch', async (_url: string, init: RequestInit) => {
      enviados.push(String(init.body));
      return { ok: true, status: 200, text: async () => '{}' } as unknown as Response;
    });

    await api.sweepDungeon('ticket', 'dungeon-1', ['h1']);

    expect(JSON.parse(enviados[0]!).rulesVersion).toBe(RULES_VERSION);
  });
});

describe('o cliente reconhece a recusa por versão', () => {
  it('o erro carrega o corpo e se identifica pelo CÓDIGO', async () => {
    vi.stubGlobal('fetch', async () => respostaDeMismatch(MISMATCH));

    const erro = await api.rewards('ticket').catch((e: unknown) => e);

    expect(erro).toBeInstanceOf(ApiError);
    expect((erro as ApiError).status).toBe(409);
    expect((erro as ApiError).rulesVersionMismatch).toBe(true);
  });

  it('avisa a tela a partir de QUALQUER rota, e não de uma lista de rotas', async () => {
    // O mismatch pode vir da arena, da masmorra ou do capítulo, e as três estão em telas
    // diferentes. Publicando na camada de requisição, uma rota nova já nasce coberta.
    vi.stubGlobal('fetch', async () => respostaDeMismatch(MISMATCH));
    const vistos: unknown[] = [];
    const cancelar = onRulesVersionMismatch((m) => vistos.push(m));

    await api.rewards('ticket').catch(() => undefined);
    await api.abrirPartidaDeCampanha('t', 'c', ['h1']).catch(() => undefined);

    expect(vistos).toHaveLength(2);
    expect(vistos[0]).toMatchObject({ expected: '0.19.0', received: '0.18.0', reason: 'different' });

    cancelar();
    await api.rewards('ticket').catch(() => undefined);
    expect(vistos).toHaveLength(2);
  });

  it('outro erro do servidor NÃO vira pedido de atualização', async () => {
    // 429 e 403 continuam sendo o que sempre foram: mensagem na tela, jogo seguindo.
    vi.stubGlobal('fetch', async () => ({
      ok: false,
      status: 429,
      text: async () => JSON.stringify({ error: 'rate limit exceeded' }),
    }) as unknown as Response);

    const vistos: unknown[] = [];
    const cancelar = onRulesVersionMismatch((m) => vistos.push(m));
    const erro = await api.rewards('ticket').catch((e: unknown) => e);
    cancelar();

    expect((erro as ApiError).rulesVersionMismatch).toBe(false);
    expect(vistos).toHaveLength(0);
  });

  it('um 409 que não é de versão também não vira pedido de atualização', async () => {
    // `POST /rewards/:id/claim` responde 409 para prêmio já reivindicado, e a masmorra para
    // run já resolvida. Confundir os dois bloquearia o jogo por uma reivindicação repetida.
    vi.stubGlobal('fetch', async () => ({
      ok: false,
      status: 409,
      text: async () => JSON.stringify({ error: 'este prêmio já foi reivindicado' }),
    }) as unknown as Response);

    const erro = await api.rewards('ticket').catch((e: unknown) => e);

    expect((erro as ApiError).rulesVersionMismatch).toBe(false);
  });
});
