import type { Id } from '../types.js';
import type { SkillDef } from '../skills/types.js';
import { evaluateCondition } from './evaluateCondition.js';
import type { ConditionContext, TacticsScript } from './types.js';

// §6.2 — teto duro: uma unidade não pode gastar mais de 2 AP em um mesmo duelo.
const DUEL_AP_CAP = 2;

export interface SelectTacticsActionInput {
  readonly script: TacticsScript;
  readonly skills: Readonly<Record<Id, SkillDef>>;
  readonly cooldowns: Readonly<Record<Id, number>>; // rounds de mapa restantes, por skill
  readonly apSpentThisDuel: number;
  readonly context: ConditionContext;
}

export type TacticsDecision =
  | { readonly kind: 'skill'; readonly skillId: Id; readonly lineIndex: number }
  | { readonly kind: 'basicAttack' };

// §6.3 — algoritmo literal. "não pode agir" (sem alcance etc.) é decidido por quem chama
// esta função *antes* de chamá-la — não há ramo aqui para isso.
export function selectTacticsAction(input: SelectTacticsActionInput): TacticsDecision {
  const { script, skills, cooldowns, apSpentThisDuel, context } = input;

  for (let i = 0; i < script.length; i++) {
    const line = script[i];
    if (!line || !line.enabled) continue;

    const skill = skills[line.skillId];
    if (!skill) continue;

    if ((cooldowns[line.skillId] ?? 0) > 0) continue;
    if (context.self.ap < skill.apCost) continue;
    if (apSpentThisDuel + skill.apCost > DUEL_AP_CAP) continue;
    if (skill.kind === 'reaction' && context.self.pp < (skill.ppCost ?? 0)) continue;

    const allConditionsPass = line.conditions.every((condition) => evaluateCondition(condition, context));
    if (allConditionsPass) {
      return { kind: 'skill', skillId: line.skillId, lineIndex: i };
    }
  }

  return { kind: 'basicAttack' };
}
