import type { Condition, UnitType, WeaponType } from '@paths-beyond/core';

export const UNIT_TYPES: readonly UnitType[] = ['infantry', 'cavalry', 'flying', 'armored', 'caster'];
export const WEAPON_TYPES: readonly WeaponType[] = ['sword', 'axe', 'spear', 'bow', 'arcane', 'nature', 'holy'];

// §6.3 — as 17 variantes "de base" de Condition; `not` é tratado à parte no editor como
// um wrapper (checkbox "negar"), não como mais uma opção no dropdown de tipo — evita UI
// recursiva pra um caso que é só uma negação.
export type BaseConditionType = Exclude<Condition['t'], 'not'>;

export const CONDITION_TYPES: readonly BaseConditionType[] = [
  'targetHpBelow',
  'targetHpAbove',
  'targetHasDebuff',
  'targetHasBuff',
  'targetIsType',
  'targetWeaponIs',
  'targetPpBelow',
  'selfHpBelow',
  'selfBuffAbsent',
  'apAtLeast',
  'ppAtLeast',
  'isAttacker',
  'isDefender',
  'hasPositionalBonus',
  'trocaAtLeast',
  'battleRoundAtLeast',
  'alliesAdjacentAtLeast',
];

export const CONDITION_LABELS: Record<BaseConditionType, string> = {
  targetHpBelow: 'HP do alvo abaixo de (‰)',
  targetHpAbove: 'HP do alvo acima de (‰)',
  targetHasDebuff: 'Alvo tem debuff',
  targetHasBuff: 'Alvo tem buff',
  targetIsType: 'Alvo é do tipo',
  targetWeaponIs: 'Arma do alvo é',
  targetPpBelow: 'PP do alvo abaixo de',
  selfHpBelow: 'Meu HP abaixo de (‰)',
  selfBuffAbsent: 'Eu não tenho o buff',
  apAtLeast: 'Meu AP é pelo menos',
  ppAtLeast: 'Meu PP é pelo menos',
  isAttacker: 'Eu sou o atacante',
  isDefender: 'Eu sou o defensor',
  hasPositionalBonus: 'Tenho bônus posicional',
  trocaAtLeast: 'Troca é pelo menos',
  battleRoundAtLeast: 'Round de batalha é pelo menos',
  alliesAdjacentAtLeast: 'Aliados adjacentes é pelo menos',
};

// Cria uma Condition "default" pro tipo escolhido no dropdown — usada tanto pra "+
// condição" quanto ao trocar o tipo de uma condition já existente.
export function createDefaultCondition(type: BaseConditionType): Condition {
  switch (type) {
    case 'targetHpBelow':
      return { t: 'targetHpBelow', pct: 500 };
    case 'targetHpAbove':
      return { t: 'targetHpAbove', pct: 500 };
    case 'targetHasDebuff':
      return { t: 'targetHasDebuff', debuffId: '' };
    case 'targetHasBuff':
      return { t: 'targetHasBuff', buffId: '' };
    case 'targetIsType':
      return { t: 'targetIsType', type: 'infantry' };
    case 'targetWeaponIs':
      return { t: 'targetWeaponIs', weapon: 'sword' };
    case 'targetPpBelow':
      return { t: 'targetPpBelow', n: 1 };
    case 'selfHpBelow':
      return { t: 'selfHpBelow', pct: 500 };
    case 'selfBuffAbsent':
      return { t: 'selfBuffAbsent', buffId: '' };
    case 'apAtLeast':
      return { t: 'apAtLeast', n: 1 };
    case 'ppAtLeast':
      return { t: 'ppAtLeast', n: 1 };
    case 'isAttacker':
      return { t: 'isAttacker' };
    case 'isDefender':
      return { t: 'isDefender' };
    case 'hasPositionalBonus':
      return { t: 'hasPositionalBonus' };
    case 'trocaAtLeast':
      return { t: 'trocaAtLeast', n: 1 };
    case 'battleRoundAtLeast':
      return { t: 'battleRoundAtLeast', n: 1 };
    case 'alliesAdjacentAtLeast':
      return { t: 'alliesAdjacentAtLeast', n: 1 };
  }
}
