import { z } from 'zod';
import {
  idSchema,
  moveTypeSchema,
  partialStatSheetSchema,
  statKeySchema,
  unitTypeSchema,
  weaponTypeSchema,
} from './shared.js';

// §8.1 (M17, sub-sessão 2/N) — `talentNodeSchema` e o campo `talentTree` SAÍRAM daqui.
// "A classe... não é mais a unidade de progressão: a árvore não pertence mais à classe."
// A árvore agora é conteúdo próprio, em `character-talent-trees.schema.ts`, indexada por
// personagem. O §7 do briefing do M17 proíbe os dois formatos convivendo, e o schema não
// é `.strict()`, então um `talentTree` esquecido num JSON antigo passaria despercebido —
// por isso o gerador reemitiu as 10 classes em vez de só o schema mudar.

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
});

export default classSchema;
