import { z } from 'zod';
import { idSchema, statModifierSchema } from './shared.js';

// §6.9 — payload de um efeito (o que ele FAZ; ActiveEffect é só o estado da instância,
// vive dentro de duel-participants.schema.ts).
const effectSchema = z.object({
  id: idSchema,
  name: z.string().min(1),
  kind: z.enum(['buff', 'debuff']),
  dispellable: z.boolean(),
  maxStacks: z.number().int().positive(),
  statMods: z.array(statModifierSchema).default([]), // §4.1 passo 8
  damageDealtPct: z.number().int().optional(), // §6.6 passo 8
  damageTakenReductionPct: z.number().int().optional(), // §6.6 passo 8
  // §6.9 — DoT/regeneração: percentual do HP MÁXIMO do alvo, por tick (round de mapa),
  // fp-scale (1000 = 100%). Campo normativo exigido por M10 (ver DECISIONS.md) — ainda
  // não tickado nesta sub-sessão (fica para a sub-sessão que liga round.ts a HP).
  periodicDamagePct: z.number().int().nonnegative().optional(),
  periodicHealPct: z.number().int().nonnegative().optional(),
});

export default effectSchema;
