import { z } from 'zod';
import { idSchema, statKeySchema } from './shared.js';

// §7.4 — bônus de set. Efeitos `stat` alimentam o passo 7 da agregação (§4.1) direto.
// Efeitos `special` (ex.: sets Duelista/Reserva/Sentinela/Imunidade) mexem com economia
// de AP/PP e turno de duelo — mecânica de M2/M3, então ficam como referência opaca
// (`effectId`) para o sistema que vai interpretá-los, não resolvidos aqui.
const setEffectSchema = z.discriminatedUnion('t', [
  z.object({
    t: z.literal('stat'),
    pieces: z.union([z.literal(2), z.literal(4)]),
    stat: statKeySchema,
    flat: z.number().int().optional(),
    pct: z.number().int().optional(),
  }),
  z.object({
    t: z.literal('special'),
    pieces: z.union([z.literal(2), z.literal(4)]),
    effectId: idSchema,
    description: z.string().min(1),
  }),
]);

const itemSetSchema = z.object({
  id: idSchema,
  name: z.string().min(1),
  effects: z.array(setEffectSchema).min(1),
});

export default itemSetSchema;
