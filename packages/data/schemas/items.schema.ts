import { z } from 'zod';
import { gearSlotSchema, idSchema, raritySchema, statKeySchema } from './shared.js';

// §7.2 — ItemInstance. Geração/enhance/reforge (M4) não são validados aqui; este
// schema só garante que uma instância de item já resolvida é estruturalmente válida.
const itemSchema = z.object({
  id: idSchema,
  setId: idSchema,
  slot: gearSlotSchema,
  rarity: raritySchema,
  ilvl: z.number().int().min(58).max(100),
  mainstat: z.object({ stat: statKeySchema, value: z.number().int() }),
  substats: z
    .array(
      z.object({
        stat: statKeySchema,
        value: z.number().int(),
        rolls: z.number().int().min(1),
      }),
    )
    .max(4),
  enhance: z.number().int().min(0).max(15),
  lockedBy: idSchema.optional(),
  reforged: z.boolean(),
});

export default itemSchema;
