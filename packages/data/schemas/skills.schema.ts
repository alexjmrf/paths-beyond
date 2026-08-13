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
  // §6.4 (M10 sub-sessão 8/N) — frequência do gatilho de morte. Só existe para
  // `trigger:'onLethal'` e é obrigatória lá: o motor tem um default ('perDuel'), mas
  // deixar o autor de conteúdo omitir um escopo que muda o poder da skill inteira é
  // exatamente o tipo de número invisível que a regra 4 proíbe.
  lethalUses: z.enum(['perDuel', 'perBattle']).optional(),
  // §5.4/§5.1 (M11 sub-sessão 2/N) — raio em distância Manhattan da área de uma skill de
  // mapa, a partir do tile alvo do comando. Ausente/0 = só o tile alvo; não é obrigatório
  // porque uma skill de mapa de alvo único é legítima, e a ausência é o caso conservador
  // (o contrário de `lethalUses`, onde omitir mudaria o poder da skill).
  areaRadius: z.number().int().nonnegative().optional(),
  tags: z.array(z.string().min(1)).default([]),
});

export default skillSchema.superRefine((skill, ctx) => {
  if (skill.trigger === 'onLethal' && skill.lethalUses === undefined) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['lethalUses'],
      message: 'skill com trigger onLethal precisa declarar lethalUses (perDuel | perBattle)',
    });
  }
  if (skill.trigger !== 'onLethal' && skill.lethalUses !== undefined) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['lethalUses'],
      message: 'lethalUses só faz sentido com trigger onLethal',
    });
  }
  // §5.4 — só `applyMapSkill` lê `areaRadius`; declarado em skill de duelo ou de reação
  // seria um número inerte, do tipo que deixa o autor achar que a skill faz algo que não faz.
  if (skill.kind !== 'map' && skill.areaRadius !== undefined) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['areaRadius'],
      message: 'areaRadius só faz sentido em skill de mapa (kind: map)',
    });
  }
});
