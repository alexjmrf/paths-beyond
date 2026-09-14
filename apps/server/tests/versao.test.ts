import { loadCatalogFromDisk } from '@paths-beyond/content';
import { RULES_VERSION, RULES_VERSION_MISMATCH_CODE, resolveAutoBattle, type Hero } from '@paths-beyond/core';
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
  createMemoryPlayerRepository,
  createMemoryReplayRepository,
  createMemoryRewardsRepository,
  createMemorySeasonRepository,
} from '../src/repository/memoryRepository.js';
import { DEFAULT_PVE_ACCOUNT } from '../src/repository/types.js';

// §3.3/§9.4 (M22, sub-sessão 1/N) — a VERSÃO DE REGRAS nas três rotas que reexecutam
// comandos do cliente.
//
// `POST /battles` recusa versão diferente desde o M7. As outras duas nasceram sem a
// checagem: `/dungeons/:id/run` (buraco registrado no M17 5/N) e `/campaign/:id/run` (que
// nasceu no M18 4/N, depois de o roadmap do M22 ser escrito). As três reexecutam comandos
// contra o motor DESTE servidor — se o cliente jogou com outra versão de regras, o replay
// não descreve a mesma partida, e o desfecho passa a depender de qual motor rodou.
//
// O que este arquivo trava, além da recusa: **o corpo do erro é legível por máquina.** Um
// 409 com frase solta obriga o cliente a adivinhar pela mensagem, e a tela que manda
// atualizar para de aparecer no dia em que alguém melhora a redação.

const TICKET_SECRET = 'segredo-de-teste';
const TOKEN = 'token-versao';
const AGORA = Date.UTC(2026, 5, 1);
const CAPITULO = 'encounter-campanha-1';

const catalog = loadCatalogFromDisk();

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
      energy: { stored: catalog.economyRules.energy.max, asOfMs: AGORA },
    },
  ]);

  return buildApp({
    repository: playerRepository,
    heroRepository: createMemoryHeroRepository([{ ownerPlayerId: 'player-1', hero, equippedItems: [] }]),
    arenaDefenseRepository: createMemoryArenaDefenseRepository(),
    partyPresetRepository: createMemoryPartyPresetRepository(),
    replayRepository: createMemoryReplayRepository(),
    seasonRepository: createMemorySeasonRepository(),
    economyRepository: createMemoryEconomyRepository(),
    ownershipRepository: createMemoryCharacterOwnershipRepository(),
    rewardsRepository: createMemoryRewardsRepository(),
    catalog,
    shopCatalog: {},
    rateLimiter: createInMemoryRateLimiter({ maxRequests: 1000, windowMs: 60_000 }),
    ticketSecret: TICKET_SECRET,
    identityValidator: createDevIdentityValidator(),
    now: () => AGORA,
  });
}

async function post(app: ReturnType<typeof buildApp>, url: string, payload: Record<string, unknown> = {}) {
  const response = await app.inject({
    method: 'POST',
    url,
    headers: { 'x-platform-ticket': `dev:${TOKEN}` },
    payload,
  });
  return { status: response.statusCode, body: response.json() as any };
}

// Uma masmorra que o time inicial vence, e um capítulo idem: as rotas precisam CHEGAR ao
// ponto de recusar por versão, e não morrer antes por outro motivo.
const MASMORRA = Object.values(catalog.dungeons).find((d) => !d.manualOnly && !d.requiresClearOf)!.id;

describe('a versão de regras nas rotas que reexecutam comandos', () => {
  it('`POST /battles` recusa versão diferente com corpo LEGÍVEL POR MÁQUINA', async () => {
    const app = buildHarness();
    const { status, body } = await post(app, '/battles', {
      attackerHeroIds: [heroiDoCapitulo().id],
      defenderPlayerId: 'player-1',
      commands: [],
      rulesVersion: '0.18.0',
      nonce: 'nonce-versao-1',
    });

    expect(status).toBe(409);
    // A frase continua, para log e para humano; o que é novo é o resto.
    expect(body.error).toContain('rulesVersion');
    expect(body.code).toBe(RULES_VERSION_MISMATCH_CODE);
    expect(body.reason).toBe('different');
    expect(body.expected).toBe(RULES_VERSION);
    expect(body.received).toBe('0.18.0');
  });

  it('`POST /dungeons/:id/run` passa a validar a versão — o buraco do M17 5/N', async () => {
    const app = buildHarness();
    const heroIds = [heroiDoCapitulo().id];
    const ticket = await post(app, `/dungeons/${MASMORRA}/ticket`, { heroIds });
    expect(ticket.status).toBe(200);

    const { status, body } = await post(app, `/dungeons/${MASMORRA}/run`, {
      nonce: ticket.body.nonce,
      heroIds,
      commands: [],
      rulesVersion: '0.18.0',
    });

    expect(status).toBe(409);
    expect(body.code).toBe(RULES_VERSION_MISMATCH_CODE);
  });

  it('`POST /campaign/:id/run` idem — o mesmo buraco, nascido depois do roadmap', async () => {
    const app = buildHarness();
    const heroIds = [heroiDoCapitulo().id];
    const ticket = await post(app, `/campaign/${CAPITULO}/ticket`, { heroIds });
    expect(ticket.status).toBe(200);

    const { status, body } = await post(app, `/campaign/${CAPITULO}/run`, {
      nonce: ticket.body.nonce,
      heroIds,
      commands: [],
      rulesVersion: '0.18.0',
    });

    expect(status).toBe(409);
    expect(body.code).toBe(RULES_VERSION_MISMATCH_CODE);
  });

  it('a versão AUSENTE é recusada, e o motivo a distingue de "mandou outra"', async () => {
    // Um cliente que não manda a versão é um cliente anterior à checagem. A tela diz coisas
    // diferentes nos dois casos, e por isso o servidor não os confunde.
    const app = buildHarness();
    const heroIds = [heroiDoCapitulo().id];
    const ticket = await post(app, `/dungeons/${MASMORRA}/ticket`, { heroIds });

    const { status, body } = await post(app, `/dungeons/${MASMORRA}/run`, {
      nonce: ticket.body.nonce,
      heroIds,
      commands: [],
    });

    expect(status).toBe(409);
    expect(body.reason).toBe('missing');
    expect(body.received).toBeNull();
  });

  it('a recusa por versão vem ANTES de qualquer cobrança — energia intacta', async () => {
    // O ponto da ordem: um cliente velho não pode pagar pela partida que ele não vai jogar.
    const app = buildHarness();
    const heroIds = [heroiDoCapitulo().id];
    const antes = await app.inject({
      method: 'GET',
      url: '/me/economy',
      headers: { 'x-platform-ticket': `dev:${TOKEN}` },
    });

    const ticket = await post(app, `/dungeons/${MASMORRA}/ticket`, { heroIds });
    await post(app, `/dungeons/${MASMORRA}/run`, {
      nonce: ticket.body.nonce,
      heroIds,
      commands: [],
      rulesVersion: '0.18.0',
    });

    const depois = await app.inject({
      method: 'GET',
      url: '/me/economy',
      headers: { 'x-platform-ticket': `dev:${TOKEN}` },
    });

    expect(depois.json().energy.stored).toBe(antes.json().energy.stored);
  });

  it('a versão CERTA continua passando — a rota resolve a batalha em vez de recusar', async () => {
    const app = buildHarness();
    const heroIds = [heroiDoCapitulo().id];
    const ticket = await post(app, `/dungeons/${MASMORRA}/ticket`, { heroIds });
    const jogada = resolveAutoBattle({ setup: ticket.body.setup, seed: ticket.body.seed });

    const { status, body } = await post(app, `/dungeons/${MASMORRA}/run`, {
      nonce: ticket.body.nonce,
      heroIds,
      commands: jogada.commands,
      rulesVersion: RULES_VERSION,
    });

    expect(status).toBe(200);
    // Ganhar ou perder é questão de balanceamento (um herói de capítulo 1 numa masmorra),
    // e não é o que este teste mede: o que ele mede é que a requisição foi SIMULADA em vez
    // de recusada — a rota devolveu desfecho, não 409.
    expect(['victory', 'defeat']).toContain(body.outcome);
  });

  it('o ticket entrega a versão que a submissão precisa devolver', async () => {
    // O laço fecha: quem pede o ticket recebe a versão do servidor e a repete na submissão.
    // Se ela mudou entre uma coisa e outra, o servidor recusa — e é isso que se quer.
    const app = buildHarness();
    const heroIds = [heroiDoCapitulo().id];

    const masmorra = await post(app, `/dungeons/${MASMORRA}/ticket`, { heroIds });
    const capitulo = await post(app, `/campaign/${CAPITULO}/ticket`, { heroIds });

    expect(masmorra.body.rulesVersion).toBe(RULES_VERSION);
    expect(capitulo.body.rulesVersion).toBe(RULES_VERSION);
  });
});
