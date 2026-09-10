import type { ContentCatalog } from '@paths-beyond/content';
import { describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { createDevIdentityValidator } from '../src/identity/devIdentity.js';
import { createInMemoryRateLimiter } from '../src/battle/rateLimit.js';
import {
  createMemoryArenaDefenseRepository,
  createMemoryHeroRepository,
  createMemoryPlayerRepository,
  createMemoryReplayRepository,
  createMemoryRewardsRepository,
  createMemorySeasonRepository,
  createMemoryCharacterOwnershipRepository,
  createMemoryEconomyRepository,
} from '../src/repository/memoryRepository.js';
import type { ArenaDefense, Player } from '../src/repository/types.js';
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

const SELF_TOKEN = 'token-eu';

function buildTestApp(players: readonly Player[], defenses: readonly ArenaDefense[]) {
  const repository = createMemoryPlayerRepository(players);
  return buildApp({
    economyRepository: createMemoryEconomyRepository(),
    ownershipRepository: createMemoryCharacterOwnershipRepository(),
    rewardsRepository: createMemoryRewardsRepository(),
    repository,
    heroRepository: createMemoryHeroRepository(),
    arenaDefenseRepository: createMemoryArenaDefenseRepository(defenses),
    replayRepository: createMemoryReplayRepository(),
    seasonRepository: createMemorySeasonRepository(),
    catalog: emptyCatalog,
    shopCatalog: {},
    ticketSecret: TICKET_SECRET,
    identityValidator: createDevIdentityValidator(),
    rateLimiter: createInMemoryRateLimiter({ maxRequests: 1000, windowMs: 60_000 }),
  });
}

describe('GET /matchmaking/opponent', () => {
  const self: Player = { id: 'player-eu', platformProvider: 'dev' as const, platformId: SELF_TOKEN, displayName: 'Eu', elo: 1200, arenaMarks: 0, ...DEFAULT_PVE_ACCOUNT };

  it('rejeita sem autenticação', async () => {
    const app = buildTestApp([self], []);
    const response = await app.inject({ method: 'GET', url: '/matchmaking/opponent' });
    expect(response.statusCode).toBe(401);
  });

  it('404 quando não há nenhum outro jogador', async () => {
    const app = buildTestApp([self], []);
    const response = await app.inject({ method: 'GET', url: '/matchmaking/opponent', headers: { 'x-platform-ticket': `dev:${SELF_TOKEN}`} });
    expect(response.statusCode).toBe(404);
  });

  it('404 quando o único candidato próximo de ELO não tem defesa configurada', async () => {
    const noDefense: Player = { id: 'player-sem-defesa', platformProvider: 'dev' as const, platformId: 'tok2', displayName: 'Sem Defesa', elo: 1210, arenaMarks: 0, ...DEFAULT_PVE_ACCOUNT };
    const app = buildTestApp([self, noDefense], []);
    const response = await app.inject({ method: 'GET', url: '/matchmaking/opponent', headers: { 'x-platform-ticket': `dev:${SELF_TOKEN}`} });
    expect(response.statusCode).toBe(404);
  });

  it('404 quando o único candidato com defesa está fora da faixa de ELO', async () => {
    const farAway: Player = { id: 'player-longe', platformProvider: 'dev' as const, platformId: 'tok3', displayName: 'Longe', elo: 3000, arenaMarks: 0, ...DEFAULT_PVE_ACCOUNT };
    const defense: ArenaDefense = { ownerPlayerId: 'player-longe', mapId: 'mapa-1', units: [] };
    const app = buildTestApp([self, farAway], [defense]);
    const response = await app.inject({ method: 'GET', url: '/matchmaking/opponent', headers: { 'x-platform-ticket': `dev:${SELF_TOKEN}`} });
    expect(response.statusCode).toBe(404);
  });

  it('encontra um oponente dentro da faixa de ELO com defesa configurada', async () => {
    const nearby: Player = { id: 'player-perto', platformProvider: 'dev' as const, platformId: 'tok4', displayName: 'Perto', elo: 1250, arenaMarks: 0, ...DEFAULT_PVE_ACCOUNT };
    const defense: ArenaDefense = { ownerPlayerId: 'player-perto', mapId: 'mapa-1', units: [] };
    const app = buildTestApp([self, nearby], [defense]);
    const response = await app.inject({ method: 'GET', url: '/matchmaking/opponent', headers: { 'x-platform-ticket': `dev:${SELF_TOKEN}`} });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ playerId: 'player-perto', displayName: 'Perto', elo: 1250, mapId: 'mapa-1' });
  });

  it('nunca escolhe o próprio chamador como oponente', async () => {
    const app = buildTestApp([self], [{ ownerPlayerId: 'player-eu', mapId: 'mapa-1', units: [] }]);
    const response = await app.inject({ method: 'GET', url: '/matchmaking/opponent', headers: { 'x-platform-ticket': `dev:${SELF_TOKEN}`} });
    expect(response.statusCode).toBe(404);
  });

  it('entre vários candidatos válidos, escolhe o mais próximo em ELO (desempate determinístico)', async () => {
    const closer: Player = { id: 'player-mais-perto', platformProvider: 'dev' as const, platformId: 'tok5', displayName: 'Mais Perto', elo: 1220, arenaMarks: 0, ...DEFAULT_PVE_ACCOUNT };
    const farther: Player = { id: 'player-mais-longe', platformProvider: 'dev' as const, platformId: 'tok6', displayName: 'Mais Longe', elo: 1350, arenaMarks: 0, ...DEFAULT_PVE_ACCOUNT };
    const defenses: ArenaDefense[] = [
      { ownerPlayerId: 'player-mais-perto', mapId: 'mapa-1', units: [] },
      { ownerPlayerId: 'player-mais-longe', mapId: 'mapa-1', units: [] },
    ];
    const app = buildTestApp([self, closer, farther], defenses);
    const response = await app.inject({ method: 'GET', url: '/matchmaking/opponent', headers: { 'x-platform-ticket': `dev:${SELF_TOKEN}`} });
    expect(response.statusCode).toBe(200);
    expect(response.json().playerId).toBe('player-mais-perto');
  });
});
