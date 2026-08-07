import { z } from 'zod';
import { statKeySchema, valueRangeSchema } from './shared.js';

// §7.3 — "Substats vêm de data/items/substat-weights.json. Nunca hardcoded." Decisão
// registrada em DECISIONS.md: vira tipo de conteúdo próprio (`substat-weights/`), não um
// arquivo dentro de `items/` — evita colisão com items.schema.ts no pipeline de validação.
const substatWeightEntrySchema = z.object({
  stat: statKeySchema,
  weight: z.number().int().positive(),
  valueRange: valueRangeSchema,
  reforgeBonusPct: z.number().int().nonnegative().optional(), // §7.3 — bônus de reforge
});

const substatWeightsSchema = z.array(substatWeightEntrySchema).min(1);

export default substatWeightsSchema;
