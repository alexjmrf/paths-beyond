import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useBattleStore } from '../src/store/battleStore.js';

// M38 4/N — o cliente dos três banners e do artefato jogável.
//
// Nada aqui decide (regra 3): quem sorteia, quem trava por classe e quem cobra é o servidor.
// O que se mede é o que a tela manda, o que ela recusa antes de mandar, e o que ela relê
// depois de cada resposta para não mostrar estado velho.

const TOKEN = 'token-de-teste';
const MACHADO = 'artifact-machado-do-tirano';
const INSTANCIA = { id: 'artefato-p1-machado', artifactId: MACHADO, awakening: 0, imprint: 0 };
const RURIK = { hero: { id: 'p1-ally-guerreiro', characterId: 'ally-guerreiro', classId: 'class-guerreiro' }, equippedItems: [] };

const GENERICO = {
  id: 'banner-generico',
  kind: 'generic',
  name: 'Invocação Permanente',
  baseRate: 6,
  pityThresholds: { adventurer: 10, hero: 105 },
  premiumCost: 180,
  rollsSince: { adventurer: 2, hero: 30 },
  choice: { every: 180, rolls: 0, pending: 1 },
  pool: [
    { characterId: 'ally-couracado', rank: 'hero', weight: 5 },
    { artifactId: 'artifact-egide-de-bardan', rank: 'hero', weight: 2 },
  ],
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
  responder('/api/me/roster', { premium: 1000, characters: [] });
  responder('/api/summon/banners', { premium: 1000, banners: [GENERICO] });
  responder('/api/me/rewards', { premium: 1000, account: {}, rewards: [] });
  responder('/api/me/artifacts', { artifacts: [INSTANCIA] });
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
    pvp: { ...s.pvp, token: TOKEN, roster: [RURIK] as never, artifacts: [] },
    summon: { ...s.summon, premium: 1000, banners: [GENERICO] as never, error: null, status: null, lastResult: null },
    pve: { ...s.pve, busy: false, error: null, status: null },
  }));
});

afterEach(() => vi.unstubAllGlobals());

describe('a invocação com artefato, token e escolha', () => {
  it('ler a invocação também lê os artefatos da conta', async () => {
    await useBattleStore.getState().lerInvocacao();
    expect(useBattleStore.getState().pvp.artifacts).toEqual([INSTANCIA]);
  });

  it('um artefato que sai na rolagem aparece na conta sem recarregar', async () => {
    responder('/api/summon', {
      outcome: { kind: 'artifact', artifactId: MACHADO, rank: 'hero' },
      premium: 820,
      guaranteed: null,
      rollsSince: { adventurer: 3, hero: 0 },
      tokenGrants: [],
    });
    await useBattleStore.getState().rollSummon('banner-generico');

    expect(useBattleStore.getState().summon.lastResult?.outcome.kind).toBe('artifact');
    expect(useBattleStore.getState().pvp.artifacts).toEqual([INSTANCIA]);
  });

  it('o que o token entregou na mesma resposta fica no resultado, para a tela mostrar', async () => {
    const entregue = { kind: 'artifact', artifactId: MACHADO, rank: 'hero' };
    responder('/api/summon', {
      outcome: { kind: 'character', characterId: 'ally-mensageira', rank: 'adventurer' },
      premium: 820,
      guaranteed: null,
      rollsSince: { adventurer: 0, hero: 31 },
      tokenGrants: [entregue],
    });
    await useBattleStore.getState().rollSummon('banner-generico');

    expect(useBattleStore.getState().summon.lastResult?.tokenGrants).toEqual([entregue]);
  });

  it('o resultado guarda DE QUAL banner saiu — a tela só o mostra na aba dele', async () => {
    responder('/api/summon', {
      outcome: { kind: 'artifact', artifactId: MACHADO, rank: 'hero' },
      premium: 820,
      guaranteed: null,
      rollsSince: { adventurer: 3, hero: 0 },
      tokenGrants: [],
    });
    await useBattleStore.getState().rollSummon('banner-generico');
    expect(useBattleStore.getState().summon.lastResultBannerId).toBe('banner-generico');
  });

  it('resgatar a escolha manda o banner e o escolhido, e relê a tela', async () => {
    responder('/api/summon/choice', {
      outcome: { kind: 'character', characterId: 'ally-couracado', rank: 'hero' },
      choice: { rolls: 0, pending: 0 },
      tokenGrants: [],
    });
    await useBattleStore.getState().resgatarEscolha('banner-generico', 'ally-couracado');

    const post = chamadas.find((c) => c.url === '/api/summon/choice');
    expect(post?.body).toMatchObject({ bannerId: 'banner-generico', choiceId: 'ally-couracado' });
    expect(typeof (post?.body as { nonce: string }).nonce).toBe('string');
    expect(useBattleStore.getState().summon.lastResult?.outcome).toEqual({
      kind: 'character',
      characterId: 'ally-couracado',
      rank: 'hero',
    });
    expect(chamadas.some((c) => c.url === '/api/summon/banners')).toBe(true);
  });

  it('sem escolha pendente, a tela recusa ANTES de mandar', async () => {
    useBattleStore.setState((s) => ({
      summon: { ...s.summon, banners: [{ ...GENERICO, choice: { every: 180, rolls: 5, pending: 0 } }] as never },
    }));
    await useBattleStore.getState().resgatarEscolha('banner-generico', 'ally-couracado');

    expect(chamadas.filter((c) => c.url === '/api/summon/choice')).toHaveLength(0);
    expect(useBattleStore.getState().summon.error).toBeTruthy();
  });
});

describe('o artefato na aba Personagens', () => {
  it('equipar manda a instância e o herói, e relê heróis e artefatos', async () => {
    responder(`/api/artifacts/${INSTANCIA.id}/equip`, { hero: { ...RURIK.hero, artifact: INSTANCIA.id }, movedFrom: null });
    await useBattleStore.getState().equiparArtefato(INSTANCIA.id, RURIK.hero.id);

    const post = chamadas.find((c) => c.url === `/api/artifacts/${INSTANCIA.id}/equip`);
    expect(post?.body).toMatchObject({ heroId: RURIK.hero.id });
    expect(chamadas.some((c) => c.url === '/api/me/heroes')).toBe(true);
    expect(chamadas.some((c) => c.url === '/api/me/artifacts')).toBe(true);
    expect(useBattleStore.getState().pve.error).toBeNull();
  });

  it('desequipar chama a rota do herói', async () => {
    responder(`/api/heroes/${RURIK.hero.id}/artifact/unequip`, { hero: RURIK.hero });
    await useBattleStore.getState().desequiparArtefato(RURIK.hero.id);
    expect(chamadas.some((c) => c.url === `/api/heroes/${RURIK.hero.id}/artifact/unequip` && c.method === 'POST')).toBe(true);
  });

  it('despertar e imprint relêem os artefatos', async () => {
    responder(`/api/artifacts/${INSTANCIA.id}/awaken`, { artifact: { ...INSTANCIA, awakening: 1 } });
    responder(`/api/artifacts/${INSTANCIA.id}/imprint`, { artifact: { ...INSTANCIA, imprint: 1 } });
    await useBattleStore.getState().despertarArtefato(INSTANCIA.id);
    await useBattleStore.getState().imprintArtefato(INSTANCIA.id);

    expect(chamadas.filter((c) => c.url === '/api/me/artifacts').length).toBeGreaterThanOrEqual(2);
  });

  it('o erro do servidor (a trava por classe) aparece na tela', async () => {
    responder(`/api/artifacts/${INSTANCIA.id}/equip`, { error: 'só equipa a classe class-guerreiro' }, 400);
    await useBattleStore.getState().equiparArtefato(INSTANCIA.id, 'p1-ally-lanceiro');
    expect(useBattleStore.getState().pve.error).toContain('400');
  });
});
