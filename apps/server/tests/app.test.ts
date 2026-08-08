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
} from '../src/repository/memoryRepository.js';

const emptyCatalog: ContentCatalog = {
  classes: {},
  skills: {},
  items: {},
  itemSets: {},
  effects: {},
  weaponDuelRanges: { sword: 1, axe: 1, spear: 1, bow: 2, arcane: 2, nature: 2, holy: 2 },
  maps: {},
  comps: [],
  baselineReactionSkillIds: [],
};

function buildTestApp() {
  const repository = createMemoryPlayerRepository([
    { id: 'player-1', token: 'valid-token', displayName: 'Vanguard', elo: 1200, arenaMarks: 0 },
  ]);
  return buildApp({
    repository,
    heroRepository: createMemoryHeroRepository(),
    arenaDefenseRepository: createMemoryArenaDefenseRepository(),
    replayRepository: createMemoryReplayRepository(),
    seasonRepository: createMemorySeasonRepository(),
    catalog: emptyCatalog,
    shopCatalog: {},
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
      arenaMarks: 0,
    });
  });
});
