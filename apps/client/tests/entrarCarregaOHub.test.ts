import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { proximaMissao, useBattleStore } from '../src/store/battleStore.js';
import { telaDoJogo } from '../src/logic/tela.js';

// M32 — ENTRAR carrega o hub. Sem isto, a próxima ação não existe.
//
// **Visto na tela com sessão de verdade (Railway), depois de D38.** `connectPvp` fazia o
// sign-in e lia `me` + roster — e só. O hub aparecia com a Campanha VAZIA, um botão
// "Atualizar" e "Escolha uma missão"; a Invocação dizia "0/0 personagens". A missão 1, que é
// a `acao-principal` de quem chega (D40), só existia depois de o jogador clicar num botão de
// harness. O critério do M32 é literal: "em cada tela existe UMA próxima ação com peso visual
// maior que o resto" — e um botão de recarregar não é ação de jogo.
//
// O que se afirma aqui é o que a suíte não podia ver: que entrar deixa a campanha, a
// invocação e as masmorras carregadas SEM clique, e que a introdução de "primeiro summon"
// NÃO dispara no sign-in — a caixa de texto apareceria por cima do hub, competindo com a
// missão 1 (uma caixa por vez, e a tela do hub é a campanha).

const CAPITULOS = [
  {
    id: 'chapter-1',
    order: 1,
    name: 'Capítulo 1',
    cleared: false,
    missions: [
      { id: 'encounter-campanha-1', order: 1, name: 'Missão 1', cleared: false, slots: 1 },
      { id: 'encounter-campanha-2', order: 2, name: 'Missão 2', cleared: false, slots: 2 },
    ],
  },
];

const ROSTER = [{ hero: { id: 'h-aren', characterId: 'hero-jogador', classId: 'class-espadachim' }, equippedItems: [] }];

const PERSONAGENS = {
  premium: 180,
  characters: [{ characterId: 'hero-jogador', owned: true, awakening: 0, imprint: 0 }],
};

let chamadas: string[] = [];

function instalarFetch(): void {
  chamadas = [];
  const respostas: Record<string, unknown> = {
    'POST /api/accounts/session': { playerId: 'p1', created: false },
    'GET /api/me': { id: 'p1', displayName: 'Aren', elo: 1200, arenaMarks: 0 },
    'GET /api/me/heroes': ROSTER,
    'GET /api/campaign': { chapters: CAPITULOS, premiumOnFirstClear: 60, premiumOnChapterClear: 300 },
    'GET /api/me/roster': PERSONAGENS,
    'GET /api/summon/banners': { premium: 180, banners: [] },
    'GET /api/me/rewards': { premium: 180, rewards: [] },
    'GET /api/me/economy': {
      energy: { stored: 10, asOfMs: 0 },
      energyMax: 10,
      wallet: { gold: 0, stones: 0, arenaMarks: 0 },
      materials: {},
      inventory: [],
      clearedDungeons: [],
    },
    'GET /api/dungeons': { dungeons: [] },
  };
  vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
    const chave = `${init?.method ?? 'GET'} ${url}`;
    chamadas.push(chave);
    const corpo = respostas[chave];
    if (corpo === undefined) return new Response(JSON.stringify({ error: 'rota não semeada' }), { status: 404 });
    return new Response(JSON.stringify(corpo), { status: 200 });
  });
}

beforeEach(() => {
  instalarFetch();
  useBattleStore.setState((s) => ({
    pvp: { ...s.pvp, token: null, me: null, roster: [] },
    campaign: { ...s.campaign, chapters: [], openChapterIds: [], error: null, status: null, ticket: null },
    summon: { ...s.summon, premium: 0, characters: [], banners: [], rewards: [], error: null },
    pve: { ...s.pve, dungeons: [], economy: null, error: null },
    introducaoAtual: null,
  }));
});

afterEach(() => vi.unstubAllGlobals());

describe('entrar carrega o hub (M32)', () => {
  it('depois de entrar, a missão 1 é a próxima ação sem nenhum clique a mais', async () => {
    await useBattleStore.getState().connectPvp();
    const estado = useBattleStore.getState();

    expect(estado.pvp.token).toBeTruthy();
    expect(telaDoJogo(estado)).toBe('hub');
    expect(estado.campaign.chapters.map((c) => c.id)).toEqual(['chapter-1']);
    expect(proximaMissao(estado.campaign.chapters)).toBe('encounter-campanha-1');
    expect(estado.campaign.openChapterIds).toEqual(['chapter-1']);
  });

  it('a invocação e as masmorras vêm carregadas junto — nada de "0/0 personagens"', async () => {
    await useBattleStore.getState().connectPvp();
    const { summon, pve } = useBattleStore.getState();

    expect(summon.premium).toBe(180);
    expect(summon.characters.map((c) => c.characterId)).toEqual(['hero-jogador']);
    expect(pve.economy?.energyMax).toBe(10);
    expect(chamadas).toContain('GET /api/campaign');
    expect(chamadas).toContain('GET /api/me/roster');
    expect(chamadas).toContain('GET /api/dungeons');
  });

  it('a introdução de "primeiro summon" NÃO dispara no sign-in', async () => {
    await useBattleStore.getState().connectPvp();

    expect(useBattleStore.getState().introducaoAtual).toBeNull();
  });

  it('uma leitura do hub que falha não derruba a sessão', async () => {
    instalarFetch();
    const original = globalThis.fetch;
    vi.stubGlobal('fetch', async (url: string, init?: RequestInit) =>
      url === '/api/campaign' ? new Response(JSON.stringify({ error: 'fora' }), { status: 500 }) : original(url, init),
    );

    await useBattleStore.getState().connectPvp();
    const estado = useBattleStore.getState();

    expect(estado.pvp.token).toBeTruthy();
    expect(telaDoJogo(estado)).toBe('hub');
    expect(estado.campaign.error).toBeTruthy();
    expect(estado.summon.premium).toBe(180);
  });
});
