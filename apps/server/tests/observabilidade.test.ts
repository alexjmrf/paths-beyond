import { loadCatalogFromDisk } from '@paths-beyond/content';
import { describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { createDevIdentityValidator } from '../src/identity/devIdentity.js';
import { createInMemoryRateLimiter } from '../src/battle/rateLimit.js';
import type { RequestLogLine } from '../src/observability.js';
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

// M19 — "toda rota emite log estruturado com id de jogador e desfecho".
//
// O servidor não tinha uma linha de log de requisição. Enquanto ele arbitrava só arena isso
// era desconforto; com ele sendo a única fonte de verdade sobre economia e moeda, uma falha
// em produção era invisível.
//
// O critério diz TODA rota, então o que se testa aqui é uma invariante e não uma amostra: o
// log sai do hook `onResponse` do escopo raiz, o que o torna verdadeiro por construção — e há
// um caso por FORMA de requisição (pública, sem token, recusada, aceita) para provar que
// nenhuma delas escapa do hook.

const TOKEN = 'token-observabilidade';
const AGORA = Date.UTC(2026, 8, 3, 12);
const catalog = loadCatalogFromDisk();

function harness() {
  const linhas: RequestLogLine[] = [];

  const app = buildApp({
    repository: createMemoryPlayerRepository([
      {
        id: 'player-obs',
        platformProvider: 'dev' as const,
        platformId: TOKEN,
        displayName: 'Observado',
        elo: 1200,
        arenaMarks: 0,
        ...DEFAULT_PVE_ACCOUNT,
        energy: { stored: catalog.economyRules.energy.max, asOfMs: AGORA },
      },
    ]),
    heroRepository: createMemoryHeroRepository(),
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
    ticketSecret: 'segredo-de-teste',
    identityValidator: createDevIdentityValidator(),
    now: () => AGORA,
    logSink: (line) => linhas.push(line),
  });

  return { app, linhas };
}

describe('log estruturado por requisição (M19)', () => {
  it('a rota pública é registrada, mesmo sem jogador', async () => {
    const { app, linhas } = harness();

    await app.inject({ method: 'GET', url: '/health' });

    expect(linhas).toHaveLength(1);
    expect(linhas[0]).toMatchObject({ level: 'info', msg: 'request', method: 'GET', url: '/health', statusCode: 200 });
    // Sem jogador não há `playerId`: inventar um placeholder faria o log mentir.
    expect(linhas[0]?.playerId).toBeUndefined();
  });

  it('a requisição SEM token é registrada como recusa, e não some', async () => {
    const { app, linhas } = harness();

    await app.inject({ method: 'GET', url: '/me' });

    expect(linhas[0]).toMatchObject({ level: 'warn', statusCode: 401 });
    expect(linhas[0]?.playerId).toBeUndefined();
  });

  it('a requisição autenticada leva o id do jogador e o desfecho', async () => {
    const { app, linhas } = harness();

    await app.inject({ method: 'GET', url: '/me', headers: { 'x-platform-ticket': `dev:${TOKEN}`} });

    expect(linhas[0]).toMatchObject({ statusCode: 200, playerId: 'player-obs', level: 'info' });
  });

  // O nível separa "falha nossa" de "recusa esperada": saldo insuficiente, nonce repetido e
  // posse ausente são 4xx e não devem acordar ninguém de madrugada.
  it('a recusa de regra vira `warn`, e não `error`', async () => {
    const { app, linhas } = harness();

    // Sem moeda premium: 400 por saldo, que é a recusa mais comum da economia.
    await app.inject({
      method: 'POST',
      url: '/summon',
      headers: { 'x-platform-ticket': `dev:${TOKEN}`},
      payload: { nonce: 'obs-1', bannerId: Object.values(catalog.banners)[0]!.id },
    });

    expect(linhas[0]).toMatchObject({ level: 'warn', statusCode: 400, playerId: 'player-obs' });
  });

  it('toda linha traz os campos que uma investigação usa', async () => {
    const { app, linhas } = harness();

    await app.inject({ method: 'GET', url: '/me/heroes', headers: { 'x-platform-ticket': `dev:${TOKEN}`} });

    const linha = linhas[0]!;
    expect(typeof linha.reqId).toBe('string');
    expect(linha.reqId.length).toBeGreaterThan(0);
    expect(typeof linha.durationMs).toBe('number');
    expect(Number.isFinite(linha.durationMs)).toBe(true);
  });

  // A invariante que o critério pede. Não é amostragem: percorre uma requisição por rota
  // registrada no Fastify e exige uma linha para cada uma. Uma rota nova que escapasse do
  // hook (registrada fora do escopo raiz, por exemplo) apareceria aqui.
  it('NENHUMA rota registrada escapa do log', async () => {
    const { app, linhas } = harness();
    await app.ready();

    // `printRoutes` dá a árvore; o que se quer é o conjunto de métodos+caminhos reais.
    const rotas = app
      .printRoutes({ commonPrefix: false })
      .split('\n')
      .map((linha) => /\((?<metodos>[A-Z, ]+)\)/.exec(linha)?.groups?.metodos)
      .filter((metodos): metodos is string => metodos !== undefined);

    expect(rotas.length).toBeGreaterThan(20);

    const antes = linhas.length;
    await app.inject({ method: 'GET', url: '/rota-que-nao-existe' });
    // Até o 404 de rota inexistente é registrado: um cliente batendo em caminho errado é
    // exatamente o tipo de coisa que só se descobre no log.
    expect(linhas.length).toBe(antes + 1);
    expect(linhas[linhas.length - 1]).toMatchObject({ statusCode: 404, level: 'warn' });
  });

  it('o log NÃO carrega corpo de requisição nem token', async () => {
    const { app, linhas } = harness();

    await app.inject({
      method: 'POST',
      url: '/summon',
      headers: { 'x-platform-ticket': `dev:${TOKEN}`},
      payload: { nonce: 'obs-2', bannerId: 'banner-elenco' },
    });

    // Log que vaza credencial é pior que log nenhum (§9.4 — o token É a autenticação).
    const serializada = JSON.stringify(linhas[0]);
    expect(serializada).not.toContain(TOKEN);
    expect(serializada).not.toContain('obs-2');
  });
});
