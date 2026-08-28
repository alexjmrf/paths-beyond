import type { SkillDef } from '../skills/types.js';
import type { StatKey } from '../stats/types.js';
import type { Id } from '../types.js';

// §8.2 — TalentEffect, união literal completa dada pela spec.
export type TalentEffect =
  | { readonly t: 'stat'; readonly stat: StatKey; readonly flat?: number; readonly pct?: number }
  | { readonly t: 'grantSkill'; readonly skillId: Id }
  | { readonly t: 'grantReaction'; readonly reactionId: Id }
  | { readonly t: 'modifySkill'; readonly skillId: Id; readonly patch: Partial<SkillDef> }
  | { readonly t: 'extraTacticsSlot' }
  | { readonly t: 'extraTacticsCondition' }
  | { readonly t: 'maxAp'; readonly n: number }
  | { readonly t: 'maxPp'; readonly n: number }
  | { readonly t: 'apRefund'; readonly on: 'kill' | 'duelWon' | 'assist'; readonly n: number }
  | { readonly t: 'duelApCap'; readonly n: number }
  | { readonly t: 'assistRangeBonus'; readonly n: number }
  | { readonly t: 'passive'; readonly passiveId: Id };

export type TalentTree = 'class' | 'spec';

// §8.2 — TalentNode, cópia própria do core (regra 1). O schema completo já existe em
// packages/data/schemas/classes.schema.ts (M1); core nunca tinha seu próprio tipo até M5.
export interface TalentNode {
  readonly id: Id;
  readonly tree: TalentTree;
  readonly row: number; // 1..8
  readonly requires?: readonly Id[];
  readonly exclusiveWith?: readonly Id[];
  readonly maxRank: 1 | 2 | 3;
  // §10 (M14) — "Awakening (0–6): ... libera nós avançados de talento a partir de 5."
  // Qual nó é "avançado" e a partir de qual rank é conteúdo, não motor.
  readonly minAwakening?: number;
  readonly effects: readonly TalentEffect[];
}

// Decisão registrada em DECISIONS.md (M1): Record<TalentNodeId, rank>; ausência = rank 0.
export type TalentAllocation = Readonly<Record<Id, number>>;
