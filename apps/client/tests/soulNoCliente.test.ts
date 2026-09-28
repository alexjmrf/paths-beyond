import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useBattleStore } from '../src/store/battleStore.js';

// M39 5/N — o cliente da Soul. Quem sorteia, cobra e trava (nível e personagem) é o servidor
// (D61) com o core; aqui se mede o que a tela manda e o que ela relê depois de cada resposta.

const TOKEN = 'token-de-teste';
const RURIK = { hero: { id: 'p1-ally-guerreiro', characterId: 'ally-guerreiro', classId: 'class-guerreiro', level: 20 }, equippedItems: [] };
const SOUL = {
  id: 'soul-p1-n1',
  soulOf: 'ally-guerreiro',
  mainstat: { stat: 'atk', value: 30 },
  substats: [
    { stat: 'hp', value: 100 },
    { stat: 'def', value: 12 },
  ],
  crafts: 1,
};

interface Chamada {
  readonly url: string;
  readonly method: string;
  readonly body: unknown;
}
let chamadas: Chamada[] = [];
let respostas: Record<string, { status: number; body: unknown }> = {};
const responder = (url: string, body: unknown, status = 200) => {
  respostas[url] = { status, body };
};

beforeEach(() => {
  chamadas = [];
  respostas = {};
  responder('/api/me/souls', { souls: [SOUL] });
  responder('/api/me/heroes', [RURIK]);
  responder('/api/me/economy', { wallet: { gold: 0, stones: 0, arenaMarks: 0 }, materials: {}, inventory: [] });
  responder('/api/dungeons', { dungeons: [] });
  vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET';
    chamadas.push({ url, method, body: init?.body ? JSON.parse(init.body as string) : null });
    const r = respostas[url];
    if (!r) return new Response(JSON.stringify({ error: 'rota não semeada' }), { status: 404 });
    return new Response(JSON.stringify(r.body), { status: r.status });
  });
  useBattleStore.setState((s) => ({
    pvp: { ...s.pvp, token: TOKEN, roster: [RURIK] as never, souls: [] },
    pve: { ...s.pve, busy: false, error: null, status: null },
  }));
});

afterEach(() => vi.unstubAllGlobals());

describe('ler as Souls', () => {
  it('lerSouls traz as Souls da conta', async () => {
    await useBattleStore.getState().lerSouls();
    expect(useBattleStore.getState().pvp.souls).toEqual([SOUL]);
  });

  it('abrir a aba Personagens lê as Souls', async () => {
    useBattleStore.setState({ transicao: { para: 'personagens' } });
    useBattleStore.getState().concluirTransicao();
    await vi.waitFor(() => expect(useBattleStore.getState().pvp.souls).toEqual([SOUL]));
  });
});

describe('craft e recraft', () => {
  it('craftar manda o personagem e o nonce, e relê Souls e economia', async () => {
    responder('/api/souls/craft', { soul: SOUL, wallet: { gold: 0, stones: 0, arenaMarks: 0 }, materials: {} }, 201);
    await useBattleStore.getState().craftarSoul('ally-guerreiro');

    const post = chamadas.find((c) => c.url === '/api/souls/craft');
    expect(post?.method).toBe('POST');
    expect(post?.body).toMatchObject({ characterId: 'ally-guerreiro' });
    expect(typeof (post?.body as { nonce: string }).nonce).toBe('string');
    expect(chamadas.some((c) => c.url === '/api/me/souls')).toBe(true);
    expect(chamadas.some((c) => c.url === '/api/me/economy')).toBe(true);
    expect(useBattleStore.getState().pvp.souls).toEqual([SOUL]);
    expect(useBattleStore.getState().pve.error).toBeNull();
  });

  it('recraftar manda o nonce na rota da instância, e relê Souls e economia', async () => {
    responder(`/api/souls/${SOUL.id}/recraft`, { soul: { ...SOUL, crafts: 2 }, wallet: { gold: 0, stones: 0, arenaMarks: 0 }, materials: {} });
    await useBattleStore.getState().recraftarSoul(SOUL.id);

    const post = chamadas.find((c) => c.url === `/api/souls/${SOUL.id}/recraft`);
    expect(post?.method).toBe('POST');
    expect(typeof (post?.body as { nonce: string }).nonce).toBe('string');
    expect(chamadas.some((c) => c.url === '/api/me/souls')).toBe(true);
    expect(chamadas.some((c) => c.url === '/api/me/economy')).toBe(true);
  });

  it('a recusa do servidor (falta de Essência) aparece na tela', async () => {
    responder('/api/souls/craft', { error: 'faltam 40 material-essencia-de-alma' }, 400);
    await useBattleStore.getState().craftarSoul('ally-guerreiro');
    expect(useBattleStore.getState().pve.error).toContain('400');
  });
});

// D64 — descartar.
describe('descartar', () => {
  it('manda o nonce na rota da instância, e relê as Souls', async () => {
    responder(`/api/souls/${SOUL.id}/discard`, { discarded: SOUL.id });
    responder('/api/me/souls', { souls: [] });
    useBattleStore.setState((s) => ({ pvp: { ...s.pvp, souls: [SOUL] as never } }));
    await useBattleStore.getState().descartarSoul(SOUL.id);

    const post = chamadas.find((c) => c.url === `/api/souls/${SOUL.id}/discard`);
    expect(post?.method).toBe('POST');
    expect(typeof (post?.body as { nonce: string }).nonce).toBe('string');
    expect(useBattleStore.getState().pvp.souls).toEqual([]);
  });

  it('a recusa do servidor (Soul equipada) aparece na tela', async () => {
    responder(`/api/souls/${SOUL.id}/discard`, { error: 'a Soul está equipada' }, 409);
    await useBattleStore.getState().descartarSoul(SOUL.id);
    expect(useBattleStore.getState().pve.error).toContain('409');
  });
});

describe('equipar e desequipar', () => {
  it('equipar manda o herói, e relê heróis e Souls', async () => {
    responder(`/api/souls/${SOUL.id}/equip`, { hero: { ...RURIK.hero, soul: SOUL.id } });
    await useBattleStore.getState().equiparSoul(SOUL.id, RURIK.hero.id);

    const post = chamadas.find((c) => c.url === `/api/souls/${SOUL.id}/equip`);
    expect(post?.body).toMatchObject({ heroId: RURIK.hero.id });
    expect(typeof (post?.body as { nonce: string }).nonce).toBe('string');
    expect(chamadas.some((c) => c.url === '/api/me/heroes')).toBe(true);
    expect(chamadas.some((c) => c.url === '/api/me/souls')).toBe(true);
  });

  it('desequipar chama a rota do herói', async () => {
    responder(`/api/heroes/${RURIK.hero.id}/soul/unequip`, { hero: RURIK.hero });
    await useBattleStore.getState().desequiparSoul(RURIK.hero.id);
    expect(chamadas.some((c) => c.url === `/api/heroes/${RURIK.hero.id}/soul/unequip` && c.method === 'POST')).toBe(true);
  });

  it('a trava de nível do servidor aparece na tela', async () => {
    responder(`/api/souls/${SOUL.id}/equip`, { error: 'o slot da Soul abre no nível 20' }, 400);
    await useBattleStore.getState().equiparSoul(SOUL.id, RURIK.hero.id);
    expect(useBattleStore.getState().pve.error).toContain('400');
  });
});
