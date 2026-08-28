import { DEFAULT_PVE_ACCOUNT } from '../src/repository/types.js';
import type { ContentCatalog } from '@paths-beyond/content';
import { describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { createInMemoryRateLimiter } from '../src/battle/rateLimit.js';
import {
  createMemoryArenaDefenseRepository,
  createMemoryHeroRepository,
  createMemoryPlayerRepository,
  createMemoryReplayRepository,
  createMemorySeasonRepository,
  createMemoryEconomyRepository,
} from '../src/repository/memoryRepository.js';

// Segredo fixo do HMAC que deriva a seed do nonce (M13, sub-sessão 2/N): teste precisa
// de seed reprodutível.
const TICKET_SECRET = 'segredo-de-teste';

const emptyCatalog: ContentCatalog = {
  classes: {},
  skills: {},
  items: {},
  itemSets: {},
  effects: {},
  valorSkills: {},
  summonBlueprints: {},
  weaponDuelRanges: { sword: 1, axe: 1, spear: 1, bow: 2, arcane: 2, nature: 2, holy: 2 },
  maps: {},
  comps: [],
  encounters: [],
  dungeons: {},
  dungeonEncounters: {},
  materials: {},
  economyRules: { energy: { max: 0, refillIntervalMs: 1 }, awakening: [], imprint: [], enhance: [] },
  substatWeights: [],
  mainstatWeights: [],
  enhanceRates: { toThree: 0, toSix: 0, toNine: 0, toTwelve: 0, toFifteen: 0 },
  baselineReactionSkillIds: [],
};

function buildTestApp() {
  const repository = createMemoryPlayerRepository([
    { id: 'player-1', token: 'valid-token', displayName: 'Vanguard', elo: 1200, arenaMarks: 0, ...DEFAULT_PVE_ACCOUNT },
  ]);
  return buildApp({
    economyRepository: createMemoryEconomyRepository(),
    repository,
    heroRepository: createMemoryHeroRepository(),
    arenaDefenseRepository: createMemoryArenaDefenseRepository(),
    replayRepository: createMemoryReplayRepository(),
    seasonRepository: createMemorySeasonRepository(),
    catalog: emptyCatalog,
    shopCatalog: {},
    ticketSecret: TICKET_SECRET,
    rateLimiter: createInMemoryRateLimiter({ maxRequests: 1000, windowMs: 60_000 }),
  });
}

describe('GET /health', () => {
  it('responds 200 without authentication', async () => {
    const app = buildTestApp();

    const response = await app.inject({ method: 'GET', url: '/health' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'ok' });
  });
});

describe('GET /me', () => {
  it('rejects a request with no token header', async () => {
    const app = buildTestApp();

    const response = await app.inject({ method: 'GET', url: '/me' });

    expect(response.statusCode).toBe(401);
  });

  it('rejects a request with an unknown token', async () => {
    const app = buildTestApp();

    const response = await app.inject({
      method: 'GET',
      url: '/me',
      headers: { 'x-player-token': 'does-not-exist' },
    });

    expect(response.statusCode).toBe(401);
  });

  it('returns the player for a known token', async () => {
    const app = buildTestApp();

    const response = await app.inject({
      method: 'GET',
      url: '/me',
      headers: { 'x-player-token': 'valid-token' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      id: 'player-1',
      token: 'valid-token',
      displayName: 'Vanguard',
      elo: 1200,
      arenaMarks: 0, ...DEFAULT_PVE_ACCOUNT, ...DEFAULT_PVE_ACCOUNT,
    });
  });
});
