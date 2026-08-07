import type { BattleCommand, BattleResult, BattleSetup, Hero, ItemInstance } from '@paths-beyond/core';
import type { Pool } from 'pg';
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

const PLAYER_COLUMNS = 'id, token, display_name, elo, arena_marks';

export function createPostgresPlayerRepository(pool: Pool): PlayerRepository {
  return {
    async getPlayerByToken(token) {
      const result = await pool.query<PlayerRow>(`SELECT ${PLAYER_COLUMNS} FROM players WHERE token = $1`, [token]);
      const row = result.rows[0];
      return row ? rowToPlayer(row) : null;
    },
    async getPlayerById(id) {
      const result = await pool.query<PlayerRow>(`SELECT ${PLAYER_COLUMNS} FROM players WHERE id = $1`, [id]);
      const row = result.rows[0];
      return row ? rowToPlayer(row) : null;
    },
    async createPlayer(input) {
      const result = await pool.query<PlayerRow>(
        `INSERT INTO players (id, token, display_name, elo, arena_marks) VALUES ($1, $2, $3, $4, $5) RETURNING ${PLAYER_COLUMNS}`,
        [input.id, input.token, input.displayName, input.elo ?? DEFAULT_ELO, input.arenaMarks ?? DEFAULT_ARENA_MARKS],
      );
      const row = result.rows[0];
      if (!row) {
        throw new Error('failed to create player');
      }
      return rowToPlayer(row);
    },
    async updateElo(id, elo) {
      const result = await pool.query<PlayerRow>(
        `UPDATE players SET elo = $2 WHERE id = $1 RETURNING ${PLAYER_COLUMNS}`,
        [id, elo],
      );
      const row = result.rows[0];
      if (!row) {
        throw new Error(`player not found: ${id}`);
      }
      return rowToPlayer(row);
    },
    async updateArenaMarks(id, arenaMarks) {
      const result = await pool.query<PlayerRow>(
        `UPDATE players SET arena_marks = $2 WHERE id = $1 RETURNING ${PLAYER_COLUMNS}`,
        [id, arenaMarks],
      );
      const row = result.rows[0];
      if (!row) {
        throw new Error(`player not found: ${id}`);
      }
      return rowToPlayer(row);
    },
    async findOpponentsNearElo(input) {
      const result = await pool.query<PlayerRow>(
        `SELECT ${PLAYER_COLUMNS} FROM players WHERE id != $1 AND elo BETWEEN $2 AND $3`,
        [input.excludePlayerId, input.eloMin, input.eloMax],
      );
      return result.rows.map(rowToPlayer);
    },
    async listAll() {
      const result = await pool.query<PlayerRow>(`SELECT ${PLAYER_COLUMNS} FROM players`);
      return result.rows.map(rowToPlayer);
    },
  };
}

interface PlayerRow {
  readonly id: string;
  readonly token: string;
  readonly display_name: string;
  readonly elo: number;
  readonly arena_marks: number;
}

function rowToPlayer(row: PlayerRow): Player {
  return { id: row.id, token: row.token, displayName: row.display_name, elo: row.elo, arenaMarks: row.arena_marks };
}

// Herói/inventário são dados profundamente aninhados (talentos, scripts, substats) sem
// nenhum ganho real em normalizar em colunas — decisão desta sub-sessão (ver
// DECISIONS.md): guardados como JSONB inteiro, a linha é só o índice de posse
// (owner_player_id) + id pra lookup rápido. `hero`/`equipped_items` continuam validados
// contra os tipos de `@paths-beyond/core` na borda (quem escreve), não pelo Postgres.
interface HeroRow {
  readonly hero_id: string;
  readonly owner_player_id: string;
  readonly hero: Hero;
  readonly equipped_items: readonly ItemInstance[];
}

function rowToStoredHero(row: HeroRow): StoredHero {
  return { ownerPlayerId: row.owner_player_id, hero: row.hero, equippedItems: row.equipped_items };
}

export function createPostgresHeroRepository(pool: Pool): HeroRepository {
  return {
    async getHeroById(heroId) {
      const result = await pool.query<HeroRow>(
        'SELECT hero_id, owner_player_id, hero, equipped_items FROM heroes WHERE hero_id = $1',
        [heroId],
      );
      const row = result.rows[0];
      return row ? rowToStoredHero(row) : null;
    },
    async getHeroesByIds(heroIds) {
      if (heroIds.length === 0) return [];
      const result = await pool.query<HeroRow>(
        'SELECT hero_id, owner_player_id, hero, equipped_items FROM heroes WHERE hero_id = ANY($1)',
        [heroIds],
      );
      return result.rows.map(rowToStoredHero);
    },
    async createHero(input) {
      await pool.query(
        'INSERT INTO heroes (hero_id, owner_player_id, hero, equipped_items) VALUES ($1, $2, $3, $4)',
        [input.hero.id, input.ownerPlayerId, JSON.stringify(input.hero), JSON.stringify(input.equippedItems)],
      );
      return input;
    },
    async updateHero(input) {
      await pool.query('UPDATE heroes SET hero = $2, equipped_items = $3 WHERE hero_id = $1', [
        input.hero.id,
        JSON.stringify(input.hero),
        JSON.stringify(input.equippedItems),
      ]);
      return input;
    },
  };
}

interface ArenaDefenseRow {
  readonly owner_player_id: string;
  readonly map_id: string;
  readonly units: ArenaDefense['units'];
}

function rowToArenaDefense(row: ArenaDefenseRow): ArenaDefense {
  return { ownerPlayerId: row.owner_player_id, mapId: row.map_id, units: row.units };
}

export function createPostgresArenaDefenseRepository(pool: Pool): ArenaDefenseRepository {
  return {
    async getDefenseByOwner(ownerPlayerId) {
      const result = await pool.query<ArenaDefenseRow>(
        'SELECT owner_player_id, map_id, units FROM arena_defenses WHERE owner_player_id = $1',
        [ownerPlayerId],
      );
      const row = result.rows[0];
      return row ? rowToArenaDefense(row) : null;
    },
    async saveDefense(defense) {
      await pool.query(
        `INSERT INTO arena_defenses (owner_player_id, map_id, units) VALUES ($1, $2, $3)
         ON CONFLICT (owner_player_id) DO UPDATE SET map_id = $2, units = $3`,
        [defense.ownerPlayerId, defense.mapId, JSON.stringify(defense.units)],
      );
      return defense;
    },
  };
}

interface ReplayRow {
  readonly nonce: string;
  readonly rules_version: string;
  readonly seed: number;
  readonly initial_state: BattleSetup;
  readonly commands: readonly BattleCommand[];
  readonly result: BattleResult;
  readonly attacker_player_id: string;
  readonly defender_player_id: string;
  readonly created_at: string;
}

function rowToStoredReplay(row: ReplayRow): StoredReplay {
  return {
    nonce: row.nonce,
    rulesVersion: row.rules_version,
    seed: row.seed,
    initialState: row.initial_state,
    commands: row.commands,
    result: row.result,
    attackerPlayerId: row.attacker_player_id,
    defenderPlayerId: row.defender_player_id,
    createdAt: row.created_at,
  };
}

const REPLAY_COLUMNS =
  'nonce, rules_version, seed, initial_state, commands, result, attacker_player_id, defender_player_id, created_at';

export function createPostgresReplayRepository(pool: Pool): ReplayRepository {
  return {
    async getByNonce(nonce) {
      const result = await pool.query<ReplayRow>(`SELECT ${REPLAY_COLUMNS} FROM replays WHERE nonce = $1`, [nonce]);
      const row = result.rows[0];
      return row ? rowToStoredReplay(row) : null;
    },
    async save(replay) {
      // nonce é chave primária — INSERT simples (nunca update): um nonce reutilizado é
      // exatamente o ataque de replay que esta tabela existe pra impedir (a rota checa
      // `getByNonce` antes de chegar aqui, mas a constraint no banco é a garantia real).
      await pool.query(
        `INSERT INTO replays (${REPLAY_COLUMNS}) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          replay.nonce,
          replay.rulesVersion,
          replay.seed,
          JSON.stringify(replay.initialState),
          JSON.stringify(replay.commands),
          JSON.stringify(replay.result),
          replay.attackerPlayerId,
          replay.defenderPlayerId,
          replay.createdAt,
        ],
      );
      return replay;
    },
  };
}

interface SeasonRow {
  readonly id: string;
  readonly season_number: number;
  readonly started_at: string;
  readonly ends_at: string;
}

function rowToSeason(row: SeasonRow): Season {
  return { id: row.id, seasonNumber: row.season_number, startedAt: row.started_at, endsAt: row.ends_at };
}

const SEASON_COLUMNS = 'id, season_number, started_at, ends_at';

export function createPostgresSeasonRepository(pool: Pool): SeasonRepository {
  return {
    async getCurrentSeason() {
      const result = await pool.query<SeasonRow>(
        `SELECT ${SEASON_COLUMNS} FROM seasons ORDER BY season_number DESC LIMIT 1`,
      );
      const row = result.rows[0];
      return row ? rowToSeason(row) : null;
    },
    async createSeason(season) {
      await pool.query(
        `INSERT INTO seasons (${SEASON_COLUMNS}) VALUES ($1, $2, $3, $4)`,
        [season.id, season.seasonNumber, season.startedAt, season.endsAt],
      );
      return season;
    },
  };
}
