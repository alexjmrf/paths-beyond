import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useBattleStore } from '../src/store/battleStore.js';

// §10/§9.4 (M18, sub-sessão 7/N) — a CAMPANHA do cliente, agora jogada pelo servidor.
//
// Até esta fatia a campanha era 100% local: o setup vinha de `data/campaign.ts`, o
// progresso morava no `localStorage` e nenhum servidor via nada. A 4/N decidiu o contrário
// (o servidor é autoritativo sobre progressão, como em todo gacha comercial) e construiu o
// lado dele; aqui está o lado do cliente.
//
// O que este arquivo trava é o que o roteiro de navegador não prova barato: as recusas que
// a tela faz ANTES de virarem requisição, e o que ela manda quando manda. Nada aqui é regra
// (regra 3) — quem monta a batalha e quem decide o desfecho é o servidor.

const TOKEN = 'token-de-teste';

const CAPITULOS = [
  { id: 'encounter-campanha-1', chapter: 1, name: 'Capítulo 1', cleared: false, slots: 1 },
  { id: 'encounter-campanha-2', chapter: 2, name: 'Capítulo 2', cleared: false, slots: 2 },
];

const ROSTER = [
  { hero: { id: 'h-aren', characterId: 'hero-jogador', classId: 'class-espadachim' }, equippedItems: [] },
  { hero: { id: 'h-miron', characterId: 'ally-clerigo', classId: 'class-clerigo' }, equippedItems: [] },
  { hero: { id: 'h-sylla', characterId: 'ally-arqueiro', classId: 'class-arqueiro' }, equippedItems: [] },
];

// Um `BattleSetup` mínimo, do formato que o ticket devolve. Não precisa ser jogável: o que
// se afirma aqui é o TRANSPORTE — que o setup do servidor vira o tabuleiro da tela.
const SETUP = {
  units: [
    {
      unitId: 'player-h-aren',
      heroId: 'h-aren',
      side: 'player',
      pos: { x: 1, y: 1 },
      height: 0,
      hp: 100,
      ap: 3,
      pp: 2,
      hasActedThisRound: false,
      effects: [],
      cooldowns: {},
      stats: { hp: 100, atk: 10, def: 10, spd: 10, chc: 0, chd: 0, eff: 0, efr: 0, pen: 0, heal: 0, lifesteal: 0, focus: 0, vigor: 0 },
      unitType: 'infantry',
      weaponType: 'sword',
      duelRange: 1,
      assistRange: 2,
      moveType: 'foot',
      moveRange: 4,
      tacticsScript: [],
      reactionScript: [],
      knownSkills: {},
    },
  ],
  map: {
    width: 3,
    height: 3,
    tiles: Array.from({ length: 3 }, () => Array.from({ length: 3 }, () => ({ terrain: 'plain', height: 0 }))),
    terrains: {
      plain: {
        id: 'plain',
        moveCost: { foot: 1, cavalry: 1, flying: 1, heavy: 1, aquatic: 2 },
        defBonus: 0,
        evaBonus: 0,
        blocksSight: false,
      },
    },
    zocEnabled: true,
  },
  permadeath: 'casual',
  winCondition: { t: 'rout' },
  effectDefs: {},
  valorSkills: {},
  initialValor: 5,
};

interface Chamada {
  readonly url: string;
  readonly method: string;
  readonly body: any;
}

let chamadas: Chamada[] = [];
let respostas: Record<string, { status: number; body: unknown }> = {};

function responder(url: string, body: unknown, status = 200): void {
  respostas[url] = { status, body };
}

function instalarFetch(): void {
  chamadas = [];
  respostas = {};
  responder('/api/campaign', { chapters: CAPITULOS, premiumOnFirstClear: 600 });
  responder('/api/me/heroes', ROSTER);

  vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
    chamadas.push({
      url,
      method: init?.method ?? 'GET',
      body: init?.body ? JSON.parse(init.body as string) : null,
    });
    const resposta = respostas[url];
    if (!resposta) return new Response(JSON.stringify({ error: 'rota não semeada' }), { status: 404 });
    return new Response(JSON.stringify(resposta.body), { status: resposta.status });
  });
}

function conectado(): void {
  useBattleStore.setState((s) => ({
    pvp: { ...s.pvp, token: TOKEN, roster: ROSTER as never },
    campaign: { ...s.campaign, chapters: CAPITULOS, error: null, status: null, selectedHeroIds: [], ticket: null, lastRun: null },
  }));
}

beforeEach(() => {
  instalarFetch();
  useBattleStore.setState((s) => ({ campaign: { ...s.campaign, error: null, status: null } }));
});

afterEach(() => vi.unstubAllGlobals());

describe('a lista de capítulos vem do servidor', () => {
  it('carrega capítulos e o roster numa atualização só', async () => {
    useBattleStore.setState((s) => ({ pvp: { ...s.pvp, token: TOKEN } }));

    await useBattleStore.getState().refreshCampaign();
    const { campaign } = useBattleStore.getState();

    expect(campaign.chapters.map((c) => c.id)).toEqual(CAPITULOS.map((c) => c.id));
    expect(useBattleStore.getState().pvp.roster).toHaveLength(3);
  });

  it('sem token, nem tenta: a recusa não vira requisição', async () => {
    useBattleStore.setState((s) => ({ pvp: { ...s.pvp, token: '' } }));

    await useBattleStore.getState().refreshCampaign();

    expect(chamadas).toHaveLength(0);
    expect(useBattleStore.getState().campaign.error).toBeTruthy();
  });
});

describe('a escolha de quem preenche as VAGAS (D16)', () => {
  it('seleciona e desseleciona um herói do roster', () => {
    conectado();
    const store = useBattleStore.getState();

    store.selectChapter('encounter-campanha-2');
    store.toggleCampaignHero('h-aren');
    expect(useBattleStore.getState().campaign.selectedHeroIds).toEqual(['h-aren']);

    useBattleStore.getState().toggleCampaignHero('h-aren');
    expect(useBattleStore.getState().campaign.selectedHeroIds).toEqual([]);
  });

  // O capítulo declara N vagas e o servidor recusa com 400 quem manda mais (provado em
  // `apps/server/tests/rewards.test.ts`). A tela tem de impedir antes: o mesmo contrato da
  // defesa de arena em M15 3/N.
  it('não deixa passar do número de vagas do capítulo', () => {
    conectado();
    useBattleStore.getState().selectChapter('encounter-campanha-1'); // 1 vaga

    useBattleStore.getState().toggleCampaignHero('h-aren');
    useBattleStore.getState().toggleCampaignHero('h-miron');

    expect(useBattleStore.getState().campaign.selectedHeroIds).toEqual(['h-aren']);
    expect(useBattleStore.getState().campaign.error).toContain('vaga');
  });

  it('herói fora do roster não entra: o servidor recusaria por posse (§9.4)', () => {
    conectado();
    useBattleStore.getState().selectChapter('encounter-campanha-2');

    useBattleStore.getState().toggleCampaignHero('h-de-outro-jogador');

    expect(useBattleStore.getState().campaign.selectedHeroIds).toEqual([]);
  });

  it('trocar de capítulo apara a seleção que não cabe mais', () => {
    conectado();
    useBattleStore.getState().selectChapter('encounter-campanha-2'); // 2 vagas
    useBattleStore.getState().toggleCampaignHero('h-aren');
    useBattleStore.getState().toggleCampaignHero('h-miron');
    expect(useBattleStore.getState().campaign.selectedHeroIds).toHaveLength(2);

    useBattleStore.getState().selectChapter('encounter-campanha-1'); // 1 vaga

    expect(useBattleStore.getState().campaign.selectedHeroIds).toHaveLength(1);
  });
});

describe('entrar no capítulo', () => {
  it('pede o ticket e o setup do SERVIDOR vira o tabuleiro', async () => {
    conectado();
    responder('/api/campaign/encounter-campanha-1/ticket', {
      nonce: 'n-1',
      seed: 7,
      rulesVersion: 'x',
      setup: SETUP,
      chapterId: 'encounter-campanha-1',
    });
    useBattleStore.getState().selectChapter('encounter-campanha-1');
    useBattleStore.getState().toggleCampaignHero('h-aren');

    await useBattleStore.getState().enterChapter('encounter-campanha-1');
    const state = useBattleStore.getState();

    expect(state.mode).toBe('campaign');
    expect(state.campaign.ticket?.nonce).toBe('n-1');
    // O tabuleiro é o que o servidor mandou, e não um setup montado aqui: §9.1 chama de bug
    // crítico a divergência entre o que o cliente jogou e o que o servidor reexecuta.
    expect(state.battleState.units.map((u) => u.unitId)).toEqual(['player-h-aren']);
    expect(state.commandLog).toEqual([]);

    const pedido = chamadas.find((c) => c.url.includes('/ticket'))!;
    expect(pedido.body.heroIds).toEqual(['h-aren']);
  });

  it('sem herói escolhido não manda requisição', async () => {
    conectado();
    useBattleStore.getState().selectChapter('encounter-campanha-1');

    await useBattleStore.getState().enterChapter('encounter-campanha-1');

    expect(chamadas.filter((c) => c.url.includes('/ticket'))).toHaveLength(0);
    expect(useBattleStore.getState().campaign.error).toBeTruthy();
  });

  it('erro do servidor aparece na tela em vez de sumir', async () => {
    conectado();
    responder('/api/campaign/encounter-campanha-1/ticket', { error: 'você não possui: ally-grifeiro' }, 400);
    useBattleStore.getState().selectChapter('encounter-campanha-1');
    useBattleStore.getState().toggleCampaignHero('h-aren');

    await useBattleStore.getState().enterChapter('encounter-campanha-1');

    expect(useBattleStore.getState().campaign.error).toContain('não possui');
  });
});

describe('submeter o capítulo', () => {
  async function entrar() {
    conectado();
    responder('/api/campaign/encounter-campanha-1/ticket', {
      nonce: 'n-1',
      seed: 7,
      rulesVersion: 'x',
      setup: SETUP,
      chapterId: 'encounter-campanha-1',
    });
    useBattleStore.getState().selectChapter('encounter-campanha-1');
    useBattleStore.getState().toggleCampaignHero('h-aren');
    await useBattleStore.getState().enterChapter('encounter-campanha-1');
  }

  it('manda o nonce do ticket, os heróis e os comandos jogados', async () => {
    await entrar();
    responder('/api/campaign/encounter-campanha-1/run', {
      outcome: 'victory',
      roundsPlayed: 3,
      premiumAwarded: 600,
      premium: 600,
    });

    await useBattleStore.getState().submitCampaignRun();

    const envio = chamadas.find((c) => c.url.endsWith('/run'))!;
    expect(envio.body.nonce).toBe('n-1');
    expect(envio.body.heroIds).toEqual(['h-aren']);
    expect(Array.isArray(envio.body.commands)).toBe(true);
  });

  it('o desfecho do servidor é o que a tela mostra, inclusive a moeda paga', async () => {
    await entrar();
    responder('/api/campaign/encounter-campanha-1/run', {
      outcome: 'victory',
      roundsPlayed: 3,
      premiumAwarded: 600,
      premium: 600,
    });
    responder('/api/campaign', {
      chapters: CAPITULOS.map((c) => (c.id === 'encounter-campanha-1' ? { ...c, cleared: true } : c)),
      premiumOnFirstClear: 600,
    });

    await useBattleStore.getState().submitCampaignRun();
    const { campaign } = useBattleStore.getState();

    expect(campaign.lastRun?.outcome).toBe('victory');
    expect(campaign.lastRun?.premiumAwarded).toBe(600);
    // E a lista foi relida: o capítulo aparece limpo sem recarregar a página.
    expect(campaign.chapters.find((c) => c.id === 'encounter-campanha-1')?.cleared).toBe(true);
  });

  it('sem ticket não manda nada', async () => {
    conectado();
    await useBattleStore.getState().submitCampaignRun();
    expect(chamadas.filter((c) => c.url.endsWith('/run'))).toHaveLength(0);
  });
});

describe('a preparação passa a persistir no servidor', () => {
  it('editar o script tático manda o PUT e guarda o que voltou', async () => {
    conectado();
    responder('/api/heroes/h-aren/tactics', {
      hero: { ...ROSTER[0]!.hero, tacticsScript: [{ enabled: true, skillId: 'skill-x', conditions: [] }] },
    });

    await useBattleStore.getState().saveHeroTactics('h-aren', [{ enabled: true, skillId: 'skill-x', conditions: [] }]);

    const envio = chamadas.find((c) => c.url.includes('/tactics'))!;
    expect(envio.method).toBe('PUT');
    expect(useBattleStore.getState().pvp.roster.find((e) => e.hero.id === 'h-aren')!.hero.tacticsScript).toHaveLength(1);
  });

  it('a recusa do servidor vira mensagem, e o roster local não muda', async () => {
    conectado();
    responder('/api/heroes/h-aren/tactics', { error: 'o script tem 5 linha(s); o teto é 4 (§6.3)' }, 400);

    await useBattleStore.getState().saveHeroTactics('h-aren', []);

    expect(useBattleStore.getState().campaign.error).toContain('teto');
  });

  it('alocar talento manda o PUT com a alocação inteira', async () => {
    conectado();
    responder('/api/heroes/h-aren/talents', { hero: { ...ROSTER[0]!.hero, talents: { 'talent-aren-fio-agressivo': 1 } } });

    await useBattleStore.getState().saveHeroTalents('h-aren', { 'talent-aren-fio-agressivo': 1 });

    const envio = chamadas.find((c) => c.url.includes('/talents'))!;
    expect(envio.method).toBe('PUT');
    expect(envio.body.talents).toEqual({ 'talent-aren-fio-agressivo': 1 });
    expect(useBattleStore.getState().pvp.roster.find((e) => e.hero.id === 'h-aren')!.hero.talents).toEqual({
      'talent-aren-fio-agressivo': 1,
    });
  });
});
