import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { capituloInicialAberto, useBattleStore } from '../src/store/battleStore.js';

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

// M27 (D23) — a campanha passou a ter DUAS camadas: o capítulo agrupa, e a missão é o que
// se joga. O ticket e a run continuam sendo por id de MISSÃO.
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
  responder('/api/campaign', { chapters: CAPITULOS, premiumOnFirstClear: 60, premiumOnChapterClear: 300 });
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

  // M26 3/N — a arte que vem junto do setup.
  it('guarda o mapa de arte do ticket, e ele sobrevive à montagem do tabuleiro', async () => {
    conectado();
    responder('/api/campaign/encounter-campanha-1/ticket', {
      nonce: 'n-1',
      seed: 7,
      rulesVersion: 'x',
      setup: SETUP,
      characterIdByUnitId: { 'player-h-aren': 'hero-jogador' },
      chapterId: 'encounter-campanha-1',
    });
    useBattleStore.getState().selectChapter('encounter-campanha-1');
    useBattleStore.getState().toggleCampaignHero('h-aren');

    await useBattleStore.getState().enterChapter('encounter-campanha-1');

    // `player-h-aren` é o `unitId` do tabuleiro e `hero-jogador` é a entrada do manifesto.
    // Sem esta linha o cliente teria de adivinhar uma pela outra, e é exatamente o que ele
    // não consegue fazer nos modos que não têm roster.
    expect(useBattleStore.getState().artIdByUnitId).toEqual({ 'player-h-aren': 'hero-jogador' });
  });

  it('sair do capítulo esvazia o mapa — arte de outra batalha no tabuleiro seguinte é pior que glifo', async () => {
    conectado();
    responder('/api/campaign/encounter-campanha-1/ticket', {
      nonce: 'n-1',
      seed: 7,
      rulesVersion: 'x',
      setup: SETUP,
      characterIdByUnitId: { 'player-h-aren': 'hero-jogador' },
      chapterId: 'encounter-campanha-1',
    });
    useBattleStore.getState().selectChapter('encounter-campanha-1');
    useBattleStore.getState().toggleCampaignHero('h-aren');
    await useBattleStore.getState().enterChapter('encounter-campanha-1');
    expect(useBattleStore.getState().artIdByUnitId).not.toEqual({});

    useBattleStore.getState().exitPvp();

    expect(useBattleStore.getState().artIdByUnitId).toEqual({});
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
    // M27 — a releitura devolve as duas camadas, com a MISSÃO limpa dentro do capítulo.
    responder('/api/campaign', {
      chapters: CAPITULOS.map((c) => ({
        ...c,
        missions: c.missions.map((m) => (m.id === 'encounter-campanha-1' ? { ...m, cleared: true } : m)),
      })),
      premiumOnFirstClear: 60,
      premiumOnChapterClear: 300,
    });

    await useBattleStore.getState().submitCampaignRun();
    const { campaign } = useBattleStore.getState();

    expect(campaign.lastRun?.outcome).toBe('victory');
    expect(campaign.lastRun?.premiumAwarded).toBe(600);
    // E a lista foi relida: a missão aparece limpa sem recarregar a página.
    expect(
      campaign.chapters.flatMap((c) => c.missions).find((m) => m.id === 'encounter-campanha-1')?.cleared,
    ).toBe(true);
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

// M27, 3/N — O CAPÍTULO RECOLHÍVEL.
//
// A 1/N desenhou a lista com o capítulo como cabeçalho e a missão como botão, e ali eram
// oito missões. São trinta. Três cabeçalhos e trinta botões numa rolagem só transformam
// "onde eu parei?" numa busca visual — e a demo tem rampa, então onde o jogador parou é a
// única informação que a tela precisa dar de graça.
//
// O que se afirma aqui é a REGRA de qual capítulo abre, e não o desenho: o projeto testa o
// store, e é por isso que este estado mora nele e não numa `useState` do componente.
const TRES_CAPITULOS = [
  {
    id: 'chapter-1',
    order: 1,
    name: 'Capítulo 1',
    cleared: true,
    missions: [{ id: 'm-1-1', order: 1, name: 'M1', cleared: true, slots: 1 }],
  },
  {
    id: 'chapter-2',
    order: 2,
    name: 'Capítulo 2',
    cleared: false,
    missions: [
      { id: 'm-2-1', order: 1, name: 'M1', cleared: true, slots: 2 },
      { id: 'm-2-2', order: 2, name: 'M2', cleared: false, slots: 2 },
    ],
  },
  {
    id: 'chapter-3',
    order: 3,
    name: 'Capítulo 3',
    cleared: false,
    missions: [{ id: 'm-3-1', order: 1, name: 'M1', cleared: false, slots: 3 }],
  },
];

function comCapitulos(chapters: unknown): void {
  responder('/api/campaign', { chapters, premiumOnFirstClear: 60, premiumOnChapterClear: 300 });
}

function zerarAbertos(): void {
  useBattleStore.setState((s) => ({ campaign: { ...s.campaign, openChapterIds: [] } }));
}

describe('capituloInicialAberto() — onde o jogador parou', () => {
  it('é o primeiro capítulo que ainda tem missão por limpar', () => {
    expect(capituloInicialAberto(TRES_CAPITULOS)).toBe('chapter-2');
  });

  it('pula o capítulo inteiro limpo, mesmo sendo o primeiro', () => {
    // A alternativa ingênua — "abre o primeiro" — mandaria quem já jogou metade da demo
    // para o começo dela toda vez que a tela abrisse.
    expect(TRES_CAPITULOS[0]!.missions.every((m) => m.cleared), 'a fixture perdeu o sentido').toBe(true);
    expect(capituloInicialAberto(TRES_CAPITULOS)).not.toBe('chapter-1');
  });

  it('com a demo inteira limpa abre o ÚLTIMO — quem terminou volta pelo fim', () => {
    const tudoLimpo = TRES_CAPITULOS.map((c) => ({
      ...c,
      cleared: true,
      missions: c.missions.map((m) => ({ ...m, cleared: true })),
    }));
    expect(capituloInicialAberto(tudoLimpo)).toBe('chapter-3');
  });

  it('sem capítulo nenhum não inventa um', () => {
    expect(capituloInicialAberto([])).toBeNull();
  });
});

describe('a lista recolhe, e a escolha do jogador é dele', () => {
  it('a primeira carga já vem com o capítulo de onde ele parou aberto', async () => {
    useBattleStore.setState((s) => ({ pvp: { ...s.pvp, token: TOKEN } }));
    zerarAbertos();
    comCapitulos(TRES_CAPITULOS);

    await useBattleStore.getState().refreshCampaign();

    expect(useBattleStore.getState().campaign.openChapterIds).toEqual(['chapter-2']);
  });

  it('atualizar NÃO reabre o que ele fechou — a lista se atualiza sozinha ao vencer', async () => {
    useBattleStore.setState((s) => ({ pvp: { ...s.pvp, token: TOKEN } }));
    comCapitulos(TRES_CAPITULOS);
    useBattleStore.setState((s) => ({ campaign: { ...s.campaign, openChapterIds: ['chapter-3'] } }));

    await useBattleStore.getState().refreshCampaign();

    expect(useBattleStore.getState().campaign.openChapterIds).toEqual(['chapter-3']);
  });

  it('mas descarta capítulo que o servidor não manda mais', async () => {
    // Sem isto, um capítulo removido do catálogo ficaria "aberto" para sempre num conjunto
    // que ninguém mais consegue limpar pela tela.
    useBattleStore.setState((s) => ({ pvp: { ...s.pvp, token: TOKEN } }));
    comCapitulos(TRES_CAPITULOS);
    useBattleStore.setState((s) => ({
      campaign: { ...s.campaign, openChapterIds: ['chapter-3', 'chapter-que-saiu'] },
    }));

    await useBattleStore.getState().refreshCampaign();

    expect(useBattleStore.getState().campaign.openChapterIds).toEqual(['chapter-3']);
  });

  it('abre e fecha, e mais de um por vez', () => {
    useBattleStore.setState((s) => ({
      campaign: { ...s.campaign, chapters: TRES_CAPITULOS as never, openChapterIds: [] },
    }));
    const { toggleChapterOpen } = useBattleStore.getState();

    toggleChapterOpen('chapter-1');
    toggleChapterOpen('chapter-3');
    expect(useBattleStore.getState().campaign.openChapterIds).toEqual(['chapter-1', 'chapter-3']);

    toggleChapterOpen('chapter-1');
    expect(useBattleStore.getState().campaign.openChapterIds).toEqual(['chapter-3']);
  });

  it('capítulo que não existe não entra no conjunto', () => {
    useBattleStore.setState((s) => ({
      campaign: { ...s.campaign, chapters: TRES_CAPITULOS as never, openChapterIds: [] },
    }));

    useBattleStore.getState().toggleChapterOpen('chapter-inventado');

    expect(useBattleStore.getState().campaign.openChapterIds).toEqual([]);
  });
});
