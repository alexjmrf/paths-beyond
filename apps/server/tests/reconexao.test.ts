import { loadCatalogFromDisk } from '@paths-beyond/content';
import { RULES_VERSION, type Hero } from '@paths-beyond/core';
import { describe, expect, it } from 'vitest';
import { jogarPartidaViva, type EstadoVisivelDeTeste } from './partidaViva.js';
import { buildApp } from '../src/app.js';
import { createInMemoryRateLimiter } from '../src/battle/rateLimit.js';
import { createDevIdentityValidator } from '../src/identity/devIdentity.js';
import {
  createMemoryArenaDefenseRepository,
  createMemoryPartyPresetRepository,
  createMemoryCharacterOwnershipRepository,
  createMemoryEconomyRepository,
  createMemoryHeroRepository,
  createMemoryIdempotencyRepository,
  createMemoryPlayerRepository,
  createMemoryMatchRepository,
  createMemoryReplayRepository,
  createMemoryRewardsRepository,
  createMemorySeasonRepository,
} from '../src/repository/memoryRepository.js';
import { DEFAULT_PVE_ACCOUNT } from '../src/repository/types.js';

// §9.4 (M22, sub-sessão 2/N) — a RECONEXÃO.
//
// O modo de falha que esta fatia existe para fechar é bem concreto: o jogador manda a run,
// **o servidor debita a energia e resolve a batalha**, e a conexão cai antes de a resposta
// chegar. O cliente não sabe se chegou. Se ele reenviar, até ontem levava
// `409 esta run já foi resolvida` — e do ponto de vista dele a energia sumiu junto com a
// partida.
//
// A primitiva certa já existia (o nonce); o que faltava era guardar a RESPOSTA e devolvê-la
// no reenvio. É o que o hook de `idempotency.ts` faz, e é o que este arquivo mede.

const TICKET_SECRET = 'segredo-de-teste';
const TOKEN = 'token-reconexao';
const AGORA = Date.UTC(2026, 5, 1);
const CAPITULO = 'encounter-campanha-1';

const catalog = loadCatalogFromDisk();
const MASMORRA = Object.values(catalog.dungeons).find((d) => !d.manualOnly && !d.requiresClearOf)!.id;

function heroiDoCapitulo(): Hero {
  const encounter = catalog.encounters.find((e) => e.id === CAPITULO)!;
  return (encounter.units.find((unit) => unit.side === 'player') as { hero: Hero }).hero;
}

function buildHarness() {
  const hero = heroiDoCapitulo();
  const playerRepository = createMemoryPlayerRepository([
    {
      id: 'player-1',
      platformProvider: 'dev' as const,
      platformId: TOKEN,
      displayName: 'Herói',
      elo: 1200,
      arenaMarks: 0,
      ...DEFAULT_PVE_ACCOUNT,
      premium: 5_000,
      energy: { stored: catalog.economyRules.energy.max, asOfMs: AGORA },
    },
  ]);
  const ownershipRepository = createMemoryCharacterOwnershipRepository();

  const app = buildApp({
    repository: playerRepository,
    heroRepository: createMemoryHeroRepository([{ ownerPlayerId: 'player-1', hero, equippedItems: [] }]),
    arenaDefenseRepository: createMemoryArenaDefenseRepository(),
    partyPresetRepository: createMemoryPartyPresetRepository(),
    replayRepository: createMemoryReplayRepository(),
    matchRepository: createMemoryMatchRepository(),
    seasonRepository: createMemorySeasonRepository(),
    economyRepository: createMemoryEconomyRepository(),
    ownershipRepository,
    rewardsRepository: createMemoryRewardsRepository(),
    idempotencyRepository: createMemoryIdempotencyRepository(),
    catalog,
    shopCatalog: {},
    rateLimiter: createInMemoryRateLimiter({ maxRequests: 1000, windowMs: 60_000 }),
    ticketSecret: TICKET_SECRET,
    identityValidator: createDevIdentityValidator(),
    now: () => AGORA,
  });

  return { app, playerRepository, ownershipRepository };
}

type Harness = ReturnType<typeof buildHarness>;

async function post(h: Harness, url: string, payload: Record<string, unknown> = {}) {
  const response = await h.app.inject({
    method: 'POST',
    url,
    headers: { 'x-platform-ticket': `dev:${TOKEN}` },
    payload,
  });
  return { status: response.statusCode, body: response.json() as any };
}

async function energia(h: Harness): Promise<number> {
  const response = await h.app.inject({
    method: 'GET',
    url: '/me/economy',
    headers: { 'x-platform-ticket': `dev:${TOKEN}` },
  });
  return response.json().energy.stored;
}

// M36 2/N (D47) — a reconexão SOBREVIVE à batalha viva, e muda de natureza no caminho.
//
// O modo de falha que o M22 fechou era: o jogador manda a run, o servidor debita a energia e
// resolve a batalha, e a conexão cai antes de a resposta chegar. A defesa era guardar a
// RESPOSTA por nonce e devolvê-la no reenvio.
//
// Com a batalha viva não existe mais "a run": o estado mora no servidor e é DERIVADO de
// `setup + seed + commands` a cada requisição. Cair no meio deixou de ser um problema de
// idempotência e virou uma leitura — `GET /matches/current` devolve exatamente o ponto em que
// se parou. A garantia ficou mais forte, não mais fraca: antes ela valia para a submissão
// inteira, agora vale comando a comando.
//
// O hook de `idempotency.ts` continua existindo e continua indispensável, para as rotas que
// ainda são um disparo só e cobram caro — `POST /summon` na frente delas. Estes testes é que
// mudaram de sujeito.

async function abrirMasmorra(h: Harness) {
  const heroIds = [heroiDoCapitulo().id];
  const abertura = await post(h, `/dungeons/${MASMORRA}/matches`, { heroIds, rulesVersion: RULES_VERSION });
  expect(abertura.status, JSON.stringify(abertura.body)).toBe(201);
  return abertura;
}

describe('a conexão cai no meio da batalha', () => {
  it('voltar devolve a MESMA partida, no mesmo ponto — nem perdida, nem repetida', async () => {
    const h = buildHarness();
    const abertura = await abrirMasmorra(h);
    const nonce = abertura.body.nonce as string;
    const minha = (abertura.body.visivel.units as { unitId: string; side: string }[]).find(
      (u) => u.side === 'player',
    )!;

    const jogado = await post(h, `/matches/${nonce}/commands`, { command: { t: 'wait', unitId: minha.unitId } });
    expect(jogado.status, JSON.stringify(jogado.body)).toBe(200);

    // O cliente some e volta. Ele não precisa ter guardado nada em disco: quem sabe é o servidor.
    const voltando = await h.app.inject({
      method: 'GET',
      url: '/matches/current',
      headers: { 'x-platform-ticket': `dev:${TOKEN}` },
    });

    expect(voltando.statusCode).toBe(200);
    expect(voltando.json().nonce).toBe(nonce);
    expect(voltando.json().visivel).toEqual(jogado.body.visivel);
  });

  it('e não cobra a energia duas vezes: reconectar LÊ, nunca abre', async () => {
    const h = buildHarness();
    const antes = await energia(h);

    await abrirMasmorra(h);
    const depoisDeAbrir = await energia(h);

    // Três reconexões seguidas: a leitura é pura.
    for (let i = 0; i < 3; i += 1) {
      const r = await h.app.inject({
        method: 'GET',
        url: '/matches/current',
        headers: { 'x-platform-ticket': `dev:${TOKEN}` },
      });
      expect(r.statusCode).toBe(200);
    }

    expect(depoisDeAbrir).toBeLessThan(antes);
    expect(await energia(h)).toBe(depoisDeAbrir);
  });

  it('e uma abertura repetida não abre uma segunda partida nem cobra de novo', async () => {
    // O cliente que não soube que a primeira abertura chegou tenta de novo. A resposta é o
    // nonce da partida que já existe — que é o que ele precisava — e nada é cobrado.
    const h = buildHarness();
    const primeira = await abrirMasmorra(h);
    const depoisDaPrimeira = await energia(h);

    const repetida = await post(h, `/dungeons/${MASMORRA}/matches`, {
      heroIds: [heroiDoCapitulo().id],
      rulesVersion: RULES_VERSION,
    });

    expect(repetida.status).toBe(409);
    expect(repetida.body.nonce).toBe(primeira.body.nonce);
    expect(await energia(h)).toBe(depoisDaPrimeira);
  });

  it('o capítulo não paga a primeira completude duas vezes', async () => {
    const h = buildHarness();
    const heroIds = [heroiDoCapitulo().id];

    const abertura = await post(h, `/campaign/${CAPITULO}/matches`, { heroIds, rulesVersion: RULES_VERSION });
    expect(abertura.status).toBe(201);

    const enviar = async (rota: string, corpo: unknown) => {
      const r = await post(h, rota, corpo as Record<string, unknown>);
      return { status: r.status, body: r.body as Record<string, unknown> };
    };
    const jogada = await jogarPartidaViva(
      enviar,
      abertura.body.nonce as string,
      abertura.body.visivel as EstadoVisivelDeTeste,
    );

    const premiumDepois = (await h.playerRepository.getPlayerById('player-1'))!.premium;

    // Mandar comando de novo na partida fechada é o reenvio do cliente que caiu: 409, e a
    // carteira não se mexe. A completude é paga no comando que fecha, uma vez só.
    const reenvio = await post(h, `/matches/${abertura.body.nonce}/commands`, {
      command: { t: 'wait', unitId: 'seja-quem-for' },
    });
    expect(reenvio.status).toBe(409);
    expect((await h.playerRepository.getPlayerById('player-1'))!.premium).toBe(premiumDepois);
    expect(jogada.outcome).not.toBe('ongoing');
  });
});

describe('a idempotência continua valendo para o que é um disparo só', () => {
  it('a invocação reenviada devolve os MESMOS personagens', async () => {
    // O caso mais caro do jogo: `POST /summon` gasta a moeda comprável com dinheiro real. Sem
    // a resposta guardada, o reenvio levava 409 e o jogador não via o que puxou — aparecia no
    // roster depois, sem a rolagem.
    const h = buildHarness();
    const banner = Object.values(catalog.banners)[0]!;
    const corpo = { nonce: 'nonce-summon-1', bannerId: banner.id, count: 1 };

    const primeira = await post(h, '/summon', corpo);
    expect(primeira.status).toBe(200);

    const reenvio = await post(h, '/summon', corpo);

    expect(reenvio.status).toBe(200);
    expect(reenvio.body).toEqual(primeira.body);
    // E a moeda foi debitada uma vez só.
    const player = await h.playerRepository.getPlayerById('player-1');
    expect(player!.premium).toBe(primeira.body.premium);
  });

  it('o mesmo nonce em OUTRA rota é recusado — repetir resposta trocada é pior que recusar', async () => {
    const h = buildHarness();
    const banner = Object.values(catalog.banners)[0]!;
    const nonce = 'nonce-compartilhado-1';

    const primeira = await post(h, '/summon', { nonce, bannerId: banner.id, count: 1 });
    expect(primeira.status).toBe(200);

    const trocada = await post(h, '/energy/purchase', { nonce, packId: 'seja-qual-for' });

    expect(trocada.status).toBe(409);
    expect(trocada.body.error).toContain('outra rota');
  });

  it('resposta de ERRO não é guardada — recusa precisa poder ser tentada de novo', async () => {
    // Moeda insuficiente, limite de requisições, versão de regras: as três se resolvem com o
    // tempo ou com uma ação do jogador. Congelar a recusa naquele nonce transformaria um
    // problema temporário em permanente.
    const h = buildHarness();
    const banner = Object.values(catalog.banners)[0]!;
    const nonce = 'nonce-recusa-1';

    // Sem moeda: zera a carteira e a invocação é recusada.
    await h.playerRepository.updatePremium('player-1', 0);
    const recusada = await post(h, '/summon', { nonce, bannerId: banner.id, count: 1 });
    expect(recusada.status).toBeGreaterThanOrEqual(400);

    // Com moeda, o MESMO nonce passa: a recusa não ficou guardada.
    await h.playerRepository.updatePremium('player-1', 5_000);
    const boa = await post(h, '/summon', { nonce, bannerId: banner.id, count: 1 });

    expect(boa.status).toBe(200);
  });

  it('sem repositório de idempotência, o servidor se comporta como antes', async () => {
    // A dependência é opcional de propósito (o `devServer` e testes antigos montam o app sem
    // ela). O que não pode acontecer é o app deixar de subir.
    const h = buildHarness();
    const semArmazem = buildApp({
      repository: createMemoryPlayerRepository([]),
      heroRepository: createMemoryHeroRepository([]),
      arenaDefenseRepository: createMemoryArenaDefenseRepository(),
      partyPresetRepository: createMemoryPartyPresetRepository(),
      replayRepository: createMemoryReplayRepository(),
      matchRepository: createMemoryMatchRepository(),
      seasonRepository: createMemorySeasonRepository(),
      economyRepository: createMemoryEconomyRepository(),
      ownershipRepository: createMemoryCharacterOwnershipRepository(),
      rewardsRepository: createMemoryRewardsRepository(),
      catalog,
      shopCatalog: {},
      rateLimiter: createInMemoryRateLimiter({ maxRequests: 10, windowMs: 60_000 }),
      ticketSecret: TICKET_SECRET,
      identityValidator: createDevIdentityValidator(),
      now: () => AGORA,
    });

    const resposta = await semArmazem.inject({ method: 'GET', url: '/health' });

    expect(resposta.statusCode).toBe(200);
    expect(await energia(h)).toBeGreaterThan(0);
  });
});
