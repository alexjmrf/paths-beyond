import type { Condition, ConditionContext } from './types.js';

// §6.3 — avalia uma única Condition contra o contexto do momento. O AND entre várias
// conditions de uma mesma linha é responsabilidade de quem chama (selectTacticsAction).
export function evaluateCondition(condition: Condition, ctx: ConditionContext): boolean {
  switch (condition.t) {
    case 'targetHpBelow':
      return ctx.target.currentHpPct < condition.pct;
    case 'targetHpAbove':
      return ctx.target.currentHpPct > condition.pct;
    case 'targetHasDebuff':
      return ctx.target.activeDebuffIds.includes(condition.debuffId);
    case 'targetHasBuff':
      return ctx.target.activeBuffIds.includes(condition.buffId);
    case 'targetIsType':
      return ctx.target.unitType === condition.type;
    case 'targetWeaponIs':
      return ctx.target.weaponType === condition.weapon;
    case 'targetPpBelow':
      return ctx.target.pp < condition.n;
    case 'selfHpBelow':
      return ctx.self.currentHpPct < condition.pct;
    case 'selfBuffAbsent':
      return !ctx.self.activeBuffIds.includes(condition.buffId);
    case 'apAtLeast':
      return ctx.self.ap >= condition.n;
    case 'ppAtLeast':
      return ctx.self.pp >= condition.n;
    case 'isAttacker':
      return ctx.isSelfAttacker;
    case 'isDefender':
      return !ctx.isSelfAttacker;
    case 'hasPositionalBonus':
      return ctx.hasPositionalBonus;
    case 'trocaAtLeast':
      return ctx.trocaNumber >= condition.n;
    case 'battleRoundAtLeast':
      return ctx.battleRound >= condition.n;
    case 'alliesAdjacentAtLeast':
      return ctx.alliesAdjacentCount >= condition.n;
    case 'not':
      return !evaluateCondition(condition.c, ctx);
  }
}
