import type { Id } from '../types.js';
import type { StatKey } from '../stats/types.js';

// §7.1
export type GearSlot = 'weapon' | 'helmet' | 'armor' | 'necklace' | 'ring' | 'boots';
// §7.2 — "substats iniciais: 1/2/3/4"
export type Rarity = 'common' | 'rare' | 'heroic' | 'epic';

// §7.3 — decisão registrada em DECISIONS.md: só existem estes 6 marcos; não há níveis
// +1/+2/+4... individuais.
export const ENHANCE_MILESTONES = [0, 3, 6, 9, 12, 15] as const;
export type EnhanceLevel = (typeof ENHANCE_MILESTONES)[number];

// §7.2 — ItemInstance, cópia própria do core (regra 1: core não importa de packages/data).
export interface ItemInstance {
  readonly id: Id;
  readonly setId: Id;
  readonly slot: GearSlot;
  readonly rarity: Rarity;
  readonly ilvl: number;
  readonly mainstat: { readonly stat: StatKey; readonly value: number };
  readonly substats: readonly { readonly stat: StatKey; readonly value: number; readonly rolls: number }[];
  readonly enhance: EnhanceLevel;
  readonly lockedBy?: Id;
  readonly reforged: boolean;
}

// §7.4 — ItemSet, cópia própria do core (mirror de packages/data/schemas/item-sets.schema.ts).
export type SetEffect =
  | { readonly t: 'stat'; readonly pieces: 2 | 4; readonly stat: StatKey; readonly flat?: number; readonly pct?: number }
  | { readonly t: 'special'; readonly pieces: 2 | 4; readonly effectId: Id; readonly description: string };

export interface ItemSet {
  readonly id: Id;
  readonly name: string;
  readonly effects: readonly SetEffect[];
}

export interface ValueRange {
  readonly min: number;
  readonly max: number;
}

// §7.3 — peso e faixa de valor de um substat elegível; "Substats vêm de
// data/items/substat-weights.json. Nunca hardcoded."
export interface SubstatWeightEntry {
  readonly stat: StatKey;
  readonly weight: number;
  readonly valueRange: ValueRange;
  readonly reforgeBonusPct?: number; // §7.3 — "bônus fixo garantido em todos os substats"
}

// Pesos de mainstat por slot — só necklace/ring/boots escolhem (weapon/helmet/armor têm
// mainstat fixo por §7.1, mas ainda usam a faixa de valor declarada aqui).
export interface MainstatWeightEntry {
  readonly slot: GearSlot;
  readonly stat: StatKey;
  readonly weight: number;
  readonly valueRange: ValueRange;
}

// §7.3 — as 5 chances de sucesso (uma por marco de enhance), 100% dado (ver DECISIONS.md).
export interface EnhanceRates {
  readonly toThree: number; // fp-scale — chance de +0 → +3
  readonly toSix: number;
  readonly toNine: number;
  readonly toTwelve: number;
  readonly toFifteen: number;
}
