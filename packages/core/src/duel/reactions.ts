import type { Id } from '../types.js';
import type { SkillDef, ReactionTrigger } from '../skills/types.js';
import { evaluateCondition } from '../tactics/evaluateCondition.js';
import type { ConditionContext } from '../tactics/types.js';
import { canAffordPp, type DuelEconomyState } from './economy.js';
import type { ReactionLine } from './types.js';

export interface SelectReactionInput {
  readonly reactionScript: readonly ReactionLine[];
  readonly skills: Readonly<Record<Id, SkillDef>>;
  readonly trigger: ReactionTrigger;
  readonly economy: DuelEconomyState;
  readonly context: ConditionContext;
}

export type ReactionDecision =
  | { readonly kind: 'reaction'; readonly skillId: Id; readonly lineIndex: number }
  | { readonly kind: 'none' };

// Generaliza o algoritmo literal de §6.3 para reações: mesma estrutura (ordem, AND de
// conditions, primeira linha que bate vence), mas o gate é o trigger da skill + PP
// (nunca AP — reações não custam AP) em vez de cooldown/teto de AP do duelo.
export function selectReaction(input: SelectReactionInput): ReactionDecision {
  const { reactionScript, skills, trigger, economy, context } = input;

  for (let i = 0; i < reactionScript.length; i++) {
    const line = reactionScript[i];
    if (!line || !line.enabled) continue;

    const skill = skills[line.skillId];
    if (!skill || skill.trigger !== trigger) continue;
    if (!canAffordPp(economy, skill.ppCost ?? 0)) continue;

    const allConditionsPass = line.conditions.every((condition) => evaluateCondition(condition, context));
    if (allConditionsPass) {
      return { kind: 'reaction', skillId: line.skillId, lineIndex: i };
    }
  }

  return { kind: 'none' };
}
