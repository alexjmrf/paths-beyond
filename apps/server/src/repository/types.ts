import type { BattleCommand, BattleResult, BattleSetup, Coord, Hero, ItemInstance, MapAiArchetype } from '@paths-beyond/core';

// §9.1 — "ELO, temporadas de 14 dias." 1200 é o ponto de partida clássico (Elo/xadrez),
// não um número dado pela spec — decisão registrada em DECISIONS.md (M7, sub-sessão 8).
export const DEFAULT_ELO = 1200;

// §10 — todo jogador começa sem marcas de arena; só ganha jogando PvP.
export const DEFAULT_ARENA_MARKS = 0;

export interface Player {
  readonly id: string;
  readonly token: string;
  readonly displayName: string;
  readonly elo: number;
  // §10 — "marcas de arena" é a moeda da loja de PvP (venda gear de set específico e
  // cosméticos, nunca poder bruto). Ganha em toda batalha concluída (battle/routes.ts).
  readonly arenaMarks: number;
}

export interface PlayerRepository {
  getPlayerByToken(token: string): Promise<Player | null>;
  getPlayerById(id: string): Promise<Player | null>;
  createPlayer(input: { id: string; token: string; displayName: string; elo?: number; arenaMarks?: number }): Promise<Player>;
  updateElo(id: string, elo: number): Promise<Player>;
  updateArenaMarks(id: string, arenaMarks: number): Promise<Player>;
  // Candidatos de matchmaking dentro de uma faixa de ELO, excluindo o próprio chamador —
  // "quem tem defesa configurada" é filtrado depois, na rota (cruza com
  // ArenaDefenseRepository); manter esse cruzamento fora do repositório evita acoplar
  // PlayerRepository a ArenaDefenseRepository.
  findOpponentsNearElo(input: { excludePlayerId: string; eloMin: number; eloMax: number }): Promise<readonly Player[]>;
  // §9.1 — soft-reset de ELO no início de uma temporada nova (season/lifecycle.ts) precisa
  // tocar todo jogador, não só um.
  listAll(): Promise<readonly Player[]>;
}

// §9.1 — "ELO, temporadas de 14 dias." Uma linha por temporada; `seasonNumber` é
// sequencial a partir de 1. `endsAt` é sempre `startedAt + 14 dias` — guardado explícito
// (em vez de recalculado sempre a partir de `startedAt`) pra o rollover (season/
// lifecycle.ts) só precisar comparar contra `now()`, sem reimplementar a soma em todo
// lugar que lê a temporada atual.
export interface Season {
  readonly id: string;
  readonly seasonNumber: number;
  readonly startedAt: string; // ISO 8601
  readonly endsAt: string; // ISO 8601
}

export interface SeasonRepository {
  getCurrentSeason(): Promise<Season | null>;
  createSeason(season: Season): Promise<Season>;
}

// §9.4 — "servidor recalcula stat sheets a partir do inventário no banco; nunca aceita
// stats do cliente." `StoredHero` é a fonte de verdade server-side; o cliente só manda
// ids (heroId), nunca stats resolvidos.
export interface StoredHero {
  readonly ownerPlayerId: string;
  readonly hero: Hero;
  readonly equippedItems: readonly ItemInstance[];
}

export interface HeroRepository {
  getHeroById(heroId: string): Promise<StoredHero | null>;
  getHeroesByIds(heroIds: readonly string[]): Promise<readonly StoredHero[]>;
  createHero(input: StoredHero): Promise<StoredHero>;
  // §10 — comprar na loja de arena reequipa um herói já existente (troca o item do slot
  // correspondente); nenhum fluxo precisava atualizar um herói salvo até agora.
  updateHero(input: StoredHero): Promise<StoredHero>;
}

// §9.1 — "o defensor monta um time de até 5 heróis, posiciona-os... define tacticsScript
// de cada um e uma IA de mapa declarativa por herói." Uma unidade de defesa referencia um
// heroId (o tacticsScript já mora no próprio Hero) + onde/como ela é IA.
export interface ArenaDefenseUnit {
  readonly heroId: string;
  readonly pos: Coord;
  readonly height: 0 | 1 | 2 | 3;
  readonly aiArchetype: MapAiArchetype;
}

export interface ArenaDefense {
  readonly ownerPlayerId: string;
  readonly mapId: string;
  readonly units: readonly ArenaDefenseUnit[];
}

export interface ArenaDefenseRepository {
  getDefenseByOwner(ownerPlayerId: string): Promise<ArenaDefense | null>;
  saveDefense(defense: ArenaDefense): Promise<ArenaDefense>;
}

// §9.4 — "anti-replay: nonce por partida" + "replays" (roadmap de M7, sub-sessão 9): o
// `nonce` (gerado pelo cliente, único por tentativa de batalha) dobra como chave de
// idempotência (uma batalha só roda uma vez, mesmo se a requisição for reenviada) E como
// id do replay persistido — os dois problemas compartilham a mesma necessidade de
// identidade única por tentativa, então uma única tabela resolve ambos.
export interface StoredReplay {
  readonly nonce: string;
  readonly rulesVersion: string;
  readonly seed: number;
  readonly initialState: BattleSetup;
  readonly commands: readonly BattleCommand[];
  readonly result: BattleResult;
  readonly attackerPlayerId: string;
  readonly defenderPlayerId: string;
  readonly createdAt: string; // ISO 8601
}

export interface ReplayRepository {
  getByNonce(nonce: string): Promise<StoredReplay | null>;
  save(replay: StoredReplay): Promise<StoredReplay>;
}
