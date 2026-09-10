import type { BattleCommand, BattleResult, BattleSetup, EnergyState, EntryLimitState, Hero, ItemInstance } from '@paths-beyond/core';
import type { Pool } from 'pg';
import type { RateLimiter, RateLimiterOptions } from '../battle/rateLimit.js';
import {
  DEFAULT_ARENA_MARKS,
  DEFAULT_ELO,
  DEFAULT_GOLD,
  DEFAULT_PREMIUM,
  DEFAULT_STONES,
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
  type DungeonRunRecord,
  type EconomyActionRecord,
  type CharacterOwnershipRepository,
  type RewardsRepository,
  type EconomyRepository,
  type IdempotencyRepository,
  type StoredResponse,
} from './types.js';

const PLAYER_COLUMNS =
  'id, platform_provider, platform_id, display_name, elo, arena_marks, gold, stones, premium, energy_stored, energy_as_of';

export function createPostgresPlayerRepository(pool: Pool): PlayerRepository {
  return {
    async getPlayerByPlatformIdentity(provider, platformId) {
      const result = await pool.query<PlayerRow>(
        `SELECT ${PLAYER_COLUMNS} FROM players WHERE platform_provider = $1 AND platform_id = $2`,
        [provider, platformId],
      );
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
        `INSERT INTO players (id, platform_provider, platform_id, display_name, elo, arena_marks, gold, stones, premium, energy_stored, energy_as_of)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING ${PLAYER_COLUMNS}`,
        [
          input.id,
          input.platformProvider,
          input.platformId,
          input.displayName,
          input.elo ?? DEFAULT_ELO,
          input.arenaMarks ?? DEFAULT_ARENA_MARKS,
          input.gold ?? DEFAULT_GOLD,
          input.stones ?? DEFAULT_STONES,
          input.premium ?? DEFAULT_PREMIUM,
          input.energy?.stored ?? 0,
          input.energy?.asOfMs ?? 0,
        ],
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
    // §10/D17 (M18) — a moeda premium, em coluna própria.
    async updatePremium(id, premium) {
      const result = await pool.query<PlayerRow>(
        `UPDATE players SET premium = $2 WHERE id = $1 RETURNING ${PLAYER_COLUMNS}`,
        [id, premium],
      );
      const row = result.rows[0];
      if (!row) throw new Error(`player not found: ${id}`);
      return rowToPlayer(row);
    },
    async updateWallet(id, wallet) {
      const result = await pool.query<PlayerRow>(
        `UPDATE players SET gold = $2, stones = $3 WHERE id = $1 RETURNING ${PLAYER_COLUMNS}`,
        [id, wallet.gold, wallet.stones],
      );
      const row = result.rows[0];
      if (!row) throw new Error(`player not found: ${id}`);
      return rowToPlayer(row);
    },
    // §9.4 (M20) — a exclusão do jogador vem POR ÚLTIMO na orquestração da rota: as tabelas
    // que o referenciam têm chave estrangeira, então apagar aqui antes das outras falharia
    // por integridade. É uma propriedade boa — esquecer uma tabela não deixa lixo em
    // silêncio, deixa a exclusão inteira reprovar.
    async deletePlayer(id) {
      const result = await pool.query('DELETE FROM players WHERE id = $1', [id]);
      return (result.rowCount ?? 0) > 0;
    },
    async updateEnergy(id, energy) {
      const result = await pool.query<PlayerRow>(
        `UPDATE players SET energy_stored = $2, energy_as_of = $3 WHERE id = $1 RETURNING ${PLAYER_COLUMNS}`,
        [id, energy.stored, energy.asOfMs],
      );
      const row = result.rows[0];
      if (!row) throw new Error(`player not found: ${id}`);
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
  readonly platform_provider: string;
  readonly platform_id: string;
  readonly display_name: string;
  readonly elo: number;
  readonly arena_marks: number;
  // `gold` e `energy_as_of` são bigint no banco (ouro acumula muito, e um instante em ms
  // não cabe em integer): o driver `pg` devolve bigint como string para não perder
  // precisão, então o tipo aqui é a união e a conversão acontece em `rowToPlayer`.
  readonly gold: number | string;
  readonly stones: number;
  readonly premium: number;
  readonly energy_stored: number;
  readonly energy_as_of: number | string;
}

function rowToPlayer(row: PlayerRow): Player {
  return {
    id: row.id,
    platformProvider: row.platform_provider as 'steam' | 'epic' | 'dev',
    platformId: row.platform_id,
    displayName: row.display_name,
    elo: row.elo,
    arenaMarks: row.arena_marks,
    gold: Number(row.gold),
    stones: row.stones,
    premium: row.premium,
    // `energy_as_of` é bigint (instante em ms não cabe em integer): o driver devolve
    // string, então a conversão acontece aqui, na fronteira.
    energy: { stored: row.energy_stored, asOfMs: Number(row.energy_as_of) },
  };
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
      // M27 2/N — devolvido na ORDEM PEDIDA, e isso é contrato (ver `types.ts`), não gosto.
      //
      // `WHERE hero_id = ANY($1)` não promete ordem nenhuma, e o de memória sempre devolveu
      // na ordem do pedido. A divergência não some num teste: ela aparece em produção como
      // "mandei o espadachim para a vaga da frente e ele nasceu atrás" — `assembleChapterBattle`
      // casa `stored[index]` com `slots[index]`, e quem ocupa qual vaga decide a partida
      // (medido em M27 2/N: a mesma missão dá 20/20 com hero-jogador+clérigo e 0/20 com
      // arcanista+arqueiro). Reordenar aqui, e não em cada chamador, porque são seis.
      const porId = new Map(result.rows.map((row) => [row.hero_id, row] as const));
      return heroIds.map((id) => porId.get(id)).filter((row): row is HeroRow => row !== undefined).map(rowToStoredHero);
    },
    async listHeroesByOwner(ownerPlayerId) {
      const result = await pool.query<HeroRow>(
        'SELECT hero_id, owner_player_id, hero, equipped_items FROM heroes WHERE owner_player_id = $1 ORDER BY hero_id',
        [ownerPlayerId],
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
    async deleteHeroesByOwner(ownerPlayerId) {
      await pool.query('DELETE FROM heroes WHERE owner_player_id = $1', [ownerPlayerId]);
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
    async deleteDefenseByOwner(ownerPlayerId) {
      await pool.query('DELETE FROM arena_defenses WHERE owner_player_id = $1', [ownerPlayerId]);
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
    async deleteReplaysOfPlayer(playerId) {
      // Dos DOIS lados: um replay guarda atacante e defensor, e deixá-lo de pé manteria o id
      // de quem pediu a exclusão registrado.
      await pool.query('DELETE FROM replays WHERE attacker_player_id = $1 OR defender_player_id = $1', [playerId]);
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


// §10 (M14, sub-sessão 3/N) — o espelho Postgres do estado de conta do PvE. Mesma divisão
// do resto do arquivo: nenhuma regra aqui, só leitura e escrita — quem decide se pode
// gastar energia ou se o material dá é `packages/core`.
export function createPostgresEconomyRepository(pool: Pool): EconomyRepository {
  return {
    async getMaterials(playerId) {
      const result = await pool.query<{ material_id: string; amount: number }>(
        'SELECT material_id, amount FROM player_materials WHERE player_id = $1',
        [playerId],
      );
      const materials: Record<string, number> = {};
      for (const row of result.rows) materials[row.material_id] = row.amount;
      return materials;
    },
    async setMaterials(playerId, materials) {
      // Escrita inteira em transação: um `awaken` debita vários materiais de uma vez, e
      // meia gravação deixaria a conta com material cobrado sem o rank entregue.
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query('DELETE FROM player_materials WHERE player_id = $1', [playerId]);
        for (const [materialId, amount] of Object.entries(materials)) {
          if (amount <= 0) continue; // material zerado não vira linha
          await client.query(
            'INSERT INTO player_materials (player_id, material_id, amount) VALUES ($1, $2, $3)',
            [playerId, materialId, amount],
          );
        }
        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
      return materials;
    },

    async listItems(playerId) {
      const result = await pool.query<{ item: ItemInstance }>(
        'SELECT item FROM player_items WHERE owner_player_id = $1 ORDER BY item_id',
        [playerId],
      );
      return result.rows.map((row) => row.item);
    },
    async getItem(playerId, itemId) {
      const result = await pool.query<{ item: ItemInstance }>(
        'SELECT item FROM player_items WHERE owner_player_id = $1 AND item_id = $2',
        [playerId, itemId],
      );
      return result.rows[0]?.item ?? null;
    },
    async addItems(playerId, items) {
      for (const item of items) {
        await pool.query(
          `INSERT INTO player_items (item_id, owner_player_id, item) VALUES ($1, $2, $3)
           ON CONFLICT (item_id) DO UPDATE SET item = EXCLUDED.item`,
          [item.id, playerId, item],
        );
      }
      return items;
    },
    async replaceItem(playerId, item) {
      await pool.query(
        `INSERT INTO player_items (item_id, owner_player_id, item) VALUES ($1, $2, $3)
         ON CONFLICT (item_id) DO UPDATE SET item = EXCLUDED.item`,
        [item.id, playerId, item],
      );
      return item;
    },
    async removeItem(playerId, itemId) {
      await pool.query('DELETE FROM player_items WHERE owner_player_id = $1 AND item_id = $2', [playerId, itemId]);
    },

    async listClears(playerId) {
      const result = await pool.query<{ dungeon_id: string }>(
        'SELECT dungeon_id FROM dungeon_clears WHERE player_id = $1',
        [playerId],
      );
      return result.rows.map((row) => row.dungeon_id);
    },
    async markCleared(playerId, dungeonId) {
      await pool.query(
        'INSERT INTO dungeon_clears (player_id, dungeon_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
        [playerId, dungeonId],
      );
    },

    async getEntryState(playerId, dungeonId) {
      const result = await pool.query<{ used: number; as_of_ms: string }>(
        'SELECT used, as_of_ms FROM dungeon_entries WHERE player_id = $1 AND dungeon_id = $2',
        [playerId, dungeonId],
      );
      const row = result.rows[0];
      // `as_of_ms` é bigint: o driver devolve string, e um instante em ms não cabe em
      // integer. Converter aqui é o que impede o core de receber `NaN`.
      return row ? ({ used: row.used, asOfMs: Number(row.as_of_ms) } satisfies EntryLimitState) : null;
    },
    async setEntryState(playerId, dungeonId, state) {
      await pool.query(
        `INSERT INTO dungeon_entries (player_id, dungeon_id, used, as_of_ms) VALUES ($1, $2, $3, $4)
         ON CONFLICT (player_id, dungeon_id) DO UPDATE SET used = EXCLUDED.used, as_of_ms = EXCLUDED.as_of_ms`,
        [playerId, dungeonId, state.used, state.asOfMs],
      );
      return state;
    },

    async getRun(nonce) {
      const result = await pool.query<{
        nonce: string;
        player_id: string;
        dungeon_id: string;
        mode: 'manual' | 'auto';
        outcome: 'victory' | 'defeat';
        created_at: Date;
      }>('SELECT nonce, player_id, dungeon_id, mode, outcome, created_at FROM dungeon_runs WHERE nonce = $1', [nonce]);
      const row = result.rows[0];
      if (!row) return null;
      return {
        nonce: row.nonce,
        playerId: row.player_id,
        dungeonId: row.dungeon_id,
        mode: row.mode,
        outcome: row.outcome,
        createdAt: new Date(row.created_at).toISOString(),
      };
    },
    async saveRun(run) {
      await pool.query(
        `INSERT INTO dungeon_runs (nonce, player_id, dungeon_id, mode, outcome, created_at)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [run.nonce, run.playerId, run.dungeonId, run.mode, run.outcome, run.createdAt],
      );
      return run;
    },

    async getAction(nonce) {
      const result = await pool.query<{ nonce: string; player_id: string; kind: EconomyActionRecord['kind']; created_at: Date }>(
        'SELECT nonce, player_id, kind, created_at FROM economy_actions WHERE nonce = $1',
        [nonce],
      );
      const row = result.rows[0];
      if (!row) return null;
      return {
        nonce: row.nonce,
        playerId: row.player_id,
        kind: row.kind,
        createdAt: new Date(row.created_at).toISOString(),
      };
    },
    async saveAction(action) {
      await pool.query(
        'INSERT INTO economy_actions (nonce, player_id, kind, created_at) VALUES ($1, $2, $3, $4)',
        [action.nonce, action.playerId, action.kind, action.createdAt],
      );
      return action;
    },
    async deletePlayerData(playerId) {
      // Numa transação: meia exclusão deixaria a conta num estado que nenhum código sabe
      // ler, e é exatamente o caso em que ninguém volta para conferir.
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        for (const [tabela, coluna] of [
          ['player_materials', 'player_id'],
          ['player_items', 'owner_player_id'],
          ['dungeon_clears', 'player_id'],
          ['dungeon_entries', 'player_id'],
          ['dungeon_runs', 'player_id'],
          ['economy_actions', 'player_id'],
        ] as const) {
          await client.query(`DELETE FROM ${tabela} WHERE ${coluna} = $1`, [playerId]);
        }
        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
    },
  };
}

// §10 (M18, 3/N) — posse de personagem e pity.
//
// Só o ADQUIRIDO tem linha: o núcleo de história é derivado do catálogo (ver
// `CharacterOwnershipRepository` em `types.ts`), e guardá-lo aqui seria uma cópia que pode
// divergir do dado.
export function createPostgresCharacterOwnershipRepository(pool: Pool): CharacterOwnershipRepository {
  return {
    async listAcquired(playerId) {
      const result = await pool.query<{ character_id: string }>(
        'SELECT character_id FROM player_characters WHERE player_id = $1 ORDER BY character_id',
        [playerId],
      );
      return result.rows.map((row) => row.character_id);
    },
    async grant(playerId, characterId) {
      // `ON CONFLICT DO NOTHING`: conceder duas vezes é inofensivo e acontece de verdade —
      // a duplicata é o caminho normal, e uma corrida entre duas invocações não deve virar
      // erro 500 para o jogador.
      await pool.query(
        `INSERT INTO player_characters (player_id, character_id) VALUES ($1, $2)
         ON CONFLICT (player_id, character_id) DO NOTHING`,
        [playerId, characterId],
      );
    },
    async getPity(playerId, bannerId) {
      const result = await pool.query<{ rolls_since_new: number }>(
        'SELECT rolls_since_new FROM banner_pity WHERE player_id = $1 AND banner_id = $2',
        [playerId, bannerId],
      );
      const row = result.rows[0];
      return row ? row.rolls_since_new : null;
    },
    async deletePlayerData(playerId) {
      await pool.query('DELETE FROM player_characters WHERE player_id = $1', [playerId]);
      await pool.query('DELETE FROM banner_pity WHERE player_id = $1', [playerId]);
    },
    async setPity(playerId, bannerId, rollsSinceNew) {
      await pool.query(
        `INSERT INTO banner_pity (player_id, banner_id, rolls_since_new) VALUES ($1, $2, $3)
         ON CONFLICT (player_id, banner_id) DO UPDATE SET rolls_since_new = EXCLUDED.rolls_since_new`,
        [playerId, bannerId, rollsSinceNew],
      );
    },
  };
}

// §10 (M18, 4/N) — reivindicações e capítulos limpos.
export function createPostgresRewardsRepository(pool: Pool): RewardsRepository {
  return {
    async listClaims(playerId) {
      const result = await pool.query<{ reward_id: string }>(
        'SELECT reward_id FROM player_claims WHERE player_id = $1 ORDER BY reward_id',
        [playerId],
      );
      return result.rows.map((row) => row.reward_id);
    },
    async claim(playerId, rewardId) {
      // `ON CONFLICT DO NOTHING` + `rowCount` é a checagem e a escrita numa operação só: a
      // chave primária composta decide quem chegou primeiro, e duas requisições simultâneas
      // não conseguem pagar o mesmo prêmio duas vezes.
      const result = await pool.query(
        `INSERT INTO player_claims (player_id, reward_id) VALUES ($1, $2)
         ON CONFLICT (player_id, reward_id) DO NOTHING`,
        [playerId, rewardId],
      );
      return (result.rowCount ?? 0) > 0;
    },
    async listClearedChapters(playerId) {
      const result = await pool.query<{ chapter_id: string }>(
        'SELECT chapter_id FROM campaign_clears WHERE player_id = $1 ORDER BY chapter_id',
        [playerId],
      );
      return result.rows.map((row) => row.chapter_id);
    },
    async deletePlayerData(playerId) {
      await pool.query('DELETE FROM player_claims WHERE player_id = $1', [playerId]);
      await pool.query('DELETE FROM campaign_clears WHERE player_id = $1', [playerId]);
    },
    async markChapterCleared(playerId, chapterId) {
      const result = await pool.query(
        `INSERT INTO campaign_clears (player_id, chapter_id) VALUES ($1, $2)
         ON CONFLICT (player_id, chapter_id) DO NOTHING`,
        [playerId, chapterId],
      );
      return (result.rowCount ?? 0) > 0;
    },
  };
}

// §9.4 (M22, 2/N) — a resposta guardada por nonce, em Postgres.
export function createPostgresIdempotencyRepository(pool: Pool): IdempotencyRepository {
  return {
    async get(playerId, nonce) {
      const result = await pool.query<{
        player_id: string;
        nonce: string;
        route: string;
        status: number;
        body: unknown;
        created_at: Date;
      }>(
        'SELECT player_id, nonce, route, status, body, created_at FROM idempotent_responses WHERE player_id = $1 AND nonce = $2',
        [playerId, nonce],
      );
      const row = result.rows[0];
      if (!row) return null;
      return {
        playerId: row.player_id,
        nonce: row.nonce,
        route: row.route,
        status: row.status,
        body: row.body,
        createdAt: row.created_at.toISOString(),
      };
    },
    async save(entry) {
      // `ON CONFLICT DO NOTHING`: a primeira escrita vence, e duas requisições simultâneas
      // não conseguem gravar duas respostas para o mesmo nonce.
      await pool.query(
        `INSERT INTO idempotent_responses (player_id, nonce, route, status, body)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (player_id, nonce) DO NOTHING`,
        [entry.playerId, entry.nonce, entry.route, entry.status, JSON.stringify(entry.body)],
      );
    },
    async deletePlayerData(playerId) {
      await pool.query('DELETE FROM idempotent_responses WHERE player_id = $1', [playerId]);
    },
  };
}

// §9.4 (M22, sub-sessão 3/N) — o LIMITADOR COMPARTILHADO.
//
// O de memória (`battle/rateLimit.ts`) conta por processo: com duas instâncias atrás de um
// balanceador, o teto real vira o dobro do declarado. Este conta no banco, que é o mesmo
// para todos os processos.
//
// **A troca não exigiu tocar em nenhuma rota**, e isso é consequência da 3/N: nenhuma rota
// chama o limitador — quem chama é o hook `registerRateLimit`.
//
// O relógio é o do BANCO, e não o `now` injetado das opções: com vários processos, cada um
// com o seu relógio, a janela só é a mesma se o tempo vier de um lugar só.
export function createPostgresRateLimiter(pool: Pool, options: RateLimiterOptions): RateLimiter {
  const janelaSegundos = options.windowMs / 1000;
  // A limpeza é oportunista e rara: a consulta de contagem já ignora o que está fora da
  // janela (é o índice que a torna barata), então linha velha é desperdício de espaço, não
  // de corretude. Varrer a cada requisição custaria mais que o problema que resolve.
  let desdeALimpeza = 0;
  const LIMPAR_A_CADA = 500;

  return {
    async tryConsume(key) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        // **O lock consultivo por CHAVE, e por que ele é necessário.** A primeira versão
        // deste limitador contava e inseria numa instrução só, com CTE, supondo que isso
        // bastasse. Não basta: as CTEs leem o mesmo instantâneo, então vinte requisições
        // simultâneas contam ZERO cada uma e passam todas. **Medido contra Postgres de
        // verdade nesta fatia: teto de 5, e 10 passaram.**
        //
        // O lock é por jogador e dura a transação: dois jogadores nunca esperam um pelo
        // outro, e o mesmo jogador é serializado — que é exatamente o que "cota por conta"
        // quer dizer.
        await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [key]);

        const contagem = await client.query<{ n: number }>(
          `SELECT count(*)::int AS n FROM rate_limit_hits
            WHERE key = $1 AND at > now() - make_interval(secs => $2::double precision)`,
          [key, janelaSegundos],
        );

        const permitido = (contagem.rows[0]?.n ?? 0) < options.maxRequests;
        if (permitido) {
          await client.query('INSERT INTO rate_limit_hits (key, at) VALUES ($1, now())', [key]);
        }

        await client.query('COMMIT');

        if (++desdeALimpeza >= LIMPAR_A_CADA) {
          desdeALimpeza = 0;
          await pool.query(
            'DELETE FROM rate_limit_hits WHERE at < now() - make_interval(secs => $1::double precision)',
            [janelaSegundos],
          );
        }

        return permitido;
      } catch (erro) {
        await client.query('ROLLBACK').catch(() => undefined);
        throw erro;
      } finally {
        client.release();
      }
    },
  };
}
