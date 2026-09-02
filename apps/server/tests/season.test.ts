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
import { DEFAULT_ELO, type Player, type Season } from '../src/repository/types.js';
import { ensureCurrentSeason } from '../src/season/lifecycle.js';
import { DEFAULT_PVE_ACCOUNT } from '../src/repository/types.js';

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
  },
  baselineReactionSkillIds: [],
};

const FOURTEEN_DAYS_MS = 14 * 24 * 60 * 60 * 1000;

describe('ensureCurrentSeason', () => {
  it('sem temporada nenhuma, cria a #1 sem tocar ELO de ninguém', async () => {
    const seasonRepository = createMemorySeasonRepository();
    const playerRepository = createMemoryPlayerRepository([
      { id: 'player-1', token: 't1', displayName: 'Um', elo: 1600, arenaMarks: 0, ...DEFAULT_PVE_ACCOUNT },
    ]);
    const now = 1_000_000;

    const season = await ensureCurrentSeason({ seasonRepository, playerRepository, now: () => now });

    expect(season.seasonNumber).toBe(1);
    expect(new Date(season.startedAt).getTime()).toBe(now);
    expect(new Date(season.endsAt).getTime()).toBe(now + FOURTEEN_DAYS_MS);
    expect((await playerRepository.getPlayerById('player-1'))?.elo).toBe(1600);
  });

  it('com a temporada atual ainda válida, não cria nada nem toca ELO', async () => {
    const existing: Season = { id: 's1', seasonNumber: 1, startedAt: '2026-01-01T00:00:00.000Z', endsAt: '2026-01-15T00:00:00.000Z' };
    const seasonRepository = createMemorySeasonRepository([existing]);
    const playerRepository = createMemoryPlayerRepository([{ id: 'player-1', token: 't1', displayName: 'Um', elo: 1600, arenaMarks: 0, ...DEFAULT_PVE_ACCOUNT }]);
    const stillWithinWindow = new Date('2026-01-10T00:00:00.000Z').getTime();

    const season = await ensureCurrentSeason({ seasonRepository, playerRepository, now: () => stillWithinWindow });

    expect(season).toEqual(existing);
    expect((await playerRepository.getPlayerById('player-1'))?.elo).toBe(1600);
  });

  it('com a temporada atual expirada, cria a próxima e regride ELO de todo jogador 50% na direção de 1200', async () => {
    const existing: Season = { id: 's1', seasonNumber: 1, startedAt: '2026-01-01T00:00:00.000Z', endsAt: '2026-01-15T00:00:00.000Z' };
    const seasonRepository = createMemorySeasonRepository([existing]);
    const players: Player[] = [
      { id: 'player-alto', token: 't1', displayName: 'Alto', elo: 1600, arenaMarks: 0, ...DEFAULT_PVE_ACCOUNT }, // 1200 + (1600-1200)*0.5 = 1400
      { id: 'player-baixo', token: 't2', displayName: 'Baixo', elo: 1000, arenaMarks: 0, ...DEFAULT_PVE_ACCOUNT }, // 1200 + (1000-1200)*0.5 = 1100
      { id: 'player-na-media', token: 't3', displayName: 'NaMedia', elo: DEFAULT_ELO, arenaMarks: 0, ...DEFAULT_PVE_ACCOUNT },
    ];
    const playerRepository = createMemoryPlayerRepository(players);
    const afterExpiry = new Date('2026-01-16T00:00:00.000Z').getTime();

    const season = await ensureCurrentSeason({ seasonRepository, playerRepository, now: () => afterExpiry });

    expect(season.seasonNumber).toBe(2);
    expect(new Date(season.startedAt).getTime()).toBe(afterExpiry);
    expect(new Date(season.endsAt).getTime()).toBe(afterExpiry + FOURTEEN_DAYS_MS);
    expect((await playerRepository.getPlayerById('player-alto'))?.elo).toBe(1400);
    expect((await playerRepository.getPlayerById('player-baixo'))?.elo).toBe(1100);
    expect((await playerRepository.getPlayerById('player-na-media'))?.elo).toBe(DEFAULT_ELO);
  });

  it('rollover exatamente no instante de expiração (endsAt === now) conta como expirada', async () => {
    const endsAtMs = new Date('2026-01-15T00:00:00.000Z').getTime();
    const existing: Season = { id: 's1', seasonNumber: 1, startedAt: '2026-01-01T00:00:00.000Z', endsAt: new Date(endsAtMs).toISOString() };
    const seasonRepository = createMemorySeasonRepository([existing]);
    const playerRepository = createMemoryPlayerRepository([]);

    const season = await ensureCurrentSeason({ seasonRepository, playerRepository, now: () => endsAtMs });

    expect(season.seasonNumber).toBe(2);
  });
});

function buildTestApp(players: readonly Player[], seasons: readonly Season[], now?: () => number) {
  const repository = createMemoryPlayerRepository(players);
  return buildApp({
    economyRepository: createMemoryEconomyRepository(),
    repository,
    heroRepository: createMemoryHeroRepository(),
    arenaDefenseRepository: createMemoryArenaDefenseRepository(),
    replayRepository: createMemoryReplayRepository(),
    seasonRepository: createMemorySeasonRepository(seasons),
    catalog: emptyCatalog,
    shopCatalog: {},
    ticketSecret: TICKET_SECRET,
    rateLimiter: createInMemoryRateLimiter({ maxRequests: 1000, windowMs: 60_000 }),
    now,
  });
}

describe('GET /season/current', () => {
  const self: Player = { id: 'player-1', token: 'valid-token', displayName: 'Vanguard', elo: 1200, arenaMarks: 0, ...DEFAULT_PVE_ACCOUNT };

  it('rejeita sem autenticação', async () => {
    const app = buildTestApp([self], []);
    const response = await app.inject({ method: 'GET', url: '/season/current' });
    expect(response.statusCode).toBe(401);
  });

  it('com auth, cria a temporada #1 sob demanda e devolve seus dados', async () => {
    const app = buildTestApp([self], [], () => 1_000_000);
    const response = await app.inject({ method: 'GET', url: '/season/current', headers: { 'x-player-token': 'valid-token' } });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      seasonNumber: 1,
      startedAt: new Date(1_000_000).toISOString(),
      endsAt: new Date(1_000_000 + FOURTEEN_DAYS_MS).toISOString(),
    });
  });

  it('duas chamadas seguidas dentro da mesma janela devolvem a mesma temporada (idempotente)', async () => {
    const app = buildTestApp([self], [], () => 1_000_000);
    const first = await app.inject({ method: 'GET', url: '/season/current', headers: { 'x-player-token': 'valid-token' } });
    const second = await app.inject({ method: 'GET', url: '/season/current', headers: { 'x-player-token': 'valid-token' } });
    expect(first.json()).toEqual(second.json());
  });
});
