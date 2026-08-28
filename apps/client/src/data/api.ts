import type { BattleCommand, BattleResult, BattleSetup, Hero, ItemInstance, MapAiArchetype } from '@paths-beyond/core';

// M13, sub-sessão 2/N — a camada de rede do cliente. Até aqui o cliente **não tinha um
// `fetch` sequer**: o servidor de M7 existia e ninguém falava com ele.
//
// Caminho relativo `/api/...` de propósito: o Vite encaminha pro servidor em dev
// (vite.config.ts) e em produção o mesmo caminho vale atrás de qualquer proxy. Sem isso
// seria origem cruzada e a chamada morreria no CORS.
//
// Nada aqui interpreta regra de jogo — só transporta. Quem simula é `packages/core`, dos
// dois lados (regra 3).

const BASE = '/api';

// §9.4 — auth por token opaco no header `x-player-token` (stub decidido em M7). O cliente
// não inventa sistema de contas: o jogador informa o token na tela de PvP.
export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

async function request<T>(token: string, path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      'content-type': 'application/json',
      'x-player-token': token,
      ...(init?.headers ?? {}),
    },
  });

  const text = await response.text();
  const body = text ? (JSON.parse(text) as unknown) : null;
  if (!response.ok) {
    const message = (body as { error?: string } | null)?.error ?? `erro ${response.status}`;
    throw new ApiError(response.status, message);
  }
  return body as T;
}

export interface PlayerInfo {
  readonly id: string;
  readonly displayName: string;
  readonly elo: number;
  readonly arenaMarks: number;
}

export interface OpponentInfo {
  readonly playerId: string;
  readonly displayName: string;
  readonly elo: number;
  readonly mapId?: string;
}

export interface RosterEntry {
  readonly hero: Hero;
  readonly equippedItems: readonly ItemInstance[];
}

// O "ticket de batalha" (§9.1/§9.4): o confronto montado e a seed, ANTES de jogar. Ver
// `apps/server/src/battle/ticket.ts`.
export interface BattleTicket {
  readonly nonce: string;
  readonly seed: number;
  readonly rulesVersion: string;
  readonly setup: BattleSetup;
  readonly defenderPlayerId: string;
}

// §9.1 (M15, sub-sessão 3/N) — o time que defende o castelo do jogador enquanto ele está
// offline. `PUT /me/defense` existe no servidor desde M7 e NENHUMA linha de cliente jamais
// o chamou: era a razão de o PvP assíncrono inteiro ser inalcançável sem `curl`.
export interface ArenaDefenseUnit {
  readonly heroId: string;
  readonly pos: { readonly x: number; readonly y: number };
  readonly height: 0 | 1 | 2 | 3;
  readonly aiArchetype: MapAiArchetype;
}

export interface ArenaDefense {
  readonly ownerPlayerId: string;
  readonly mapId: string;
  readonly units: readonly ArenaDefenseUnit[];
}

export interface BattleOutcomeResponse {
  readonly seed: number;
  readonly result: BattleResult;
  readonly elo?: { readonly attacker: number; readonly defender: number };
  readonly arenaMarks?: { readonly attacker: number; readonly defender: number };
}

export interface StoredReplayResponse {
  readonly nonce: string;
  readonly rulesVersion: string;
  readonly seed: number;
  readonly initialState: BattleSetup;
  readonly commands: readonly BattleCommand[];
  readonly result: BattleResult;
  readonly attackerPlayerId: string;
  readonly defenderPlayerId: string;
  readonly createdAt: string;
}

// §10 (M14, sub-sessão 5/N) — a economia PvE. O servidor já resolve a disponibilidade de
// cada masmorra (trancada, sem energia, varredura liberada); o cliente só desenha o que
// recebe (regra 3).
export interface EconomySnapshot {
  readonly energy: { readonly stored: number; readonly asOfMs: number };
  readonly energyMax: number;
  readonly wallet: { readonly gold: number; readonly stones: number; readonly arenaMarks: number };
  readonly materials: Readonly<Record<string, number>>;
  readonly inventory: readonly ItemInstance[];
  readonly clearedDungeons: readonly string[];
}

export interface DungeonListEntry {
  readonly id: string;
  readonly name: string;
  readonly focus: 'gear' | 'exp' | 'gold' | 'boss';
  readonly difficulty: 'normal' | 'elite';
  readonly energyCost: number;
  readonly manualOnly: boolean;
  readonly cleared: boolean;
  readonly sweepAvailable: boolean;
  readonly lockedBy: string | null;
  readonly entriesLeft: number | null;
  readonly enoughEnergy: boolean;
}

export interface DungeonTicket {
  readonly nonce: string;
  readonly seed: number;
  readonly rulesVersion: string;
  readonly setup: BattleSetup;
  readonly dungeonId: string;
}

export interface DungeonRunRewards {
  readonly gold: number;
  readonly exp: number;
  readonly stones: number;
  readonly items: readonly ItemInstance[];
  readonly materials: Readonly<Record<string, number>>;
}

export interface DungeonRunResponse {
  readonly outcome: 'victory' | 'defeat';
  readonly roundsPlayed: number;
  readonly rewards: DungeonRunRewards | null;
  readonly energy: { readonly stored: number; readonly asOfMs: number };
}

export interface EnhanceResponse {
  readonly success: boolean;
  readonly item: ItemInstance;
  readonly cost: { readonly gold: number; readonly stones: number };
  readonly wallet: { readonly gold: number; readonly stones: number; readonly arenaMarks: number };
}

export interface EquipResponse {
  readonly hero: Hero;
  readonly equippedItems: readonly ItemInstance[];
  readonly unequipped: ItemInstance | null;
}

// O nonce é do CLIENTE, como no PvP: ele é a chave de idempotência (um reenvio de rede não
// pode cobrar duas vezes) e, no caso da masmorra, também o que deriva a seed no servidor.
function nonce(): string {
  return crypto.randomUUID();
}

export const api = {
  me: (token: string) => request<PlayerInfo>(token, '/me'),
  roster: (token: string) => request<readonly RosterEntry[]>(token, '/me/heroes'),
  findOpponent: (token: string) => request<OpponentInfo>(token, '/matchmaking/opponent'),

  // 404 = "ainda não montei defesa", que é estado normal e não erro: quem chama trata.
  defense: (token: string) => request<ArenaDefense>(token, '/me/defense'),

  saveDefense: (token: string, mapId: string, units: readonly ArenaDefenseUnit[]) =>
    request<ArenaDefense>(token, '/me/defense', { method: 'PUT', body: JSON.stringify({ mapId, units }) }),

  requestTicket: (token: string, attackerHeroIds: readonly string[], defenderPlayerId: string) =>
    request<BattleTicket>(token, '/battles/ticket', {
      method: 'POST',
      body: JSON.stringify({ attackerHeroIds, defenderPlayerId }),
    }),

  submitBattle: (
    token: string,
    body: {
      readonly attackerHeroIds: readonly string[];
      readonly defenderPlayerId: string;
      readonly commands: readonly BattleCommand[];
      readonly rulesVersion: string;
      readonly nonce: string;
    },
  ) => request<BattleOutcomeResponse>(token, '/battles', { method: 'POST', body: JSON.stringify(body) }),

  fetchReplay: (token: string, replayNonce: string) => request<StoredReplayResponse>(token, `/battles/${replayNonce}`),

  economy: (token: string) => request<EconomySnapshot>(token, '/me/economy'),

  dungeons: (token: string) => request<{ readonly dungeons: readonly DungeonListEntry[] }>(token, '/dungeons'),

  requestDungeonTicket: (token: string, dungeonId: string, heroIds: readonly string[]) =>
    request<DungeonTicket>(token, `/dungeons/${dungeonId}/ticket`, {
      method: 'POST',
      body: JSON.stringify({ heroIds }),
    }),

  submitDungeonRun: (
    token: string,
    dungeonId: string,
    body: {
      readonly nonce: string;
      readonly heroIds: readonly string[];
      readonly commands?: readonly BattleCommand[];
      readonly auto?: boolean;
    },
  ) => request<DungeonRunResponse>(token, `/dungeons/${dungeonId}/run`, { method: 'POST', body: JSON.stringify(body) }),

  sweepDungeon: (token: string, dungeonId: string, heroIds: readonly string[]) =>
    request<DungeonRunResponse>(token, `/dungeons/${dungeonId}/run`, {
      method: 'POST',
      body: JSON.stringify({ nonce: nonce(), heroIds, auto: true }),
    }),

  enhanceItem: (token: string, itemId: string, heroId?: string) =>
    request<EnhanceResponse>(token, `/items/${itemId}/enhance`, {
      method: 'POST',
      body: JSON.stringify({ nonce: nonce(), ...(heroId ? { heroId } : {}) }),
    }),

  equipItem: (token: string, heroId: string, itemId: string) =>
    request<EquipResponse>(token, `/heroes/${heroId}/equip`, {
      method: 'POST',
      body: JSON.stringify({ nonce: nonce(), itemId }),
    }),

  awakenHero: (token: string, heroId: string) =>
    request<{ readonly hero: Hero; readonly wallet: EconomySnapshot['wallet']; readonly materials: Readonly<Record<string, number>> }>(
      token,
      `/heroes/${heroId}/awaken`,
      { method: 'POST', body: JSON.stringify({ nonce: nonce() }) },
    ),

  imprintHero: (token: string, heroId: string) =>
    request<{ readonly hero: Hero; readonly materials: Readonly<Record<string, number>> }>(
      token,
      `/heroes/${heroId}/imprint`,
      { method: 'POST', body: JSON.stringify({ nonce: nonce() }) },
    ),
};
