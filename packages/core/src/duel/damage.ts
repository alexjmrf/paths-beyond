import { fpDiv, fpMul, fpPct, FP_SCALE } from '../math/fixed.js';

const PEN_CAP = 700; // §4.1 — Penetração de defesa, cap 700
const CHC_CAP = 1000; // §4.1 — Chance de crítico, cap 1000

export interface DamageSkillInput {
  readonly multiplier: number; // fp-scale
  readonly flat: number;
  readonly scalesWith: 'atk' | 'def' | 'hp';
}

// §6.6 — todo campo já resolvido pelo chamador: computeDamage é só a matemática pura dos
// 10 passos. Rolagens de crítico/variância e a soma de buffs/triângulo/posicional vêm
// de fora (rollCritRoll/isCriticalHit/rollDamageVariance aqui; triangle.ts; effects.ts;
// posicional é externo — grid é M3).
export interface DamageInput {
  readonly attackerAtk: number;
  readonly attackerDef: number;
  readonly attackerHp: number;
  readonly defenderDef: number;
  readonly skill: DamageSkillInput;
  readonly attackerPen: number;
  readonly typeDamageMultiplier: number; // combinedTypeDamageMultiplier (passo 5)
  readonly positionalMultiplier: number; // externo (passo 6)
  readonly isCriticalHit: boolean; // já decidido (passo 7)
  readonly criticalDamageMultiplier: number; // chd do atacante, fp-scale
  readonly damageDealtPctSum: number; // Σ%dano dos buffs ativos do atacante (passo 8)
  readonly damageTakenReductionPctSum: number; // Σ%redução dos buffs ativos do defensor (passo 8)
  readonly varianceRoll: number; // já rolado, 970..1030 (passo 9)
}

function scalingStat(input: DamageInput): number {
  switch (input.skill.scalesWith) {
    case 'atk':
      return input.attackerAtk;
    case 'def':
      return input.attackerDef;
    case 'hp':
      return input.attackerHp;
  }
}

export function computeDamage(input: DamageInput): number {
  const base = fpMul(scalingStat(input), input.skill.multiplier) + input.skill.flat; // 1

  const pen = Math.min(input.attackerPen, PEN_CAP);
  const defEfetiva = fpPct(input.defenderDef, FP_SCALE - pen); // 2

  // defEfetiva * 300 sem operador `*` cru: fpMul(defEfetiva, 300000) = trunc(defEfetiva*300000/1000) = defEfetiva*300.
  const mitigacao = fpDiv(300000, 300000 + fpMul(defEfetiva, 300000)); // 3
  const posMitig = fpMul(base, mitigacao); // 4

  const afterType = fpMul(posMitig, input.typeDamageMultiplier); // 5
  const afterPositional = fpMul(afterType, input.positionalMultiplier); // 6

  const critMultiplier = input.isCriticalHit ? input.criticalDamageMultiplier : FP_SCALE;
  const afterCrit = fpMul(afterPositional, critMultiplier); // 7

  const afterDamageDealtBuff = fpMul(afterCrit, FP_SCALE + input.damageDealtPctSum);
  const afterBuffs = fpMul(afterDamageDealtBuff, FP_SCALE - input.damageTakenReductionPctSum); // 8

  const afterVariance = fpMul(afterBuffs, input.varianceRoll); // 9

  return Math.max(1, afterVariance); // 10
}

// Mapeia um uint32 (de rngFor + nextUint32) para o intervalo fp-scale [0, 1000).
// `%` não está na lista de operadores proibidos em duel/ (só +,-,*,/ fora dos helpers).
export function rollCritRoll(rngValue: number): number {
  return rngValue % FP_SCALE;
}

export function isCriticalHit(rngValue: number, chc: number): boolean {
  return rollCritRoll(rngValue) < Math.min(chc, CHC_CAP);
}

const VARIANCE_MIN = 970;
const VARIANCE_SPAN = 61; // 970..1030 inclusive

export function rollDamageVariance(rngValue: number): number {
  return VARIANCE_MIN + (rngValue % VARIANCE_SPAN);
}
