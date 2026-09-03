import { z } from 'zod';
import { achievementConditionSchema } from './achievements.schema.js';
import { idSchema } from './shared.js';

// §10 (M18, 4/N) — EVENTOS, a quarta fonte da moeda premium.
//
// **Decisão do usuário: um evento é uma recompensa com JANELA DE TEMPO.** Mesma mecânica do
// achievement, com uma condição a mais — o relógio —, e por isso ele reusa a condição
// autorada daquele em vez de declarar uma linguagem própria. A alternativa descartada era o
// evento como MULTIPLICADOR temporário do que as outras fontes dão: mais parecido com o que
// gachas fazem, e muito mais invasivo — toda fonte passaria a perguntar "há evento ativo?",
// e o balanceamento de M8 ganharia um modo a mais para medir.
//
// Instantes em epoch ms INTEIRO, e não ISO 8601, pelo mesmo idioma que `EnergyState.asOfMs`
// e a trava de entrada de M14 já usam: o projeto compara instantes como número e não tem
// `Date` no caminho de regra (regra 1).
const eventSchema = z
  .object({
    id: idSchema,
    name: z.string().min(1),
    description: z.string().min(1),
    premium: z.number().int().positive(),
    startsAt: z.number().int().nonnegative(),
    endsAt: z.number().int().nonnegative(),
    // Opcional: um evento pode ser só "apareça dentro da janela". Com condição, ele é um
    // achievement que expira.
    condition: achievementConditionSchema.optional(),
  })
  .strict()
  .refine((event) => event.endsAt > event.startsAt, {
    message: 'endsAt precisa ser depois de startsAt — uma janela vazia nunca seria reivindicável.',
  });

export default eventSchema;
