import type { SkillDef } from '../skills/types.js';
import type { StatModifier } from '../stats/types.js';
import type { Id } from '../types.js';
import type { ColumnTalentNode } from './columnTree.js';
import type { TalentAllocation } from './types.js';

export interface ApRefundRule {
  readonly on: 'kill' | 'duelWon' | 'assist';
  readonly n: number;
}

// StatModifier[] sai pronto para os passos 5/6 de aggregateStatSheet (M1) — o chamador só
// separa por flat/pct como já faz internamente.
export interface ResolvedTalents {
  readonly statMods: readonly StatModifier[];
  readonly grantedSkillIds: readonly Id[];
  readonly grantedReactionIds: readonly Id[];
  readonly skillPatches: Readonly<Record<Id, Partial<SkillDef>>>;
  readonly maxApBonus: number;
  readonly maxPpBonus: number;
  readonly duelApCapBonus: number;
  readonly assistRangeBonus: number;
  readonly extraTacticsSlots: number;
  readonly extraTacticsConditions: number;
  readonly passiveIds: readonly Id[];
  readonly apRefundRules: readonly ApRefundRule[];
}

// §8.2 — agrega os TalentEffect de todos os nós alocados. Efeitos numéricos (`stat`,
// `maxAp`, `maxPp`, `apRefund`, `duelApCap`, `assistRangeBonus`) escalam pelo rank
// alocado (decisão registrada em DECISIONS.md); efeitos não-numéricos (`grantSkill`,
// `grantReaction`, `passive`, `modifySkill`, `extraTacticsSlot/Condition`) aplicam uma
// vez, independente do rank. Nós desconhecidos/rank 0 são ignorados silenciosamente —
// validar a alocação é trabalho de `validateAllocation`, não deste resolver.
export function resolveTalentEffects(tree: readonly ColumnTalentNode[], allocation: TalentAllocation): ResolvedTalents {
  const nodesById = new Map(tree.map((node) => [node.id, node] as const));

  const statMods: StatModifier[] = [];
  const grantedSkillIds: Id[] = [];
  const grantedReactionIds: Id[] = [];
  const skillPatches: Record<Id, Partial<SkillDef>> = {};
  const passiveIds: Id[] = [];
  const apRefundRules: ApRefundRule[] = [];
  let maxApBonus = 0;
  let maxPpBonus = 0;
  let duelApCapBonus = 0;
  let assistRangeBonus = 0;
  let extraTacticsSlots = 0;
  let extraTacticsConditions = 0;

  for (const [nodeId, rank] of Object.entries(allocation)) {
    if (rank <= 0) continue;
    const node = nodesById.get(nodeId);
    if (!node) continue;

    for (const effect of node.effects) {
      switch (effect.t) {
        case 'stat':
          statMods.push({
            stat: effect.stat,
            flat: effect.flat !== undefined ? effect.flat * rank : undefined,
            pct: effect.pct !== undefined ? effect.pct * rank : undefined,
          });
          break;
        case 'grantSkill':
          grantedSkillIds.push(effect.skillId);
          break;
        case 'grantReaction':
          grantedReactionIds.push(effect.reactionId);
          break;
        case 'modifySkill':
          skillPatches[effect.skillId] = { ...(skillPatches[effect.skillId] ?? {}), ...effect.patch };
          break;
        case 'extraTacticsSlot':
          extraTacticsSlots += 1;
          break;
        case 'extraTacticsCondition':
          extraTacticsConditions += 1;
          break;
        case 'maxAp':
          maxApBonus += effect.n * rank;
          break;
        case 'maxPp':
          maxPpBonus += effect.n * rank;
          break;
        case 'apRefund':
          apRefundRules.push({ on: effect.on, n: effect.n });
          break;
        case 'duelApCap':
          duelApCapBonus += effect.n * rank;
          break;
        case 'assistRangeBonus':
          assistRangeBonus += effect.n * rank;
          break;
        case 'passive':
          passiveIds.push(effect.passiveId);
          break;
      }
    }
  }

  return {
    statMods,
    grantedSkillIds,
    grantedReactionIds,
    skillPatches,
    maxApBonus,
    maxPpBonus,
    duelApCapBonus,
    assistRangeBonus,
    extraTacticsSlots,
    extraTacticsConditions,
    passiveIds,
    apRefundRules,
  };
}
