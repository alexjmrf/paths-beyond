import { z } from 'zod';
import skillSchema from './skills.schema.js';
import {
  effectDurationSchema,
  fullStatSheetSchema,
  idSchema,
  reactionLineSchema,
  tacticsLineSchema,
  unitTypeSchema,
  weaponTypeSchema,
} from './shared.js';

// Decisão registrada em DECISIONS.md: formato self-contained lido por
// `sim-cli duel A.json B.json` — tudo já resolvido (stat sheet estático de M1, pools
// atuais, scripts, skills conhecidas). A costura Hero+Class+Item+Talento → isto fica
// para M3-M5, quando grid/equipamento/talentos reais existirem.
const activeEffectSchema = z.object({
  id: idSchema, // referencia um EffectDef de effects.schema.ts
  duration: effectDurationSchema,
  stacks: z.number().int().positive(),
  maxStacks: z.number().int().positive(),
  dispellable: z.boolean(),
});

const duelParticipantSchema = z.object({
  id: idSchema,
  stats: fullStatSheetSchema, // §4.1 passos 1-7, já agregado
  currentHp: z.number().int().nonnegative(),
  ap: z.number().int().nonnegative(),
  pp: z.number().int().nonnegative(),
  unitType: unitTypeSchema,
  weaponType: weaponTypeSchema,
  duelRange: z.number().int().positive(),
  tacticsScript: z.array(tacticsLineSchema).max(6), // §6.3 — até 6 linhas
  reactionScript: z.array(reactionLineSchema),
  knownSkills: z.record(idSchema, skillSchema),
  cooldowns: z.record(idSchema, z.number().int().nonnegative()).default({}),
  activeEffects: z.array(activeEffectSchema).default([]),
  positionalMultiplier: z.number().int(), // flanco/cerco/altura/terreno já resolvidos (grid é M3)
  // §7.4 (M10 sub-sessão 6/N) — efeitos `special` de set que o duelo interpreta
  // (Duelista, Imunidade), já resolvidos a partir do equipamento. Opcional com default
  // vazio: o formato é self-contained e não tem equipamento pra derivar. Os ids válidos
  // são os canônicos de `packages/core/src/items/sets.ts` (`set-special:*`); um id
  // desconhecido é simplesmente ignorado pelo motor.
  setSpecialEffectIds: z.array(idSchema).default([]),
});

export default duelParticipantSchema;
