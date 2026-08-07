import { describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { createInMemoryRateLimiter } from '../src/battle/rateLimit.js';
import type { ContentCatalog } from '../src/content/types.js';
import {
  createMemoryArenaDefenseRepository,
  createMemoryHeroRepository,
  createMemoryPlayerRepository,
  createMemoryReplayRepository,
  createMemorySeasonRepository,
} from '../src/repository/memoryRepository.js';
import type { ArenaDefense, Player } from '../src/repository/types.js';

const emptyCatalog: ContentCatalog = {
  classes: {},
  skills: {},
  itemSets: {},
  weaponDuelRanges: { sword: 1, axe: 1, spear: 1, bow: 2, arcane: 2, nature: 2, holy: 2 },
  maps: {},
  baselineReactionSkillIds: [],
};

const SELF_TOKEN = 'token-eu';

function buildTestApp(players: readonly Player[], defenses: readonly ArenaDefense[]) {
  const repository = createMemoryPlayerRepository(players);
  return buildApp({
    repository,
    heroRepository: createMemoryHeroRepository(),
    arenaDefenseRepository: createMemoryArenaDefenseRepository(defenses),
    replayRepository: createMemoryReplayRepository(),
    seasonRepository: createMemorySeasonRepository(),
    catalog: emptyCatalog,
    shopCatalog: {},
    rateLimiter: createInMemoryRateLimiter({ maxRequests: 1000, windowMs: 60_000 }),
  });
}

describe('GET /matchmaking/opponent', () => {
  const self: Player = { id: 'player-eu', token: SELF_TOKEN, displayName: 'Eu', elo: 1200, arenaMarks: 0 };

  it('rejeita sem autenticação', async () => {
    const app = buildTestApp([self], []);
    const response = await app.inject({ method: 'GET', url: '/matchmaking/opponent' });
    expect(response.statusCode).toBe(401);
  });

  it('404 quando não há nenhum outro jogador', async () => {
    const app = buildTestApp([self], []);
    const response = await app.inject({ method: 'GET', url: '/matchmaking/opponent', headers: { 'x-player-token': SELF_TOKEN } });
    expect(response.statusCode).toBe(404);
  });

  it('404 quando o único candidato próximo de ELO não tem defesa configurada', async () => {
    const noDefense: Player = { id: 'player-sem-defesa', token: 'tok2', displayName: 'Sem Defesa', elo: 1210, arenaMarks: 0 };
    const app = buildTestApp([self, noDefense], []);
    const response = await app.inject({ method: 'GET', url: '/matchmaking/opponent', headers: { 'x-player-token': SELF_TOKEN } });
    expect(response.statusCode).toBe(404);
  });

  it('404 quando o único candidato com defesa está fora da faixa de ELO', async () => {
    const farAway: Player = { id: 'player-longe', token: 'tok3', displayName: 'Longe', elo: 3000, arenaMarks: 0 };
    const defense: ArenaDefense = { ownerPlayerId: 'player-longe', mapId: 'mapa-1', units: [] };
    const app = buildTestApp([self, farAway], [defense]);
    const response = await app.inject({ method: 'GET', url: '/matchmaking/opponent', headers: { 'x-player-token': SELF_TOKEN } });
    expect(response.statusCode).toBe(404);
  });

  it('encontra um oponente dentro da faixa de ELO com defesa configurada', async () => {
    const nearby: Player = { id: 'player-perto', token: 'tok4', displayName: 'Perto', elo: 1250, arenaMarks: 0 };
    const defense: ArenaDefense = { ownerPlayerId: 'player-perto', mapId: 'mapa-1', units: [] };
    const app = buildTestApp([self, nearby], [defense]);
    const response = await app.inject({ method: 'GET', url: '/matchmaking/opponent', headers: { 'x-player-token': SELF_TOKEN } });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ playerId: 'player-perto', displayName: 'Perto', elo: 1250, mapId: 'mapa-1' });
  });

  it('nunca escolhe o próprio chamador como oponente', async () => {
    const app = buildTestApp([self], [{ ownerPlayerId: 'player-eu', mapId: 'mapa-1', units: [] }]);
    const response = await app.inject({ method: 'GET', url: '/matchmaking/opponent', headers: { 'x-player-token': SELF_TOKEN } });
    expect(response.statusCode).toBe(404);
  });

  it('entre vários candidatos válidos, escolhe o mais próximo em ELO (desempate determinístico)', async () => {
    const closer: Player = { id: 'player-mais-perto', token: 'tok5', displayName: 'Mais Perto', elo: 1220, arenaMarks: 0 };
    const farther: Player = { id: 'player-mais-longe', token: 'tok6', displayName: 'Mais Longe', elo: 1350, arenaMarks: 0 };
    const defenses: ArenaDefense[] = [
      { ownerPlayerId: 'player-mais-perto', mapId: 'mapa-1', units: [] },
      { ownerPlayerId: 'player-mais-longe', mapId: 'mapa-1', units: [] },
    ];
    const app = buildTestApp([self, closer, farther], defenses);
    const response = await app.inject({ method: 'GET', url: '/matchmaking/opponent', headers: { 'x-player-token': SELF_TOKEN } });
    expect(response.statusCode).toBe(200);
    expect(response.json().playerId).toBe('player-mais-perto');
  });
});
