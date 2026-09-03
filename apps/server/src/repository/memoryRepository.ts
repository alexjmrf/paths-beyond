import type { EnergyState, EntryLimitState, ItemInstance } from '@paths-beyond/core';
import {
  DEFAULT_ARENA_MARKS,
  DEFAULT_ELO,
  DEFAULT_GOLD,
  DEFAULT_PREMIUM,
  DEFAULT_STONES,
  type ArenaDefense,
  type ArenaDefenseRepository,
  type CharacterOwnershipRepository,
  type HeroRepository,
  type Player,
  type PlayerRepository,
  type ReplayRepository,
  type Season,
  type SeasonRepository,
  type StoredHero,
  type StoredReplay,
  type DungeonRunRecord,
  type EconomyActionRecord,
  type EconomyRepository,
} from './types.js';

// Conta nova começa com a barra de energia CHEIA — quem chama passa o teto vindo do
// dado. Zero aqui, e não o teto, porque o repositório não conhece `economy-rules`
// (números de balanceamento não moram em código, regra 4).
const DEFAULT_ENERGY: EnergyState = { stored: 0, asOfMs: 0 };

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
      const player: Player = {
        elo: DEFAULT_ELO,
        arenaMarks: DEFAULT_ARENA_MARKS,
        gold: DEFAULT_GOLD,
        stones: DEFAULT_STONES,
        premium: DEFAULT_PREMIUM,
        energy: DEFAULT_ENERGY,
        ...input,
      };
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
    async updateWallet(id, wallet) {
      const existing = byId.get(id);
      if (!existing) throw new Error(`player not found: ${id}`);
      const updated: Player = { ...existing, gold: wallet.gold, stones: wallet.stones };
      byId.set(id, updated);
      return updated;
    },
    async updatePremium(id, premium) {
      const existing = byId.get(id);
      if (!existing) throw new Error(`player not found: ${id}`);
      const updated: Player = { ...existing, premium };
      byId.set(id, updated);
      return updated;
    },
    async updateEnergy(id, energy) {
      const existing = byId.get(id);
      if (!existing) throw new Error(`player not found: ${id}`);
      const updated: Player = { ...existing, energy };
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
    async listHeroesByOwner(ownerPlayerId) {
      // Ordem estável por id: duas chamadas iguais não podem devolver o roster embaralhado.
      return [...byId.values()]
        .filter((stored) => stored.ownerPlayerId === ownerPlayerId)
        .sort((a, b) => (a.hero.id < b.hero.id ? -1 : a.hero.id > b.hero.id ? 1 : 0));
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


// §10 (M14, sub-sessão 3/N) — a metade em memória do estado de conta do PvE. Mesma
// convenção do resto deste arquivo: é o que os testes usam, e o Postgres é o espelho.
export function createMemoryEconomyRepository(): EconomyRepository {
  const materials = new Map<string, Record<string, number>>();
  const items = new Map<string, Map<string, ItemInstance>>();
  const clears = new Map<string, Set<string>>();
  const entries = new Map<string, EntryLimitState>();
  const runs = new Map<string, DungeonRunRecord>();
  const actions = new Map<string, EconomyActionRecord>();

  const inventoryOf = (playerId: string): Map<string, ItemInstance> => {
    const existing = items.get(playerId);
    if (existing) return existing;
    const created = new Map<string, ItemInstance>();
    items.set(playerId, created);
    return created;
  };

  const entryKey = (playerId: string, dungeonId: string): string => `${playerId}:${dungeonId}`;

  return {
    async getMaterials(playerId) {
      return { ...(materials.get(playerId) ?? {}) };
    },
    async setMaterials(playerId, next) {
      materials.set(playerId, { ...next });
      return { ...next };
    },

    async listItems(playerId) {
      return [...inventoryOf(playerId).values()];
    },
    async getItem(playerId, itemId) {
      return inventoryOf(playerId).get(itemId) ?? null;
    },
    async addItems(playerId, newItems) {
      const inventory = inventoryOf(playerId);
      for (const item of newItems) inventory.set(item.id, item);
      return newItems;
    },
    async replaceItem(playerId, item) {
      inventoryOf(playerId).set(item.id, item);
      return item;
    },
    async removeItem(playerId, itemId) {
      inventoryOf(playerId).delete(itemId);
    },

    async listClears(playerId) {
      return [...(clears.get(playerId) ?? new Set<string>())];
    },
    async markCleared(playerId, dungeonId) {
      const existing = clears.get(playerId) ?? new Set<string>();
      existing.add(dungeonId);
      clears.set(playerId, existing);
    },

    async getEntryState(playerId, dungeonId) {
      return entries.get(entryKey(playerId, dungeonId)) ?? null;
    },
    async setEntryState(playerId, dungeonId, state) {
      entries.set(entryKey(playerId, dungeonId), state);
      return state;
    },

    async getRun(nonce) {
      return runs.get(nonce) ?? null;
    },
    async saveRun(run) {
      runs.set(run.nonce, run);
      return run;
    },

    async getAction(nonce) {
      return actions.get(nonce) ?? null;
    },
    async saveAction(action) {
      actions.set(action.nonce, action);
      return action;
    },
  };
}

// §10 (M18, 3/N) — posse de personagem e pity, em memória.
export function createMemoryCharacterOwnershipRepository(
  seed: Readonly<Record<string, readonly string[]>> = {},
): CharacterOwnershipRepository {
  const acquired = new Map<string, Set<string>>(
    Object.entries(seed).map(([playerId, ids]) => [playerId, new Set(ids)]),
  );
  const pity = new Map<string, number>();
  const pityKey = (playerId: string, bannerId: string): string => `${playerId}::${bannerId}`;

  return {
    async listAcquired(playerId) {
      return [...(acquired.get(playerId) ?? [])];
    },
    async grant(playerId, characterId) {
      const owned = acquired.get(playerId) ?? new Set<string>();
      owned.add(characterId);
      acquired.set(playerId, owned);
    },
    async getPity(playerId, bannerId) {
      return pity.get(pityKey(playerId, bannerId)) ?? null;
    },
    async setPity(playerId, bannerId, rollsSinceNew) {
      pity.set(pityKey(playerId, bannerId), rollsSinceNew);
    },
  };
}
