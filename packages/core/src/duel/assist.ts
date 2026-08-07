import type { Id } from '../types.js';
import type { SkillDef } from '../skills/types.js';
import type { ConditionContext } from '../tactics/types.js';
import type { DuelEconomyState } from './economy.js';
import { selectReaction } from './reactions.js';
import type { ReactionLine } from './types.js';

// §6.5 — máximo de 2 assistências por lado, por duelo.
const MAX_ASSISTS_PER_SIDE = 2;

// §6.5.3 — dano de assistência é 50% do dano da skill; cura/buff aplicam integral
// (essa distinção é decidida por quem resolve o efeito, não aqui).
export const ASSIST_DAMAGE_MULTIPLIER = 500;

export interface AssistCandidate {
  readonly id: Id;
  readonly reactionScript: readonly ReactionLine[];
  readonly skills: Readonly<Record<Id, SkillDef>>;
  readonly economy: DuelEconomyState;
  readonly context: ConditionContext; // self = o aliado; target = o inimigo do duelo
}

export interface AssistResult {
  readonly assistantId: Id;
  readonly skillId: Id;
}

// Candidatos já vêm filtrados por alcance e ordenados por iniciativa (grid é M3) —
// aqui só decide, por ordem de prioridade, quem realmente assiste, até o teto de 2.
export function resolveAssists(candidates: readonly AssistCandidate[]): readonly AssistResult[] {
  const results: AssistResult[] = [];

  for (const candidate of candidates) {
    if (results.length >= MAX_ASSISTS_PER_SIDE) break;

    const decision = selectReaction({
      reactionScript: candidate.reactionScript,
      skills: candidate.skills,
      trigger: 'onAllyEngagedNearby',
      economy: candidate.economy,
      context: candidate.context,
    });

    if (decision.kind === 'reaction') {
      results.push({ assistantId: candidate.id, skillId: decision.skillId });
    }
  }

  return results;
}
