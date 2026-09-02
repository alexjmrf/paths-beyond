import type { GearSlot } from '../items/types.js';
import type { StatModifier, StatSheet } from '../stats/types.js';
import type { TacticsScript } from '../tactics/types.js';
import type { PromotionRequirement } from '../talents/promotion.js';
import type { TalentAllocation } from '../talents/types.js';
import type { UnitType, WeaponType } from '../tactics/types.js';
import type { MoveType } from '../grid/types.js';
import type { Id } from '../types.js';

// §4.2 — Hero, cópia própria do core (regra 1: core não importa de packages/data;
// mirror de packages/data/schemas/heroes.schema.ts, mesmo padrão de ItemInstance/
// TalentNode/SkillDef).
// `weaponType` é novo em M7 (sub-sessão 4, decisão registrada em DECISIONS.md): o herói
// escolhe explicitamente dentre `classDef.allowedWeapons` — sem isso não há como montar
// um `BattleUnit` real a partir de um Hero (allowedWeapons é lista, o duelo precisa de 1).
export interface Hero {
  readonly id: Id;
  // §8.1 (M17) — QUEM ele é. A árvore de talentos deixou de pertencer à classe e passou a
  // pertencer ao personagem, então resolver `talents` exige saber de qual árvore aquela
  // alocação veio — e só o elenco fechado (D6) responde isso.
  //
  // OPCIONAL, e a razão é datada: até a 3/N, inimigo de fase ainda é um `Hero` completo, e
  // inimigo não é personagem (§8.1). Quem não tem `characterId` não tem árvore, e resolve
  // com zero talentos — que é exatamente o que os inimigos de hoje já fazem (`talents: {}`).
  // Quando a 3/N tirar o inimigo do caminho do `Hero`, este campo passa a obrigatório.
  readonly characterId?: Id;
  readonly classId: Id;
  readonly level: number; // 1..60
  readonly exp: number;
  readonly awakening: 0 | 1 | 2 | 3 | 4 | 5 | 6;
  readonly imprint: 0 | 1 | 2 | 3 | 4 | 5;
  readonly talents: TalentAllocation;
  readonly equipment: Readonly<Record<GearSlot, Id | null>>;
  readonly weaponType: WeaponType;
  readonly duelSkills: readonly Id[];
  readonly mapSkills: readonly Id[];
  readonly tacticsScript: TacticsScript;
}

// §6.1/§8.1 — ClassDef, cópia própria do core (mirror de
// packages/data/schemas/classes.schema.ts). `statCurve` tem 60 entradas (nível 1..60,
// índice 0-based), `awakeningMultipliers` tem 7 (awakening 0..6), `imprintFlat` tem 6
// (imprint 0..5, bônus cumulativo total naquele nível, não incremental — §4.2).
// `unitType` é novo em M7 (sub-sessão 4, decisão registrada em DECISIONS.md): traço
// inerente da classe (Cavaleiro=cavalry, Mago=caster), não do herói individual.
export interface ClassDef {
  readonly id: Id;
  readonly name: string;
  readonly tier: 'base' | 'spec' | 'mastery';
  readonly promotesFrom?: Id;
  readonly promotionRequirement?: PromotionRequirement;
  readonly unitType: UnitType;
  readonly moveType: MoveType;
  readonly moveRange: number;
  readonly allowedWeapons: readonly WeaponType[];
  readonly basePools: { readonly ap: number; readonly pp: number };
  readonly statCurve: readonly Partial<StatSheet>[];
  readonly awakeningMultipliers: readonly number[];
  readonly promotionFlat: readonly StatModifier[];
  readonly imprintFlat: readonly (readonly StatModifier[])[];
  // §8.1 (M17) — `talentTree` SAIU daqui. "A classe guia os status e parte do que o
  // personagem faz... ela não é mais a unidade de progressão: a árvore não pertence mais
  // à classe." O que sobrou acima é exatamente o que D2 lista como papel dela.
}
