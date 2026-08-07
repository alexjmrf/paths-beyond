import { z } from 'zod';
import { idSchema } from './shared.js';

const moveCostValueSchema = z.union([z.number().int().positive(), z.literal('impassable')]);

// §5.1 — Terrain. As 5 chaves de MoveType (foot/cavalry/flying/heavy/aquatic) são
// exigidas explicitamente, não via moveTypeSchema, porque z.object precisa de um shape
// literal por chave — a lista aqui é a mesma de moveTypeSchema em shared.ts.
const terrainSchema = z.object({
  id: idSchema,
  moveCost: z.object({
    foot: moveCostValueSchema,
    cavalry: moveCostValueSchema,
    flying: moveCostValueSchema,
    heavy: moveCostValueSchema,
    aquatic: moveCostValueSchema,
  }),
  defBonus: z.number().int(), // fp-scale, % de mitigação
  evaBonus: z.number().int(), // fp-scale
  blocksSight: z.boolean(),
});

export default terrainSchema;
