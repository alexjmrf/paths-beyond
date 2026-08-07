import {
  DEFAULT_ARENA_MARKS,
  DEFAULT_ELO,
  type ArenaDefense,
  type ArenaDefenseRepository,
  type HeroRepository,
  type Player,
  type PlayerRepository,
  type ReplayRepository,
  type Season,
  type SeasonRepository,
  type StoredHero,
  type StoredReplay,
} from './types.js';

export function createMemoryPlayerRepository(seed: readonly Player[] = []): PlayerRepository {
  const byId = new Map<string, Player>(seed.map((player) => [player.id, player]));

  return {
    async getPlayerByToken(token) {
      return [...byId.values()].find((p) => p.token === token) ?? null;
    },
    async getPlayerById(id) {
      return byId.get(id) ?? null;
    },
    async createPlayer(input) {
      const player: Player = { elo: DEFAULT_ELO, arenaMarks: DEFAULT_ARENA_MARKS, ...input };
      byId.set(player.id, player);
      return player;
    },
    async updateElo(id, elo) {
      const existing = byId.get(id);
      if (!existing) throw new Error(`player not found: ${id}`);
      const updated: Player = { ...existing, elo };
      byId.set(id, updated);
      return updated;
    },
    async updateArenaMarks(id, arenaMarks) {
      const existing = byId.get(id);
      if (!existing) throw new Error(`player not found: ${id}`);
      const updated: Player = { ...existing, arenaMarks };
      byId.set(id, updated);
      return updated;
    },
    async findOpponentsNearElo(input) {
      return [...byId.values()].filter(
        (p) => p.id !== input.excludePlayerId && p.elo >= input.eloMin && p.elo <= input.eloMax,
      );
    },
    async listAll() {
      return [...byId.values()];
    },
  };
}

export function createMemoryHeroRepository(seed: readonly StoredHero[] = []): HeroRepository {
  const byId = new Map<string, StoredHero>(seed.map((stored) => [stored.hero.id, stored]));

  return {
    async getHeroById(heroId) {
      return byId.get(heroId) ?? null;
    },
    async getHeroesByIds(heroIds) {
      return heroIds.map((id) => byId.get(id)).filter((stored): stored is StoredHero => stored !== undefined);
    },
    async createHero(input) {
      byId.set(input.hero.id, input);
      return input;
    },
    async updateHero(input) {
      byId.set(input.hero.id, input);
      return input;
    },
  };
}

export function createMemoryArenaDefenseRepository(seed: readonly ArenaDefense[] = []): ArenaDefenseRepository {
  const byOwner = new Map<string, ArenaDefense>(seed.map((defense) => [defense.ownerPlayerId, defense]));

  return {
    async getDefenseByOwner(ownerPlayerId) {
      return byOwner.get(ownerPlayerId) ?? null;
    },
    async saveDefense(defense) {
      byOwner.set(defense.ownerPlayerId, defense);
      return defense;
    },
  };
}

export function createMemorySeasonRepository(seed: readonly Season[] = []): SeasonRepository {
  const seasons = [...seed];

  return {
    async getCurrentSeason() {
      if (seasons.length === 0) return null;
      return [...seasons].sort((a, b) => b.seasonNumber - a.seasonNumber)[0] ?? null;
    },
    async createSeason(season) {
      seasons.push(season);
      return season;
    },
  };
}

export function createMemoryReplayRepository(seed: readonly StoredReplay[] = []): ReplayRepository {
  const byNonce = new Map<string, StoredReplay>(seed.map((replay) => [replay.nonce, replay]));

  return {
    async getByNonce(nonce) {
      return byNonce.get(nonce) ?? null;
    },
    async save(replay) {
      byNonce.set(replay.nonce, replay);
      return replay;
    },
  };
}
