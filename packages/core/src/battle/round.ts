import { computePeriodicEffects } from '../duel/effects.js';
import type { ActiveEffect, EffectDef } from '../duel/types.js';
import type { Id } from '../types.js';
import type { BattleState, BattleUnit } from './types.js';

export function isRoundComplete(state: BattleState): boolean {
  return state.units.every((unit) => unit.hp <= 0 || unit.hasActedThisRound);
}

function decrementCooldowns(cooldowns: Readonly<Record<string, number>>): Record<string, number> {
  const next: Record<string, number> = {};
  for (const [skillId, remaining] of Object.entries(cooldowns)) {
    next[skillId] = Math.max(0, remaining - 1);
  }
  return next;
}

// §5.3 — só a duração numérica (rounds de mapa) ticka; 'duel' e 'battle' persistem até
// dispelados.
function tickEffects(effects: readonly ActiveEffect[]): readonly ActiveEffect[] {
  const next: ActiveEffect[] = [];
  for (const effect of effects) {
    if (typeof effect.duration !== 'number') {
      next.push(effect);
      continue;
    }
    const remaining = effect.duration - 1;
    if (remaining > 0) next.push({ ...effect, duration: remaining });
  }
  return next;
}

// §6.9 — DoT/regeneração calculados a partir dos efeitos ativos ANTES do tick de duração
// (um efeito que expira neste round ainda causa seu último tick), aplicados a `hp` em
// lote no fim do round (decisão de sessão, M10 — ver DECISIONS.md; §5.3 já trata o tick de
// duração/cooldown assim, e §6.9 não exige literalmente o oposto). Regen não se aplica a
// uma unidade que o próprio DoT deste tick derrubou a 0.
function applyPeriodicHp(unit: BattleUnit, effectDefs: Readonly<Record<Id, EffectDef>>): number {
  const { damage, heal } = computePeriodicEffects(unit.effects, effectDefs, unit.stats.hp);
  const afterDamage = Math.max(0, unit.hp - damage);
  if (afterDamage <= 0) return afterDamage;
  return Math.min(unit.stats.hp, afterDamage + heal);
}

// §5.3 — "O round termina quando todas as unidades vivas agiram. Então
// hasActedThisRound reseta, cooldowns de mapa decrementam, e efeitos com duração em
// rounds tickam." + §5.6 ("+1 por round" de Valor) + §6.9 (DoT/regeneração).
export function endRound(state: BattleState): BattleState {
  const units: readonly BattleUnit[] = state.units.map((unit) => {
    if (unit.hp <= 0) return unit;
    return {
      ...unit,
      hp: applyPeriodicHp(unit, state.effectDefs),
      hasActedThisRound: false,
      cooldowns: decrementCooldowns(unit.cooldowns),
      effects: tickEffects(unit.effects),
    };
  });

  return {
    ...state,
    units,
    round: state.round + 1,
    valor: state.valor + 1,
    distanceMovedThisTurn: {},
    // §7.4 Sentinela — a janela de assistência gratuita é "uma vez por round de mapa".
    freeAssistUsedThisRound: [],
  };
}

// §5.7 — só `rout` (eliminação do time inimigo) é resolvido em M3; `seize`,
// `surviveRounds`, `escort` e `defend` têm schema mas não checagem (ver DECISIONS.md).
export function checkWinCondition(state: BattleState): 'ongoing' | 'victory' | 'defeat' {
  const playerAlive = state.units.some((u) => u.side === 'player' && u.hp > 0);
  const enemyAlive = state.units.some((u) => u.side === 'enemy' && u.hp > 0);

  if (!enemyAlive) return 'victory';
  if (!playerAlive) return 'defeat';
  return 'ongoing';
}
