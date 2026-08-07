import { z } from 'zod';
import { idSchema, moveTypeSchema, partialStatSheetSchema, statKeySchema, unitTypeSchema, weaponTypeSchema } from './shared.js';

// §8.2 — TalentEffect, união literal completa dada pela spec.
const talentEffectSchema = z.discriminatedUnion('t', [
  z.object({ t: z.literal('stat'), stat: statKeySchema, flat: z.number().int().optional(), pct: z.number().int().optional() }),
  z.object({ t: z.literal('grantSkill'), skillId: idSchema }),
  z.object({ t: z.literal('grantReaction'), reactionId: idSchema }),
  // patch: Partial<SkillDef> — permissivo de propósito, SkillDef pertence a skills.schema.ts
  // e um patch parcial não tem forma fixa própria.
  z.object({ t: z.literal('modifySkill'), skillId: idSchema, patch: z.record(z.string(), z.unknown()) }),
  z.object({ t: z.literal('extraTacticsSlot') }),
  z.object({ t: z.literal('extraTacticsCondition') }),
  z.object({ t: z.literal('maxAp'), n: z.number().int() }),
  z.object({ t: z.literal('maxPp'), n: z.number().int() }),
  z.object({ t: z.literal('apRefund'), on: z.enum(['kill', 'duelWon', 'assist']), n: z.number().int() }),
  z.object({ t: z.literal('duelApCap'), n: z.number().int() }),
  z.object({ t: z.literal('assistRangeBonus'), n: z.number().int() }),
  z.object({ t: z.literal('passive'), passiveId: idSchema }),
]);

// §8.2 — TalentNode.
const talentNodeSchema = z.object({
  id: idSchema,
  tree: z.enum(['class', 'spec']),
  row: z.number().int().min(1).max(8),
  requires: z.array(idSchema).default([]),
  exclusiveWith: z.array(idSchema).default([]),
  maxRank: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  effects: z.array(talentEffectSchema).min(1),
});

// §8.1 — "Promoção exige item + nível mínimo". Ausente = classe base (tier:'base'),
// que não é alcançada por promoção.
const promotionRequirementSchema = z.object({
  minLevel: z.number().int().min(1).max(60),
  itemId: idSchema.optional(),
});

// §6.1/§8.1 — ClassDef. `moveType`/`allowedWeapons` eram string livre em M1 (M3 ainda
// não tinha resolvido os enums); agora usam os schemas reais de shared.ts (M3).
// `unitType` é novo em M7 (sub-sessão 4): nenhum campo de Hero/ClassDef carregava esse
// dado até agora — decisão registrada em DECISIONS.md, tomada com o usuário, de que é um
// traço inerente da classe (Cavaleiro=cavalry, Mago=caster), não do herói individual.
const classSchema = z.object({
  id: idSchema,
  name: z.string().min(1),
  tier: z.enum(['base', 'spec', 'mastery']),
  promotesFrom: idSchema.optional(),
  promotionRequirement: promotionRequirementSchema.optional(),
  unitType: unitTypeSchema,
  moveType: moveTypeSchema,
  moveRange: z.number().int().positive(),
  allowedWeapons: z.array(weaponTypeSchema).min(1),
  basePools: z.object({
    ap: z.number().int().min(0),
    pp: z.number().int().min(0),
  }),
  // índice 0 = nível 1 .. índice 59 = nível 60 (§4.2: level 1..60).
  statCurve: z.array(partialStatSheetSchema).length(60),
  // índice 0..6 = awakening 0..6 (§4.2), escala 1000 (1000 = ×1.0).
  awakeningMultipliers: z.array(z.number().int().min(0)).length(7),
  promotionFlat: z.array(
    z.object({ stat: statKeySchema, flat: z.number().int().optional(), pct: z.number().int().optional() }),
  ).default([]),
  // índice 0..5 = imprint 0..5 (§4.2), bônus flat total naquele nível (cumulativo, não incremental).
  imprintFlat: z.array(
    z.array(z.object({ stat: statKeySchema, flat: z.number().int().optional(), pct: z.number().int().optional() })),
  ).length(6),
  talentTree: z.array(talentNodeSchema),
});

export default classSchema;
