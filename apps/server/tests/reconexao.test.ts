import { loadCatalogFromDisk } from '@paths-beyond/content';
import { RULES_VERSION, resolveAutoBattle, type Hero } from '@paths-beyond/core';
import { describe, expect, it } from 'vitest';
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

// Uma run de masmorra jogada como um cliente joga: pede ticket, resolve, submete.
async function rodarMasmorra(h: Harness) {
  const heroIds = [heroiDoCapitulo().id];
  const ticket = await post(h, `/dungeons/${MASMORRA}/ticket`, { heroIds });
  const jogada = resolveAutoBattle({ setup: ticket.body.setup, seed: ticket.body.seed });
  const corpo = { nonce: ticket.body.nonce, heroIds, commands: jogada.commands, rulesVersion: RULES_VERSION };

  return { corpo, primeira: await post(h, `/dungeons/${MASMORRA}/run`, corpo) };
}

describe('a conexão cai no meio da run', () => {
  it('reenviar o MESMO nonce devolve a mesma resposta, e não um 409', async () => {
    const h = buildHarness();
    const { corpo, primeira } = await rodarMasmorra(h);
    expect(primeira.status).toBe(200);

    // O cliente não soube que a primeira chegou, então reenviou exatamente o mesmo corpo.
    const reenvio = await post(h, `/dungeons/${MASMORRA}/run`, corpo);

    expect(reenvio.status).toBe(200);
    // Byte a byte a mesma coisa: os itens que caíram, o ouro, o desfecho. Uma segunda
    // rolagem daria OUTRO loot para a mesma energia gasta.
    expect(reenvio.body).toEqual(primeira.body);
  });

  it('e não cobra a energia duas vezes', async () => {
    const h = buildHarness();
    const antes = await energia(h);
    const { corpo } = await rodarMasmorra(h);
    const depoisDaPrimeira = await energia(h);

    await post(h, `/dungeons/${MASMORRA}/run`, corpo);
    await post(h, `/dungeons/${MASMORRA}/run`, corpo);

    expect(depoisDaPrimeira).toBeLessThan(antes);
    expect(await energia(h)).toBe(depoisDaPrimeira);
  });

  it('a invocação reenviada devolve os MESMOS personagens', async () => {
    // O caso mais caro do jogo: `POST /summon` gasta a moeda comprável com dinheiro real.
    // Sem a resposta guardada, o reenvio levava 409 e o jogador não via o que puxou —
    // aparecia no roster depois, sem a rolagem.
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

  it('o capítulo reenviado não paga a primeira completude duas vezes', async () => {
    const h = buildHarness();
    const heroIds = [heroiDoCapitulo().id];
    const ticket = await post(h, `/campaign/${CAPITULO}/ticket`, { heroIds });
    const jogada = resolveAutoBattle({ setup: ticket.body.setup, seed: ticket.body.seed });
    const corpo = { nonce: ticket.body.nonce, heroIds, commands: jogada.commands, rulesVersion: RULES_VERSION };

    const primeira = await post(h, `/campaign/${CAPITULO}/run`, corpo);
    const reenvio = await post(h, `/campaign/${CAPITULO}/run`, corpo);

    expect(reenvio.body).toEqual(primeira.body);
    const player = await h.playerRepository.getPlayerById('player-1');
    expect(player!.premium).toBe(primeira.body.premium);
  });

  it('o mesmo nonce em OUTRA rota é recusado — repetir resposta trocada é pior que recusar', async () => {
    const h = buildHarness();
    const { corpo } = await rodarMasmorra(h);

    const banner = Object.values(catalog.banners)[0]!;
    const trocada = await post(h, '/summon', { nonce: corpo.nonce, bannerId: banner.id, count: 1 });

    expect(trocada.status).toBe(409);
    expect(trocada.body.error).toContain('outra rota');
  });

  it('resposta de ERRO não é guardada — recusa precisa poder ser tentada de novo', async () => {
    // Energia insuficiente, limite de requisições, versão de regras: as três se resolvem com
    // o tempo ou com uma ação do jogador. Congelar a recusa naquele nonce transformaria um
    // problema temporário em permanente.
    const h = buildHarness();
    const heroIds = [heroiDoCapitulo().id];
    const ticket = await post(h, `/dungeons/${MASMORRA}/ticket`, { heroIds });
    const corpo = { nonce: ticket.body.nonce, heroIds, commands: [], rulesVersion: 'versao-errada' };

    const recusada = await post(h, `/dungeons/${MASMORRA}/run`, corpo);
    expect(recusada.status).toBe(409);

    // Mesmo nonce, agora com a versão certa: passa, porque a recusa não ficou guardada.
    const jogada = resolveAutoBattle({ setup: ticket.body.setup, seed: ticket.body.seed });
    const boa = await post(h, `/dungeons/${MASMORRA}/run`, {
      ...corpo,
      commands: jogada.commands,
      rulesVersion: RULES_VERSION,
    });

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
