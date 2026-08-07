import { z } from 'zod';
import { gearSlotSchema, statKeySchema, valueRangeSchema } from './shared.js';

// §7.1 — pesos de mainstat por slot. Só necklace/ring/boots sorteiam de fato (weapon/
// helmet/armor têm mainstat fixo por regra, mas ainda usam a faixa de valor daqui).
const mainstatWeightEntrySchema = z.object({
  slot: gearSlotSchema,
  stat: statKeySchema,
  weight: z.number().int().positive(),
  valueRange: valueRangeSchema,
});

const mainstatWeightsSchema = z.array(mainstatWeightEntrySchema).min(1);

export default mainstatWeightsSchema;
