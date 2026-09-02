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

// M17, sub-sessão 2/N — `TalentTree` ('class' | 'spec') e `TalentNode` (com `tree`,
// `requires` e `exclusiveWith`) FORAM REMOVIDOS daqui. A topologia de duas árvores por
// classe deixou de existir com §8.1: a árvore é do personagem, tem duas colunas, e mora
// em `columnTree.ts` como `ColumnTalentTree`/`ColumnTalentNode`.
//
// O §7 do briefing do M17 é explícito em não manter os dois modelos convivendo "por
// compatibilidade" — o formato antigo sai, e alocação salva nele não é migrada (D5).
//
// `TalentEffect` fica: a lista de 12 efeitos SOBREVIVEU à mudança de forma sem uma
// alteração, e é por isso que ela nunca esteve em jogo neste milestone.

// Decisão registrada em DECISIONS.md (M1): Record<TalentNodeId, rank>; ausência = rank 0.
export type TalentAllocation = Readonly<Record<Id, number>>;
