import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PAINEIS_DA_BATALHA } from '../src/logic/ordemDaBatalha.js';
import { acaoDoEsc } from '../src/logic/pausa.js';
import { useBattleStore } from '../src/store/battleStore.js';

// M35 9/N (adiantada a pedido do usuário) — DENTRO DA MISSÃO, SÓ O CAMPO DE BATALHA.
//
// "Quando você entra na missão, é para ter uma tela só da missão, não é para aparecer campanha
// ou coisas do tipo... caso a pessoa queira sair ela abre o menu via Esc e aí ela sai da missão
// ou abre o menu de opções." O hub vinha junto porque o painel do "modo" da coluna da batalha
// era o `CampaignPanel` inteiro (o modo "em batalha" dele dependia do `ticket`, que morreu no
// M36). Agora a saída mora num MENU DE PAUSA.

describe('a batalha é só a batalha', () => {
  it('a coluna da batalha não tem mais o painel do modo', () => {
    expect(PAINEIS_DA_BATALHA.map((p) => p.painel)).not.toContain('modo');
  });

  it('App.tsx não desenha Campanha, Masmorra nem Arena dentro da batalha', () => {
    const fonte = readFileSync(join(import.meta.dirname, '..', 'src', 'App.tsx'), 'utf8');
    const batalha = fonte.slice(fonte.indexOf('PAINEIS_DA_BATALHA.map('));
    const coluna = batalha.slice(0, batalha.indexOf('</main>'));
    for (const painel of ['<CampaignPanel', '<DungeonPanel', '<PvpPanel']) expect(coluna).not.toContain(painel);
    expect(fonte).toContain('<PausaMenu');
  });
});

describe('o Esc', () => {
  const base = { tela: 'batalha' as const, opcoesAbertas: false, pausaAberta: false };

  it('na batalha, abre a pausa; com a pausa aberta, fecha', () => {
    expect(acaoDoEsc(base)).toBe('alternarPausa');
    expect(acaoDoEsc({ ...base, pausaAberta: true })).toBe('alternarPausa');
  });

  it('com as Opções abertas, fecha as Opções primeiro — em qualquer tela', () => {
    expect(acaoDoEsc({ ...base, opcoesAbertas: true })).toBe('fecharOpcoes');
    expect(acaoDoEsc({ tela: 'hub', opcoesAbertas: true, pausaAberta: false })).toBe('fecharOpcoes');
  });

  it('fora da batalha não há pausa: o Esc não faz nada', () => {
    expect(acaoDoEsc({ tela: 'hub', opcoesAbertas: false, pausaAberta: false })).toBe('nada');
    expect(acaoDoEsc({ tela: 'entrada', opcoesAbertas: false, pausaAberta: false })).toBe('nada');
  });
});

// --- a store ---------------------------------------------------------------------------------

interface Chamada {
  readonly url: string;
  readonly method: string;
  readonly body: unknown;
}
let chamadas: Chamada[] = [];

const PARTIDA = {
  nonce: 'partida-1',
  kind: 'campaign',
  refId: 'encounter-campanha-1',
  outcome: 'ongoing',
};

beforeEach(() => {
  chamadas = [];
  vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
    chamadas.push({ url, method: init?.method ?? 'GET', body: init?.body ? JSON.parse(init.body as string) : null });
    return new Response(JSON.stringify({ error: 'não semeado' }), { status: 404 });
  });
  useBattleStore.setState((s) => ({
    pvp: { ...s.pvp, token: 'tok' },
    mode: 'campaign',
    partida: PARTIDA as never,
    pausaAberta: false,
    opcoesAbertas: false,
    campaign: { ...s.campaign, selectedHeroIds: ['p1-hero-jogador'], selectedMissionId: 'encounter-campanha-1' },
  }));
});

afterEach(() => vi.unstubAllGlobals());

describe('o menu de pausa, na store', () => {
  it('abre e fecha', () => {
    useBattleStore.getState().alternarPausa();
    expect(useBattleStore.getState().pausaAberta).toBe(true);
    useBattleStore.getState().alternarPausa();
    expect(useBattleStore.getState().pausaAberta).toBe(false);
  });

  it('Opções, a partir da pausa, abre o menu de opções e fecha a pausa', () => {
    useBattleStore.setState({ pausaAberta: true });
    useBattleStore.getState().opcoesDaPausa();
    expect(useBattleStore.getState().opcoesAbertas).toBe(true);
    expect(useBattleStore.getState().pausaAberta).toBe(false);
  });

  it('Sair da missão DESISTE da partida em andamento, fecha a pausa e limpa o tabuleiro', async () => {
    useBattleStore.setState({ pausaAberta: true });
    await useBattleStore.getState().sairDaMissao();
    expect(chamadas.some((c) => c.method === 'POST' && c.url.includes('partida-1'))).toBe(true);
    expect(useBattleStore.getState().pausaAberta).toBe(false);
    expect(useBattleStore.getState().partida).toBeNull();
  });

  it('Recomeçar desiste e ABRE a mesma missão de novo, com os mesmos heróis', async () => {
    await useBattleStore.getState().recomecarMissao();
    const posts = chamadas.filter((c) => c.method === 'POST');
    const desistir = posts.findIndex((c) => c.url.includes('partida-1'));
    const abrir = posts.findIndex((c) => c.url.includes('/campaign/encounter-campanha-1/matches'));
    expect(desistir).toBeGreaterThanOrEqual(0);
    expect(abrir).toBeGreaterThan(desistir);
    expect(posts[abrir]!.body).toMatchObject({ heroIds: ['p1-hero-jogador'] });
    expect(useBattleStore.getState().pausaAberta).toBe(false);
  });

  it('Recomeçar só existe na campanha', async () => {
    useBattleStore.setState({ mode: 'dungeon' });
    await useBattleStore.getState().recomecarMissao();
    expect(chamadas.filter((c) => c.method === 'POST')).toEqual([]);
  });
});
