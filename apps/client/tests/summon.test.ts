import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useBattleStore } from '../src/store/battleStore.js';

// §10 (M18, sub-sessão 6/N) — a tela de aquisição, do lado do cliente.
//
// O que este arquivo trava é o que o roteiro de navegador não prova de forma barata: as
// recusas que a tela tem de fazer ANTES de virarem requisição, e o que ela mostra depois
// de cada resposta. Mesmo recorte de `arenaDefense.test.ts` (M15 3/N).
//
// Nada aqui é regra de jogo (regra 3): quem sorteia é `packages/gacha`, no servidor. O
// cliente só desenha o pity, o saldo e o resultado — e é justamente por não decidir nada
// que ele não pode INVENTAR nenhum dos três.

const TOKEN = 'token-de-teste';

const BANNER = {
  id: 'banner-elenco',
  name: 'Invocação do Elenco',
  pityThreshold: 10,
  premiumCost: 500,
  rollsSinceNew: 7,
  pool: [
    { characterId: 'ally-grifeiro', weight: 1 },
    { characterId: 'ally-guerreiro', weight: 1 },
  ],
};

const PERSONAGENS = [
  { id: 'hero-jogador', name: 'Aren', classId: 'class-espadachim', acquisition: 'story', owned: true, fromStory: true },
  { id: 'ally-grifeiro', name: 'Kaia', classId: 'class-grifeiro', acquisition: 'summon', owned: false, fromStory: false },
];

const PREMIOS = [
  {
    id: 'achievement-primeiro-passo',
    kind: 'achievement',
    name: 'Primeiro Passo',
    description: 'Limpe o capítulo 1',
    premium: 300,
    claimed: false,
    claimable: true,
  },
  {
    id: 'event-semana-de-estreia',
    kind: 'event',
    name: 'Semana de Estreia',
    description: 'Enquanto durar',
    premium: 500,
    claimed: false,
    claimable: false,
    windowOpen: false,
  },
];

// Um `fetch` de mentira que responde por rota e registra o que foi chamado. O ponto de
// várias asserções abaixo é justamente a lista de chamadas: "a tela recusou antes de
// mandar" só é afirmável olhando para ela.
interface Chamada {
  readonly url: string;
  readonly method: string;
  readonly body: unknown;
}

let chamadas: Chamada[] = [];
let respostas: Record<string, { status: number; body: unknown }> = {};

function responder(url: string, body: unknown, status = 200): void {
  respostas[url] = { status, body };
}

function instalarFetch(): void {
  chamadas = [];
  respostas = {};
  responder('/api/me/roster', { premium: 1000, characters: PERSONAGENS });
  responder('/api/summon/banners', { premium: 1000, banners: [BANNER] });
  responder('/api/me/rewards', { premium: 1000, account: {}, rewards: PREMIOS });

  vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET';
    chamadas.push({ url, method, body: init?.body ? JSON.parse(init.body as string) : null });
    const resposta = respostas[url];
    if (!resposta) return new Response(JSON.stringify({ error: 'rota não semeada' }), { status: 404 });
    return new Response(JSON.stringify(resposta.body), { status: resposta.status });
  });
}

function conectado(premium = 1000): void {
  useBattleStore.setState((s) => ({
    pvp: { ...s.pvp, token: TOKEN },
    summon: {
      ...s.summon,
      premium,
      banners: [BANNER],
      characters: PERSONAGENS as never,
      rewards: PREMIOS as never,
      error: null,
      status: null,
      lastResult: null,
    },
  }));
}

beforeEach(() => {
  instalarFetch();
  useBattleStore.setState((s) => ({ summon: { ...s.summon, error: null, status: null, lastResult: null } }));
});

afterEach(() => vi.unstubAllGlobals());

describe('a tela de invocação lê o servidor e não inventa nada', () => {
  it('carrega banner, roster de personagens e prêmios numa atualização só', async () => {
    useBattleStore.setState((s) => ({ pvp: { ...s.pvp, token: TOKEN } }));

    await useBattleStore.getState().refreshSummon();
    const { summon } = useBattleStore.getState();

    expect(summon.banners).toHaveLength(1);
    expect(summon.characters.map((c) => c.id)).toEqual(['hero-jogador', 'ally-grifeiro']);
    expect(summon.rewards).toHaveLength(2);
    expect(summon.premium).toBe(1000);
  });

  it('sem token, nem tenta: a recusa não vira requisição', async () => {
    useBattleStore.setState((s) => ({ pvp: { ...s.pvp, token: '' } }));

    await useBattleStore.getState().refreshSummon();

    expect(chamadas).toHaveLength(0);
    expect(useBattleStore.getState().summon.error).toBeTruthy();
  });

  // O pity é do SERVIDOR: o contador mora na conta (D18). A tela mostra o que recebeu, e
  // a única conta que ela faz é "quantas faltam" — que é subtração, não regra.
  it('mostra o pity como o servidor o entrega, e quantas rolagens faltam', () => {
    conectado();
    const banner = useBattleStore.getState().summon.banners[0]!;

    expect(banner.rollsSinceNew).toBe(7);
    expect(banner.pityThreshold - banner.rollsSinceNew).toBe(3);
  });
});

describe('invocar', () => {
  it('gasta a moeda e mostra o personagem que saiu', async () => {
    conectado(500);
    responder('/api/summon', {
      outcome: { kind: 'character', characterId: 'ally-grifeiro' },
      premium: 0,
      rollsSinceNew: 0,
    });
    responder('/api/me/roster', {
      premium: 0,
      characters: PERSONAGENS.map((c) => (c.id === 'ally-grifeiro' ? { ...c, owned: true } : c)),
    });
    responder('/api/summon/banners', { premium: 0, banners: [{ ...BANNER, rollsSinceNew: 0 }] });
    responder('/api/me/rewards', { premium: 0, account: {}, rewards: PREMIOS });
    responder('/api/me/heroes', [
      { hero: { id: 'player-1-ally-grifeiro', characterId: 'ally-grifeiro', classId: 'class-grifeiro' }, equippedItems: [] },
    ]);

    await useBattleStore.getState().rollSummon('banner-elenco');
    const { summon } = useBattleStore.getState();

    expect(summon.lastResult?.outcome).toEqual({ kind: 'character', characterId: 'ally-grifeiro' });
    expect(summon.premium).toBe(0);
    // E o roster foi relido: o personagem novo aparece possuído sem recarregar a página.
    expect(summon.characters.find((c) => c.id === 'ally-grifeiro')?.owned).toBe(true);
    // O de HERÓIS também, que é o que separa "aparece no elenco" de "é jogável": sem isto
    // o invocado só entraria no time depois de reconectar (visto no navegador).
    expect(useBattleStore.getState().pvp.roster.map((e) => e.hero.id)).toContain('player-1-ally-grifeiro');
  });

  it('a duplicata é mostrada COMO duplicata, com o fragmento que ela virou', async () => {
    conectado(500);
    responder('/api/summon', {
      outcome: {
        kind: 'duplicate',
        characterId: 'ally-grifeiro',
        fragmentMaterialId: 'material-fragmento-ally-grifeiro',
      },
      premium: 0,
      rollsSinceNew: 8,
    });

    await useBattleStore.getState().rollSummon('banner-elenco');

    expect(useBattleStore.getState().summon.lastResult?.outcome.kind).toBe('duplicate');
  });

  // A recusa por saldo é do servidor (§9.4, quem decide é ele), mas a tela tem de impedir
  // que ela vire requisição — é o mesmo contrato da defesa de arena em M15 3/N.
  it('sem saldo, o cliente NÃO manda a requisição', async () => {
    conectado(499);

    await useBattleStore.getState().rollSummon('banner-elenco');

    expect(chamadas.filter((c) => c.url === '/api/summon')).toHaveLength(0);
    expect(useBattleStore.getState().summon.error).toContain('premium');
  });

  it('o nonce é do cliente e é diferente a cada invocação', async () => {
    conectado(2000);
    responder('/api/summon', {
      outcome: { kind: 'character', characterId: 'ally-grifeiro' },
      premium: 1500,
      rollsSinceNew: 0,
    });

    await useBattleStore.getState().rollSummon('banner-elenco');
    conectado(2000);
    await useBattleStore.getState().rollSummon('banner-elenco');

    const nonces = chamadas.filter((c) => c.url === '/api/summon').map((c) => (c.body as { nonce: string }).nonce);
    expect(nonces).toHaveLength(2);
    expect(new Set(nonces).size).toBe(2);
  });

  it('erro do servidor aparece na tela em vez de sumir', async () => {
    conectado(500);
    responder('/api/summon', { error: 'esta ação já foi executada' }, 409);

    await useBattleStore.getState().rollSummon('banner-elenco');

    expect(useBattleStore.getState().summon.error).toContain('409');
  });
});

describe('os prêmios e o segundo sumidouro', () => {
  it('reivindica um prêmio e credita a moeda', async () => {
    conectado(0);
    responder('/api/rewards/achievement-primeiro-passo/claim', {
      rewardId: 'achievement-primeiro-passo',
      premiumAwarded: 300,
      premium: 300,
    });
    responder('/api/me/rewards', {
      premium: 300,
      account: {},
      rewards: [{ ...PREMIOS[0], claimed: true, claimable: false }, PREMIOS[1]],
    });
    responder('/api/me/roster', { premium: 300, characters: PERSONAGENS });
    responder('/api/summon/banners', { premium: 300, banners: [BANNER] });

    await useBattleStore.getState().claimReward('achievement-primeiro-passo');

    // O corpo do POST não pode ser vazio: `request` sempre declara `content-type:
    // application/json`, e o Fastify recusa com 400 um POST que se diz JSON e não traz
    // corpo. Aconteceu no navegador nesta fatia; aqui está a trava.
    const claim = chamadas.find((c) => c.url.includes('/claim'))!;
    expect(claim.body).not.toBeNull();

    expect(useBattleStore.getState().summon.premium).toBe(300);
    expect(useBattleStore.getState().summon.rewards[0]?.claimed).toBe(true);
  });

  it('prêmio não reivindicável não vira requisição', async () => {
    conectado(0);

    await useBattleStore.getState().claimReward('event-semana-de-estreia');

    expect(chamadas.filter((c) => c.url.includes('/claim'))).toHaveLength(0);
  });

  it('comprar energia gasta premium e devolve a energia nova', async () => {
    conectado(1000);
    responder('/api/energy/purchase', { energy: { stored: 120, asOfMs: 0 }, premium: 900 });
    responder('/api/me/economy', {
      energy: { stored: 120, asOfMs: 0 },
      energyMax: 60,
      wallet: { gold: 0, stones: 0, arenaMarks: 0 },
      materials: {},
      inventory: [],
      clearedDungeons: [],
    });
    responder('/api/dungeons', { dungeons: [] });

    await useBattleStore.getState().purchaseEnergy();

    expect(useBattleStore.getState().summon.premium).toBe(900);
    expect(useBattleStore.getState().pve.economy?.energy.stored).toBe(120);
  });
});
