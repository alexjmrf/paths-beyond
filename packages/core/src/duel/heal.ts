import { fpMul, FP_SCALE } from '../math/fixed.js';
import type { SkillDef } from '../skills/types.js';
import type { StatSheet } from '../stats/types.js';

// §6.5.3/§6.4/§4.1 (M10, sub-sessão 7/N) — a spec NÃO define fórmula de cura: §2 lista
// `heal` como "cura dada/recebida, %", §6.4 cita "Cura de emergência" entre as reações que
// classes e talentos adicionam, e §6.5.3 diz que a assistência aplica "cura/buff em efeito
// integral" sem dizer integral de quê. A fórmula aqui é decisão de design tomada com o
// usuário (ver DECISIONS.md, "M10 — sub-sessão 7/N").

// Uma skill CURA em vez de causar dano quando declara esta tag. Convenção de dado, não
// campo novo em SkillDef — mesmo precedente de `combinedTypeDamageMultiplier`, que já
// interpreta `skillTags` ('physical', 'armored'...) dentro do motor.
export const HEAL_TAG = 'heal';

export function isHealingSkill(skill: SkillDef): boolean {
  return skill.tags.includes(HEAL_TAG);
}

// `skill.scalesWith` resolvido contra um StatSheet inteiro. computeDamage recebe atk/def/hp
// como campos soltos (§6.6 precisa dos três para outros passos), então esta versão não
// existia; a cura só precisa de um stat, e quem chama sempre tem o sheet efetivo em mãos.
export function scalingStatOf(stats: StatSheet, scalesWith: 'atk' | 'def' | 'hp'): number {
  switch (scalesWith) {
    case 'atk':
      return stats.atk;
    case 'def':
      return stats.def;
    case 'hp':
      return stats.hp;
  }
}

export interface HealSkillInput {
  readonly multiplier: number; // fp-scale
  readonly flat: number;
}

export interface HealInput {
  // Stat do CURADOR já escolhido por `skill.scalesWith` pelo chamador (mesma divisão de
  // trabalho de computeDamage: aqui só a matemática pura).
  readonly healerStat: number;
  readonly skill: HealSkillInput;
  // §2 — `heal` de quem cura, fp-scale. A spec chama o stat de "cura dada/recebida", mas
  // ele entra UMA vez, do lado de quem cura: aplicá-lo também do lado de quem recebe
  // dobraria o mesmo stat na mesma conta (decisão registrada em DECISIONS.md).
  readonly healerHeal: number;
}

// Mesma forma dos passos 1-2 de §6.6, e nada além: sem mitigação por `def` (mitigar cura
// não significa nada), sem triângulo de armas, sem posicional, e sem crítico nem variância
// — cura é determinística por decisão do usuário, alinhada ao pilar de previsibilidade.
export function computeHeal(input: HealInput): number {
  const base = fpMul(input.healerStat, input.skill.multiplier) + input.skill.flat;
  const afterHealStat = fpMul(base, FP_SCALE + input.healerHeal);
  return Math.max(0, afterHealStat); // cura nunca vira dano, por mais negativo que `heal` seja
}

// §6.9 — cura não passa do HP máximo e NÃO ressuscita: um alvo em 0 continua em 0. Mesmo
// precedente já adotado por `applyPeriodicHp` (battle/round.ts) para regeneração.
export function applyHeal(currentHp: number, maxHp: number, heal: number): number {
  if (currentHp <= 0) return currentHp;
  return Math.min(maxHp, currentHp + heal);
}
