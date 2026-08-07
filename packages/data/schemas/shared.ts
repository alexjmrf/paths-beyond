import { z } from 'zod';

// Não termina em `.schema.ts` de propósito: validateDataset() só descobre tipos de
// conteúdo por esse sufixo, então este módulo de peças compartilhadas fica invisível
// para o pipeline de validação — só as outras schemas o importam.

// §4.1 — os 13 stats do jogo (mesma lista de packages/core/src/stats/types.ts;
// core não pode depender de data nem vice-versa, então o enum é duplicado aqui
// deliberadamente em vez de compartilhado).
export const STAT_KEYS = [
  'hp',
  'atk',
  'def',
  'spd',
  'chc',
  'chd',
  'eff',
  'efr',
  'pen',
  'heal',
  'lifesteal',
  'focus',
  'vigor',
] as const;

export const statKeySchema = z.enum(STAT_KEYS);

export const idSchema = z.string().min(1);

// Mesmo shape de TalentEffect{t:'stat'} (§8.2): flat e/ou pct, nunca nenhum dos dois.
export const statModifierSchema = z
  .object({
    stat: statKeySchema,
    flat: z.number().int().optional(),
    pct: z.number().int().optional(),
  })
  .refine((m) => m.flat !== undefined || m.pct !== undefined, {
    message: 'StatModifier precisa definir flat e/ou pct.',
  });

// §7.1
export const gearSlotSchema = z.enum(['weapon', 'helmet', 'armor', 'necklace', 'ring', 'boots']);

// §7.2
export const raritySchema = z.enum(['common', 'rare', 'heroic', 'epic']);

// §7.3 — faixa de valor de mainstat/substat, reusada por mainstat-weights e
// substat-weights (M4).
export const valueRangeSchema = z
  .object({ min: z.number().int(), max: z.number().int() })
  .refine((range) => range.min <= range.max, { message: 'min precisa ser <= max' });

// Partial<Record<StatKey, number>> — usado pela curva de stat da classe (§4.1 passo 1).
export const partialStatSheetSchema = z
  .record(z.string(), z.number().int())
  .refine((obj) => Object.keys(obj).every((k) => (STAT_KEYS as readonly string[]).includes(k)), {
    message: 'Chave de stat desconhecida — deve ser um dos STAT_KEYS.',
  });

// Sheet completo (todas as 13 chaves presentes) — usado por duel-participants (M2), que
// consome um stat sheet já resolvido (passos 1-7 de §4.1), não uma curva parcial.
export const fullStatSheetSchema = z.object(
  Object.fromEntries(STAT_KEYS.map((key) => [key, z.number().int()])) as Record<
    (typeof STAT_KEYS)[number],
    z.ZodNumber
  >,
);

// §6.3/§6.8 — mesma lista de packages/core/src/tactics/types.ts (core não pode depender
// de data, então duplicada aqui deliberadamente, igual STAT_KEYS acima).
export const unitTypeSchema = z.enum(['infantry', 'cavalry', 'flying', 'armored', 'caster']);
export const weaponTypeSchema = z.enum(['sword', 'axe', 'spear', 'bow', 'arcane', 'nature', 'holy']);

// §5.1 — Coord não tem shape normativo (decisão registrada em DECISIONS.md, M3: {x,y}).
export const coordSchema = z.object({ x: z.number().int(), y: z.number().int() });

// §5.1 — "MoveType DEVE incluir foot, cavalry, flying, heavy, aquatic".
export const moveTypeSchema = z.enum(['foot', 'cavalry', 'flying', 'heavy', 'aquatic']);

// §9.1 — mesma lista de packages/core/src/battle/types.ts (MapAiArchetype); duplicada
// aqui pelo mesmo motivo de unitTypeSchema/weaponTypeSchema acima (core não pode
// depender de data). Novo em M8 (tools/balance) — nenhum schema de conteúdo tinha
// precisado do enum de arquétipo de IA até agora.
export const mapAiArchetypeSchema = z.enum(['aggressive', 'hold-position', 'guard-tile', 'flank', 'support-nearest']);

// §6.4
export const reactionTriggerSchema = z.enum([
  'onAttacked',
  'onDamaged',
  'onDebuffed',
  'onAllyEngagedNearby',
  'onLethal',
]);

// §8.3 — EffectApplication (payload de skill.effects).
export const effectApplicationSchema = z.object({
  effectId: idSchema,
  target: z.enum(['self', 'target']),
  chance: z.number().int().min(0).max(1000),
  stacks: z.number().int().positive().optional(),
});

// Tipo laxo de propósito: uma união discriminada recursiva precisa de uma âncora de tipo
// para o `z.lazy` abaixo; a validação de runtime (z.discriminatedUnion) é que é precisa.
export interface Condition {
  readonly t: string;
  readonly [key: string]: unknown;
}

// §6.3 — Condition, união literal completa. Reusada por TacticsLine e ReactionLine.
export const conditionSchema: z.ZodType<Condition> = z.lazy(() =>
  z.discriminatedUnion('t', [
    z.object({ t: z.literal('targetHpBelow'), pct: z.number().int().min(0).max(1000) }),
    z.object({ t: z.literal('targetHpAbove'), pct: z.number().int().min(0).max(1000) }),
    z.object({ t: z.literal('targetHasDebuff'), debuffId: idSchema }),
    z.object({ t: z.literal('targetHasBuff'), buffId: idSchema }),
    z.object({ t: z.literal('targetIsType'), type: unitTypeSchema }),
    z.object({ t: z.literal('targetWeaponIs'), weapon: weaponTypeSchema }),
    z.object({ t: z.literal('targetPpBelow'), n: z.number().int().nonnegative() }),
    z.object({ t: z.literal('selfHpBelow'), pct: z.number().int().min(0).max(1000) }),
    z.object({ t: z.literal('selfBuffAbsent'), buffId: idSchema }),
    z.object({ t: z.literal('apAtLeast'), n: z.number().int().nonnegative() }),
    z.object({ t: z.literal('ppAtLeast'), n: z.number().int().nonnegative() }),
    z.object({ t: z.literal('isAttacker') }),
    z.object({ t: z.literal('isDefender') }),
    z.object({ t: z.literal('hasPositionalBonus') }),
    z.object({ t: z.literal('trocaAtLeast'), n: z.union([z.literal(1), z.literal(2), z.literal(3)]) }),
    z.object({ t: z.literal('battleRoundAtLeast'), n: z.number().int().nonnegative() }),
    z.object({ t: z.literal('alliesAdjacentAtLeast'), n: z.number().int().nonnegative() }),
    z.object({ t: z.literal('not'), c: conditionSchema }),
  ]),
);

// §6.3 — TacticsLine.
export const tacticsLineSchema = z.object({
  enabled: z.boolean(),
  skillId: idSchema,
  conditions: z.array(conditionSchema),
});

// §6.4/§6.5 — ReactionLine (M2): mesmo formato de TacticsLine; trigger/ppCost vêm da
// SkillDef referenciada.
export const reactionLineSchema = z.object({
  enabled: z.boolean(),
  skillId: idSchema,
  conditions: z.array(conditionSchema),
});
