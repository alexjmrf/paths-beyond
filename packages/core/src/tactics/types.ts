import type { Id } from '../types.js';

// §6.3, §6.8 — tipos de unidade e de arma citados pelas Condition; moram aqui (não em
// duel/) porque Condition é quem os referencia primeiro e duel/ depende de tactics/.
export type UnitType = 'infantry' | 'cavalry' | 'flying' | 'armored' | 'caster';
export type WeaponType = 'sword' | 'axe' | 'spear' | 'bow' | 'arcane' | 'nature' | 'holy';

// §6.3 — união literal completa dada pela spec.
export type Condition =
  | { readonly t: 'targetHpBelow'; readonly pct: number }
  | { readonly t: 'targetHpAbove'; readonly pct: number }
  | { readonly t: 'targetHasDebuff'; readonly debuffId: Id }
  | { readonly t: 'targetHasBuff'; readonly buffId: Id }
  | { readonly t: 'targetIsType'; readonly type: UnitType }
  | { readonly t: 'targetWeaponIs'; readonly weapon: WeaponType }
  | { readonly t: 'targetPpBelow'; readonly n: number }
  | { readonly t: 'selfHpBelow'; readonly pct: number }
  | { readonly t: 'selfBuffAbsent'; readonly buffId: Id }
  | { readonly t: 'apAtLeast'; readonly n: number }
  | { readonly t: 'ppAtLeast'; readonly n: number }
  | { readonly t: 'isAttacker' }
  | { readonly t: 'isDefender' }
  | { readonly t: 'hasPositionalBonus' }
  | { readonly t: 'trocaAtLeast'; readonly n: 1 | 2 | 3 }
  | { readonly t: 'battleRoundAtLeast'; readonly n: number }
  | { readonly t: 'alliesAdjacentAtLeast'; readonly n: number }
  | { readonly t: 'not'; readonly c: Condition };

// §6.3 — TacticsLine / TacticsScript (referenciado mas não definido como alias em
// packages/data; Hero.tacticsScript era `z.unknown()` placeholder em M1 — M2 resolve).
export interface TacticsLine {
  readonly enabled: boolean;
  readonly skillId: Id;
  readonly conditions: readonly Condition[];
}

export type TacticsScript = readonly TacticsLine[];

// View somente-leitura de um combatente, do jeito que as Condition precisam enxergar —
// não é o DuelParticipant inteiro (que tem stat sheet, scripts etc.), só o recorte
// necessário para avaliar condições sobre "eu" ou "o alvo".
export interface ConditionUnitView {
  readonly currentHpPct: number; // 0..1000, fp-scale, % do hp máximo
  readonly ap: number;
  readonly pp: number;
  readonly unitType: UnitType;
  readonly weaponType: WeaponType;
  readonly activeBuffIds: readonly Id[];
  readonly activeDebuffIds: readonly Id[];
}

export interface ConditionContext {
  readonly self: ConditionUnitView;
  readonly target: ConditionUnitView;
  readonly isSelfAttacker: boolean;
  readonly hasPositionalBonus: boolean; // flanco/cerco/altura, já resolvido fora (grid é M3)
  readonly trocaNumber: 1 | 2 | 3;
  readonly battleRound: number; // battle loop é M3; headless passa um valor fixo
  readonly alliesAdjacentCount: number; // já resolvido fora (grid é M3)
}
