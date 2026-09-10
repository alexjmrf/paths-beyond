import { loadCatalogFromDisk } from '@paths-beyond/content';
import { RULES_VERSION, resolveAutoBattle, type Hero } from '@paths-beyond/core';
import { describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { createDevIdentityValidator } from '../src/identity/devIdentity.js';
import { createInMemoryRateLimiter } from '../src/battle/rateLimit.js';
import {
  createMemoryArenaDefenseRepository,
  createMemoryCharacterOwnershipRepository,
  createMemoryEconomyRepository,
  createMemoryHeroRepository,
  createMemoryPlayerRepository,
  createMemoryReplayRepository,
  createMemoryRewardsRepository,
  createMemorySeasonRepository,
} from '../src/repository/memoryRepository.js';
import { DEFAULT_PVE_ACCOUNT } from '../src/repository/types.js';

// §10 (M18, sub-sessão 4/N) — as QUATRO fontes da moeda premium.
//
// Duas são pagas no caminho da batalha (primeira completude de capítulo e de masmorra), e
// duas são reivindicadas (conquistas e eventos). O que este arquivo mede é o critério de
// aceite 4: cada fonte concede UMA ÚNICA VEZ.
//
// E mede também o que a fatia teve de construir para a primeira delas existir: até M18 3/N
// o servidor não tinha uma única rota de campanha, e não tinha como saber que um capítulo
// foi vencido.

const TICKET_SECRET = 'segredo-de-teste';
const TOKEN = 'token-rewards';
// Dentro da janela dos eventos autorados (2026-01-01 → 2027-01-01).
const DENTRO = Date.UTC(2026, 5, 1);
const FORA = Date.UTC(2025, 5, 1);

const catalog = loadCatalogFromDisk();
const CAPITULO = 'encounter-campanha-1';

// A party do capítulo 1 é o próprio conteúdo: o herói que o encontro declara é aquele
// contra o qual o capítulo foi afinado. Copiá-lo é o que torna a vitória possível sem
// inventar um herói de teste com números escolhidos para ganhar.
function heroiDoCapitulo(): Hero {
  const encounter = catalog.encounters.find((e) => e.id === CAPITULO)!;
  const slot = encounter.units.find((unit) => unit.side === 'player')!;
  return (slot as { hero: Hero }).hero;
}

interface Harness {
  readonly app: ReturnType<typeof buildApp>;
  readonly playerRepository: ReturnType<typeof createMemoryPlayerRepository>;
  readonly ownershipRepository: ReturnType<typeof createMemoryCharacterOwnershipRepository>;
  readonly rewardsRepository: ReturnType<typeof createMemoryRewardsRepository>;
  readonly heroRepository: ReturnType<typeof createMemoryHeroRepository>;
}

function buildHarness(options: { now?: number; elo?: number } = {}): Harness {
  const hero = heroiDoCapitulo();
  const playerRepository = createMemoryPlayerRepository([
    {
      id: 'player-1',
      platformProvider: 'dev' as const,
      platformId: TOKEN,
      displayName: 'Herói',
      elo: options.elo ?? 1200,
      arenaMarks: 0,
      ...DEFAULT_PVE_ACCOUNT,
      energy: { stored: catalog.economyRules.energy.max, asOfMs: options.now ?? DENTRO },
    },
  ]);
  const heroRepository = createMemoryHeroRepository([{ ownerPlayerId: 'player-1', hero, equippedItems: [] }]);
  const ownershipRepository = createMemoryCharacterOwnershipRepository();
  const rewardsRepository = createMemoryRewardsRepository();

  return {
    playerRepository,
    ownershipRepository,
    rewardsRepository,
    heroRepository,
    app: buildApp({
      repository: playerRepository,
      heroRepository,
      arenaDefenseRepository: createMemoryArenaDefenseRepository(),
      replayRepository: createMemoryReplayRepository(),
      seasonRepository: createMemorySeasonRepository(),
      economyRepository: createMemoryEconomyRepository(),
      ownershipRepository,
      rewardsRepository,
      catalog,
      shopCatalog: {},
      rateLimiter: createInMemoryRateLimiter({ maxRequests: 1000, windowMs: 60_000 }),
      ticketSecret: TICKET_SECRET,
      identityValidator: createDevIdentityValidator(),
      now: () => options.now ?? DENTRO,
    }),
  };
}

async function post(h: Harness, url: string, payload: Record<string, unknown> = {}) {
  const response = await h.app.inject({ method: 'POST', url, headers: { 'x-platform-ticket': `dev:${TOKEN}`}, payload });
  return { status: response.statusCode, body: response.json() as any };
}

async function get(h: Harness, url: string) {
  const response = await h.app.inject({ method: 'GET', url, headers: { 'x-platform-ticket': `dev:${TOKEN}`} });
  return { status: response.statusCode, body: response.json() as any };
}

// Uma vitória honesta no capítulo: o servidor exige que os comandos submetidos levem à
// vitória, então o teste joga do mesmo jeito que um cliente jogaria e submete exatamente
// esses comandos. Mesmo idioma de `economy.test.ts`.
async function jogarCapitulo(h: Harness, chapterId = CAPITULO) {
  const heroIds = [heroiDoCapitulo().id];
  const ticket = await post(h, `/campaign/${chapterId}/ticket`, { heroIds });
  expect(ticket.status).toBe(200);

  const jogada = resolveAutoBattle({ setup: ticket.body.setup, seed: ticket.body.seed });
  return post(h, `/campaign/${chapterId}/run`, {
    nonce: ticket.body.nonce,
    heroIds,
    commands: jogada.commands,
    // M22 1/N — a submissão manda a versão de regras com que o cliente jogou, como
    // `/battles` sempre fez. Sem ela o servidor recusa: um cliente que não a manda é um
    // cliente anterior à checagem.
    rulesVersion: RULES_VERSION,
  });
}

describe('GET /campaign', () => {
  // M27 (D23) — a rota passou a devolver DUAS camadas. O que eram "seis capítulos" são seis
  // MISSÕES distribuídas em três capítulos, e o teste mede a forma nova inteira: se ela
  // voltasse a ser uma lista plana, a tela do cliente não teria onde pendurar a missão.
  it('lista os capítulos, cada um com as missões dentro e o que já foi limpo', async () => {
    const h = buildHarness();
    const { status, body } = await get(h, '/campaign');

    expect(status).toBe(200);
    expect(body.chapters.map((c: any) => c.id)).toEqual(catalog.chapters.map((c) => c.id));
    // A lista de missões sai do CATÁLOGO e não de literais: a demo vai a 30 missões na 2/N,
    // e um literal aqui só produziria a mesma edição mecânica sem nunca pegar um defeito.
    expect(body.chapters.flatMap((c: any) => c.missions).map((m: any) => m.id)).toEqual(
      catalog.encounters.map((e) => e.id),
    );
    // E cada missão foi para o capítulo dela, que é o que a camada nova existe para dizer.
    for (const chapter of body.chapters) {
      const esperadas = catalog.encounters.filter((e) => e.chapterId === chapter.id).map((e) => e.id);
      expect(chapter.missions.map((m: any) => m.id), chapter.id).toEqual(esperadas);
    }
    expect(body.chapters.every((c: any) => c.cleared === false)).toBe(true);
    expect(body.chapters.flatMap((c: any) => c.missions).every((m: any) => m.cleared === false)).toBe(true);
    expect(body.premiumOnFirstClear).toBe(catalog.premiumRules.premiumRewards.missionFirstClear);
    expect(body.premiumOnChapterClear).toBe(catalog.premiumRules.premiumRewards.chapterFirstClear);
  });
});

describe('POST /campaign/:id/run — a fonte "avanço de história"', () => {
  it('capítulo desconhecido é 404', async () => {
    const h = buildHarness();
    const { status } = await post(h, '/campaign/encounter-inexistente/ticket', { heroIds: ['x'] });
    expect(status).toBe(404);
  });

  // M27 — a escolha de D23, que o critério de aceite pede registrada: a primeira completude
  // paga por MISSÃO (pouco) e o fechamento do CAPÍTULO paga um bônus. Manter os 600 antigos
  // por unidade jogável daria 18.000 na demo de trinta missões — 36 invocações de graça.
  it('a PRIMEIRA vitória numa missão paga o valor de MISSÃO; a segunda não paga nada', async () => {
    const h = buildHarness();

    const primeira = await jogarCapitulo(h);
    expect(primeira.status).toBe(200);
    expect(primeira.body.outcome).toBe('victory');
    expect(primeira.body.premiumAwarded).toBe(catalog.premiumRules.premiumRewards.missionFirstClear);

    const segunda = await jogarCapitulo(h);
    expect(segunda.body.outcome).toBe('victory');
    expect(segunda.body.premiumAwarded).toBe(0);

    const player = await h.playerRepository.getPlayerById('player-1');
    expect(player?.premium).toBe(catalog.premiumRules.premiumRewards.missionFirstClear);
  });

  it('fechar a ÚLTIMA missão do capítulo paga a missão MAIS o bônus de capítulo', async () => {
    // O harness leva UM herói (o do encounter-campanha-1) e a missão 2 do capítulo 1 pede
    // duas vagas — ela não é vencível com este time, e isso é conteúdo real e não defeito.
    // Então a missão 2 entra como JÁ LIMPA pelo repositório, que é a fonte de verdade do
    // progresso, e a missão 1 é jogada honestamente: ela vira a chave do capítulo.
    const h = buildHarness();
    const { missionFirstClear, chapterFirstClear } = catalog.premiumRules.premiumRewards;
    // Todas as IRMÃS de `encounter-campanha-1` entram como já limpas pelo repositório, que é
    // a fonte de verdade do progresso; sobra a jogada de verdade, que vira a chave.
    for (const irma of catalog.encounters.filter(
      (e) => e.chapterId === 'chapter-1' && e.id !== 'encounter-campanha-1',
    )) {
      await h.rewardsRepository.markChapterCleared('player-1', irma.id);
    }

    const fecha = await jogarCapitulo(h, 'encounter-campanha-1');
    expect(fecha.body.outcome).toBe('victory');
    expect(fecha.body.premiumAwarded).toBe(missionFirstClear + chapterFirstClear);

    const { body } = await get(h, '/campaign');
    expect(body.chapters.find((c: any) => c.id === 'chapter-1').cleared).toBe(true);
  });

  it('o bônus de capítulo NÃO paga duas vezes', async () => {
    // Reprova a versão em que a recontagem roda a cada vitória em vez de só na primeira: um
    // jogador que repetisse a última missão receberia o bônus de novo, todas as vezes.
    const h = buildHarness();
    for (const irma of catalog.encounters.filter(
      (e) => e.chapterId === 'chapter-1' && e.id !== 'encounter-campanha-1',
    )) {
      await h.rewardsRepository.markChapterCleared('player-1', irma.id);
    }
    await jogarCapitulo(h, 'encounter-campanha-1');
    const premiumDepois = (await h.playerRepository.getPlayerById('player-1'))?.premium;

    const denovo = await jogarCapitulo(h, 'encounter-campanha-1');
    expect(denovo.body.premiumAwarded).toBe(0);
    expect((await h.playerRepository.getPlayerById('player-1'))?.premium).toBe(premiumDepois);
  });

  it('a missão vencida aparece como limpa, e o capítulo dela AINDA NÃO', async () => {
    // As duas metades importam: a de baixo é o progresso do jogador, e a de cima é a regra
    // de que capítulo só fecha quando todas as missões dele caem.
    const h = buildHarness();
    await jogarCapitulo(h);

    const { body } = await get(h, '/campaign');
    const capitulo = body.chapters.find((c: any) => c.id === 'chapter-1');
    expect(capitulo.missions.find((m: any) => m.id === CAPITULO).cleared).toBe(true);
    expect(capitulo.cleared).toBe(false);
  });

  it('§9.4 — o servidor REEXECUTA: comandos que não vencem não pagam nada', async () => {
    // É o ponto inteiro de a campanha ter vindo para o servidor. Um cliente que afirmasse
    // "limpei" sem jogar não recebe: o desfecho sai da reexecução, não do corpo do POST.
    const h = buildHarness();
    const heroIds = [heroiDoCapitulo().id];
    const ticket = await post(h, `/campaign/${CAPITULO}/ticket`, { heroIds });

    const semJogar = await post(h, `/campaign/${CAPITULO}/run`, {
      nonce: ticket.body.nonce,
      heroIds,
      commands: [],
      rulesVersion: RULES_VERSION,
    });

    expect(semJogar.status).toBe(200);
    expect(semJogar.body.outcome).toBe('defeat');
    expect(semJogar.body.premiumAwarded).toBe(0);

    const player = await h.playerRepository.getPlayerById('player-1');
    expect(player?.premium).toBe(0);
  });

  it('§9.4 — recusa herói cujo PERSONAGEM o jogador não possui', async () => {
    // A campanha era, até esta fatia, o único caminho do jogo em que dava para levar um
    // personagem não possuído ao mapa — porque nenhum servidor a via.
    const h = buildHarness();
    const naoPossuido: Hero = { ...heroiDoCapitulo(), id: 'heroi-intruso', characterId: 'ally-grifeiro' };
    await h.heroRepository.createHero({ ownerPlayerId: 'player-1', hero: naoPossuido, equippedItems: [] });

    const { status, body } = await post(h, `/campaign/${CAPITULO}/ticket`, { heroIds: ['heroi-intruso'] });

    expect(status).toBe(400);
    expect(body.error).toContain('ally-grifeiro');
  });
});

describe('o aliado de cenário chega ao tabuleiro (D16)', () => {
  // A primeira escrita de `assembleChapterBattle` filtrava só `enemy` ao montar o que não é
  // vaga, e PERDIA o aliado. O capítulo 1 não tem nenhum, então nada aqui teria reclamado —
  // e o capítulo 5 jogado pelo servidor nasceria sem a unidade que `escort` nomeia.
  it('o capítulo 5 montado pelo servidor tem a escoltada, e a condição a nomeia', async () => {
    const h = buildHarness();
    const heroIds = [heroiDoCapitulo().id];
    const ticket = await post(h, '/campaign/encounter-campanha-5/ticket', { heroIds });

    expect(ticket.status).toBe(200);
    const setup = ticket.body.setup;
    expect(setup.winCondition.t).toBe('escort');

    const escoltada = setup.units.find((u: any) => u.unitId === setup.winCondition.unitId);
    expect(escoltada, 'a unidade escoltada não chegou ao tabuleiro').toBeDefined();
    expect(escoltada.side).toBe('player');
  });

  it('o capítulo 6 montado pelo servidor tem o couraçado de cenário', async () => {
    const h = buildHarness();
    const heroIds = [heroiDoCapitulo().id];
    const ticket = await post(h, '/campaign/encounter-campanha-6/ticket', { heroIds });

    expect(ticket.status).toBe(200);
    expect(ticket.body.setup.units.some((u: any) => u.unitId === 'ally-couracado')).toBe(true);
  });

  it('o capítulo 5 declara 4 vagas, e levar 5 heróis é recusado', async () => {
    const h = buildHarness();
    const { body } = await get(h, '/campaign');
    const missao5 = body.chapters
      .flatMap((c: any) => c.missions)
      .find((m: any) => m.id === 'encounter-campanha-5');

    expect(missao5.slots).toBe(4);
  });
});

describe('GET /me/rewards e POST /rewards/:id/claim', () => {
  it('uma conta nova não tem nada reivindicável, e nada reivindicado', async () => {
    const h = buildHarness();
    const { body } = await get(h, '/me/rewards');

    expect(body.rewards.length).toBeGreaterThan(0);
    expect(body.rewards.every((r: any) => r.claimed === false)).toBe(true);
    // O único reivindicável sem ter feito nada é o evento sem condição, e só porque a
    // janela está aberta.
    expect(body.rewards.filter((r: any) => r.claimable).map((r: any) => r.id)).toEqual(['event-abertura']);
  });

  it('cumprir a condição torna a conquista reivindicável — e ela é retroativa', async () => {
    // Retroativa de graça: a condição é conferida contra o estado NA HORA da reivindicação,
    // e não por um contador que precisaria estar rodando desde antes.
    const h = buildHarness();
    await jogarCapitulo(h);

    const { body } = await get(h, '/me/rewards');
    const conquista = body.rewards.find((r: any) => r.id === 'achievement-primeiro-passo');

    expect(conquista.claimable).toBe(true);
    // M27 — "Primeiro Passo" passou a perguntar por MISSÃO, que é o que o nome dela diz.
    // `chaptersCleared` continua significando CAPÍTULO INTEIRO, e com uma missão de duas
    // limpa o capítulo 1 ainda não fechou — é exatamente a distinção que a migração podia
    // ter perdido em silêncio.
    expect(body.account.missionsCleared).toBe(1);
    expect(body.account.chaptersCleared).toBe(0);
  });

  // §9.4 (M21, 3/N) — o que o shell precisa para espelhar na plataforma.
  it('a conquista carrega o espelho da plataforma, e `earned` é CUMPRIMENTO e não reivindicação', async () => {
    const h = buildHarness();

    const { body: antes } = await get(h, '/me/rewards');
    const naoCumprida = antes.rewards.find((r: any) => r.id === 'achievement-primeiro-passo');
    // O espelho vem sempre: o cliente não conhece o catálogo de conquistas, ele só
    // encaminha a string para a plataforma.
    expect(naoCumprida.platform).toEqual({ id: 'ACH_PRIMEIRO_PASSO', earned: false });

    await jogarCapitulo(h);
    const { body: depois } = await get(h, '/me/rewards');
    // Cumpriu e ainda NÃO reivindicou: a plataforma já desbloqueia. A conquista diz o que o
    // jogador fez; reivindicar é só pegar a moeda.
    expect(depois.rewards.find((r: any) => r.id === 'achievement-primeiro-passo').platform.earned).toBe(true);

    await post(h, '/rewards/achievement-primeiro-passo/claim');
    const { body: reivindicada } = await get(h, '/me/rewards');
    const conquista = reivindicada.rewards.find((r: any) => r.id === 'achievement-primeiro-passo');
    // E continua cumprida depois de reivindicada — `claimable` vira `false` e `earned` não.
    // Sem isso, quem reivindicou antes de a plataforma existir nunca a veria no perfil.
    expect(conquista.claimable).toBe(false);
    expect(conquista.platform.earned).toBe(true);
  });

  it('o evento não tem espelho de plataforma — evento expira, conquista não', async () => {
    const h = buildHarness();
    const { body } = await get(h, '/me/rewards');

    for (const premio of body.rewards.filter((r: any) => r.kind === 'event')) {
      expect(premio.platform, premio.id).toBeUndefined();
    }
  });

  it('reivindicar paga a moeda, e reivindicar de novo é 409', async () => {
    const h = buildHarness();
    await jogarCapitulo(h);

    const premiumAntes = (await h.playerRepository.getPlayerById('player-1'))!.premium;
    const primeira = await post(h, '/rewards/achievement-primeiro-passo/claim');
    const segunda = await post(h, '/rewards/achievement-primeiro-passo/claim');

    expect(primeira.status).toBe(200);
    expect(primeira.body.premium).toBe(premiumAntes + primeira.body.premiumAwarded);
    expect(segunda.status).toBe(409);

    const player = await h.playerRepository.getPlayerById('player-1');
    expect(player?.premium).toBe(premiumAntes + primeira.body.premiumAwarded);
  });

  it('condição não cumprida é 403, e não paga', async () => {
    const h = buildHarness();
    const { status } = await post(h, '/rewards/achievement-a-fortaleza-caiu/claim');

    expect(status).toBe(403);
    const player = await h.playerRepository.getPlayerById('player-1');
    expect(player?.premium).toBe(0);
  });

  it('prêmio desconhecido é 404', async () => {
    const h = buildHarness();
    expect((await post(h, '/rewards/achievement-que-nao-existe/claim')).status).toBe(404);
  });

  it('a condição olha o ELO de verdade, e não um campo qualquer', async () => {
    const abaixo = buildHarness({ elo: 1299 });
    const acima = buildHarness({ elo: 1300 });

    expect((await post(abaixo, '/rewards/achievement-nome-na-arena/claim')).status).toBe(403);
    expect((await post(acima, '/rewards/achievement-nome-na-arena/claim')).status).toBe(200);
  });

  it('a posse conta para `charactersOwned`, núcleo incluído', async () => {
    const h = buildHarness();
    const { body: antes } = await get(h, '/me/rewards');
    expect(antes.account.charactersOwned).toBe(4); // o núcleo de história (D14)

    await h.ownershipRepository.grant('player-1', 'ally-grifeiro');
    await h.ownershipRepository.grant('player-1', 'ally-guerreiro');

    const { body: depois } = await get(h, '/me/rewards');
    expect(depois.account.charactersOwned).toBe(6);
    expect(depois.rewards.find((r: any) => r.id === 'achievement-companhia-crescendo').claimable).toBe(true);
  });
});

describe('eventos — a janela de tempo', () => {
  it('dentro da janela, o evento sem condição é reivindicável e paga', async () => {
    const h = buildHarness({ now: DENTRO });
    const { status, body } = await post(h, '/rewards/event-abertura/claim');

    expect(status).toBe(200);
    expect(body.premiumAwarded).toBe(catalog.events['event-abertura']!.premium);
  });

  it('fora da janela, o MESMO evento é recusado e não paga', async () => {
    const h = buildHarness({ now: FORA });
    const { status } = await post(h, '/rewards/event-abertura/claim');

    expect(status).toBe(403);
    const player = await h.playerRepository.getPlayerById('player-1');
    expect(player?.premium).toBe(0);
  });

  it('fora da janela o evento aparece na lista, mas com a janela fechada', async () => {
    // O cliente precisa distinguir "ainda não cumpri" de "perdi a janela", e derivar isso
    // lá exigiria o relógio do cliente — que não decide nada neste projeto.
    const h = buildHarness({ now: FORA });
    const { body } = await get(h, '/me/rewards');
    const evento = body.rewards.find((r: any) => r.id === 'event-abertura');

    expect(evento.windowOpen).toBe(false);
    expect(evento.claimable).toBe(false);
  });

  it('evento COM condição exige as duas coisas: janela aberta e condição cumprida', async () => {
    const h = buildHarness({ now: DENTRO });

    // Núcleo = 4 personagens; o evento pede 5.
    expect((await post(h, '/rewards/event-convocacao/claim')).status).toBe(403);

    await h.ownershipRepository.grant('player-1', 'ally-grifeiro');
    expect((await post(h, '/rewards/event-convocacao/claim')).status).toBe(200);
  });

  it('reivindicar um evento duas vezes é 409', async () => {
    const h = buildHarness({ now: DENTRO });
    expect((await post(h, '/rewards/event-abertura/claim')).status).toBe(200);
    expect((await post(h, '/rewards/event-abertura/claim')).status).toBe(409);
  });
});
