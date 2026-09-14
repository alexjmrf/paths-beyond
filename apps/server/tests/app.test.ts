import { DEFAULT_PVE_ACCOUNT } from '../src/repository/types.js';
import type { ContentCatalog } from '@paths-beyond/content';
import { describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { createDevIdentityValidator } from '../src/identity/devIdentity.js';
import { createInMemoryRateLimiter } from '../src/battle/rateLimit.js';
import {
  createMemoryArenaDefenseRepository,
  createMemoryPartyPresetRepository,
  createMemoryHeroRepository,
  createMemoryPlayerRepository,
  createMemoryReplayRepository,
  createMemoryRewardsRepository,
  createMemorySeasonRepository,
  createMemoryCharacterOwnershipRepository,
  createMemoryEconomyRepository,
} from '../src/repository/memoryRepository.js';

// Segredo fixo do HMAC que deriva a seed do nonce (M13, sub-sessão 2/N): teste precisa
// de seed reprodutível.
const TICKET_SECRET = 'segredo-de-teste';

const emptyCatalog: ContentCatalog = {
  classes: {},
  // §8.1 (M17, 2/N) — o elenco entrou no catálogo. Vazio aqui de propósito: os heróis
  // destes fixtures não declaram `characterId`, e árvore vazia é o que o servidor
  // resolve para eles.
  characters: {},
  characterTalentTrees: {},
  // §8.1 (M17, 3/N) — vazio: nenhum destes fixtures monta encontro de campanha ou masmorra.
  enemies: {},
  skills: {},
  items: {},
  itemSets: {},
  effects: {},
  valorSkills: {},
  summonBlueprints: {},
  weaponDuelRanges: { sword: 1, axe: 1, spear: 1, bow: 2, arcane: 2, nature: 2, holy: 2 },
  maps: {},
  comps: [],
  chapters: [],
  encounters: [],
  dungeons: {},
  dungeonEncounters: {},
  materials: {},
  economyRules: { energy: { max: 0, refillIntervalMs: 1 }, awakening: [], imprint: [], enhance: [] },
  substatWeights: [],
  mainstatWeights: [],
  enhanceRates: { toThree: 0, toSix: 0, toNine: 0, toTwelve: 0, toFifteen: 0 },
  // M18 2/N — vazio de propósito: nenhuma destas suítes exercita aquisição, e declarar
  // aqui é o que o tipo obrigatório de `ContentCatalog` cobra (esquecer vira erro de tipo).
  banners: {},
  premiumRules: {
    summon: { premiumCost: 500, pityThreshold: 10 },
    energyPurchase: { premiumCost: 100, energy: 60 },
    premiumRewards: { missionFirstClear: 60, chapterFirstClear: 600, dungeonFirstClear: 200 },
  },
  achievements: {},
  events: {},
  baselineReactionSkillIds: [],
};

function buildTestApp() {
  const repository = createMemoryPlayerRepository([
    { id: 'player-1', platformProvider: 'dev' as const, platformId: 'valid-token', displayName: 'Vanguard', elo: 1200, arenaMarks: 0, ...DEFAULT_PVE_ACCOUNT },
  ]);
  return buildApp({
    economyRepository: createMemoryEconomyRepository(),
    ownershipRepository: createMemoryCharacterOwnershipRepository(),
    rewardsRepository: createMemoryRewardsRepository(),
    repository,
    heroRepository: createMemoryHeroRepository(),
    arenaDefenseRepository: createMemoryArenaDefenseRepository(),
    partyPresetRepository: createMemoryPartyPresetRepository(),
    replayRepository: createMemoryReplayRepository(),
    seasonRepository: createMemorySeasonRepository(),
    catalog: emptyCatalog,
    shopCatalog: {},
    ticketSecret: TICKET_SECRET,
    identityValidator: createDevIdentityValidator(),
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
      headers: { 'x-platform-ticket': 'dev:does-not-exist'},
    });

    expect(response.statusCode).toBe(401);
  });

  it('returns the player for a known token', async () => {
    const app = buildTestApp();

    const response = await app.inject({
      method: 'GET',
      url: '/me',
      headers: { 'x-platform-ticket': 'dev:valid-token'},
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      id: 'player-1',
      platformProvider: 'dev' as const,
      platformId: 'valid-token',
      displayName: 'Vanguard',
      elo: 1200,
      arenaMarks: 0, ...DEFAULT_PVE_ACCOUNT, ...DEFAULT_PVE_ACCOUNT,
    });
  });
});
