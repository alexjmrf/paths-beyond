import { z } from 'zod';
import { coordSchema, idSchema } from './shared.js';

const tileSchema = z.object({
  terrain: idSchema, // referencia um TerrainId de terrains.schema.ts
  height: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]),
  object: z.enum(['wall', 'fort', 'gate', 'chest', 'camp']).optional(),
});

// §5.7 — "Data-driven por mapa: rout, seize, survive N rounds, escort, defend." Só
// `rout` é resolvido pelo motor em M3 (ver DECISIONS.md); os demais só têm schema.
const winConditionSchema = z.discriminatedUnion('t', [
  z.object({ t: z.literal('rout') }),
  z.object({ t: z.literal('seize'), target: coordSchema }),
  z.object({ t: z.literal('surviveRounds'), n: z.number().int().positive() }),
  z.object({ t: z.literal('escort'), unitId: idSchema, target: coordSchema }),
  z.object({ t: z.literal('defend'), rounds: z.number().int().positive() }),
]);

// §5.1 — Mapa. "Grid quadrado ortogonal, 15×15 a 30×30."
const mapSchema = z
  .object({
    id: idSchema,
    name: z.string().min(1),
    width: z.number().int().min(15).max(30),
    height: z.number().int().min(15).max(30),
    tiles: z.array(z.array(tileSchema)), // tiles[y][x]
    zocEnabled: z.boolean(),
    winCondition: winConditionSchema,
    initialValor: z.number().int().nonnegative(), // §5.6 — "Começa em 5"
  })
  .refine((map) => map.tiles.length === map.height, {
    message: 'tiles precisa ter exatamente `height` linhas.',
  })
  .refine((map) => map.tiles.every((row) => row.length === map.width), {
    message: 'cada linha de tiles precisa ter exatamente `width` colunas.',
  });

export default mapSchema;
