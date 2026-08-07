import { fpDiv, fpMul, FP_SCALE } from '../math/fixed.js';
import type { StatSheet } from '../stats/types.js';

// §7.5 — "Nunca usada dentro da simulação", mas continua usando os helpers de fp-scale
// por consistência com o resto do core (regra 2 do CLAUDE.md não abre exceção para CP).
export function computeCombatPower(stats: StatSheet): number {
  const base = fpMul(stats.atk, 1600) + fpMul(stats.def, 2200) + fpMul(stats.hp, 300);

  const critFactor = FP_SCALE + fpMul(stats.chc, stats.chd);
  const spdFactor = FP_SCALE + fpDiv(stats.spd, 4000);
  const resourceFactor = FP_SCALE + fpDiv(stats.focus, 1200) + fpDiv(stats.vigor, 1500);
  const effFactor = FP_SCALE + fpDiv(stats.eff, 2000) + fpDiv(stats.efr, 2000);

  let cp = fpMul(base, critFactor);
  cp = fpMul(cp, spdFactor);
  cp = fpMul(cp, resourceFactor);
  cp = fpMul(cp, effFactor);
  return cp;
}
