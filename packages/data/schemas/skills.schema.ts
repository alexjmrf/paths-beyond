import { z } from 'zod';
import { effectApplicationSchema, idSchema, reactionTriggerSchema } from './shared.js';

// §8.3 — SkillDef. `effects`/`trigger` eram placeholders `unknown` em M1 (decisão
// registrada em DECISIONS.md); M2 leu docs/spec/04-duelo.md e tipa de verdade agora.
const skillSchema = z.object({
  id: idSchema,
  name: z.string().min(1),
  kind: z.enum(['duel', 'map', 'reaction']),
  apCost: z.number().int().min(0),
  ppCost: z.number().int().min(0).optional(),
  cooldown: z.number().int().min(0),
  multiplier: z.number().int(), // escala 1000
  flat: z.number().int(),
  scalesWith: z.enum(['atk', 'def', 'hp']),
  duelRange: z.number().int().positive().optional(),
  effects: z.array(effectApplicationSchema).default([]),
  trigger: reactionTriggerSchema.optional(),
  // §6.4 (M10 sub-sessão 4/N) — "Reações padrão que toda unidade tem: Contra-atacar,
  // Defender. Classes e talentos adicionam outras: Cobrir aliado, Esquiva, Escudo
  // reativo, Cura de emergência." Só faz sentido em `kind:'reaction'`. M9 derivava
  // "universal" do próprio `kind`, o que só funcionava enquanto as duas únicas reações do
  // catálogo eram justamente as duas universais; default `false` porque a lista fechada de
  // §6.4 tem 2 itens e tudo o mais vem de talento (ver DECISIONS.md).
  baseline: z.boolean().default(false),
  tags: z.array(z.string().min(1)).default([]),
});

export default skillSchema;
