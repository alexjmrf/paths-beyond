import { fpMul } from '../math/fixed.js';
import type { UnitType, WeaponType } from '../tactics/types.js';

// §6.8 — os dois ciclos do triângulo. cycle[i] vence cycle[i+1]; `bow` fica fora dos dois.
// Exportados (M7, sub-sessão 4) porque a mesma categorização física/mágica também define
// quais WeaponType são "melee" vs "ranged" pra fins de assistRange (hero/combatProfile.ts).
export const PHYSICAL_CYCLE: readonly WeaponType[] = ['sword', 'axe', 'spear'];
export const MAGIC_CYCLE: readonly WeaponType[] = ['arcane', 'nature', 'holy'];

export interface TriangleResult {
  readonly damageMultiplier: number; // fp-scale: 1100 vantagem, 1000 neutro, 900 desvantagem
  readonly accuracyModifier: number; // ±100, fp-scale (§6.8: "afeta dano e acurácia")
}

// 1 = attacker vence defender; -1 = attacker perde; 0 = neutro (mesma arma, fora do ciclo, ou ciclos diferentes).
function cycleAdvantage(cycle: readonly WeaponType[], attacker: WeaponType, defender: WeaponType): -1 | 0 | 1 {
  const attackerIndex = cycle.indexOf(attacker);
  const defenderIndex = cycle.indexOf(defender);
  if (attackerIndex === -1 || defenderIndex === -1 || attackerIndex === defenderIndex) return 0;
  if ((attackerIndex + 1) % cycle.length === defenderIndex) return 1;
  if ((defenderIndex + 1) % cycle.length === attackerIndex) return -1;
  return 0;
}

export function weaponTriangleResult(attacker: WeaponType, defender: WeaponType): TriangleResult {
  const advantage = cycleAdvantage(PHYSICAL_CYCLE, attacker, defender) || cycleAdvantage(MAGIC_CYCLE, attacker, defender);
  if (advantage === 1) return { damageMultiplier: 1100, accuracyModifier: 100 };
  if (advantage === -1) return { damageMultiplier: 900, accuracyModifier: -100 };
  return { damageMultiplier: 1000, accuracyModifier: 0 };
}

// §6.8 — "Arqueiros: +25% contra flying".
export function typeEffectivenessDamageMultiplier(attackerWeapon: WeaponType, defenderUnitType: UnitType): number {
  if (attackerWeapon === 'bow' && defenderUnitType === 'flying') return 1250;
  return 1000;
}

// §6.8 — "armored: -20% de dano físico, +20% de dano mágico".
export function armoredDamageMultiplier(defenderUnitType: UnitType, skillTags: readonly string[]): number {
  if (defenderUnitType !== 'armored') return 1000;
  if (skillTags.includes('physical')) return 800;
  if (skillTags.includes('magic')) return 1200;
  return 1000;
}

export interface CombinedTypeDamageInput {
  readonly attackerWeapon: WeaponType;
  readonly defenderWeapon: WeaponType;
  readonly defenderUnitType: UnitType;
  readonly skillTags: readonly string[];
}

// Passo 5 da fórmula de dano (§6.6): "triangulo" = composição de todo o §6.8 num só multiplicador.
export function combinedTypeDamageMultiplier(input: CombinedTypeDamageInput): number {
  const triangle = weaponTriangleResult(input.attackerWeapon, input.defenderWeapon).damageMultiplier;
  const effectiveness = typeEffectivenessDamageMultiplier(input.attackerWeapon, input.defenderUnitType);
  const armored = armoredDamageMultiplier(input.defenderUnitType, input.skillTags);
  return fpMul(fpMul(triangle, effectiveness), armored);
}
