import { z } from 'zod';
import { coordSchema, idSchema } from './shared.js';

// §5.1 (M15 D3) — `chest` saiu do enum junto com o tipo do core: loot em mapa é sistema de
// exploração que este jogo não tem, e um valor que nada lê e nada escreve é dívida. Os quatro
// restantes têm leitor: `fort`/`camp` dão +1 AP no `wait` (§5.4) e são objetivo de captura
// (§5.6); `wall` e `gate` bloqueiam movimento.
const gateSchema = z.object({
  // Quem ABRE o portão encerrando o turno ao lado dele. Quem não abre, arromba. `none` é o
  // portão trancado: ninguém tem a chave e os dois lados só passam arrombando.
  opensFor: z.enum(['player', 'enemy', 'any', 'none']),
  // Turnos-unidade de pancada para derrubá-lo pelo lado travado. Positivo: um portão que
  // cai em zero golpes não é um portão, é um tile vazio com nome bonito.
  durability: z.number().int().positive(),
});

const tileSchema = z
  .object({
    terrain: idSchema, // referencia um TerrainId de terrains.schema.ts
    height: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]),
    object: z.enum(['wall', 'fort', 'gate', 'camp']).optional(),
    // Ausente num tile de portão = portão simples: qualquer um abre, num turno.
    gate: gateSchema.optional(),
  })
  .refine((tile) => tile.gate === undefined || tile.object === 'gate', {
    message: '`gate` só pode ser declarado em um tile com `object: "gate"`.',
  });

// §5.7 — "Data-driven por mapa: rout, seize, survive N rounds, escort, defend." Só
// `rout` é resolvido pelo motor em M3 (ver DECISIONS.md); os demais só têm schema.
// Exportado desde M12: `encounters.schema.ts` reusa a mesma união para poder sobrepor a
// condição do layout (um mapa de `escort` nomeia uma unidade que só existe no elenco).
export const winConditionSchema = z.discriminatedUnion('t', [
  z.object({ t: z.literal('rout') }),
  z.object({ t: z.literal('seize'), target: coordSchema }),
  z.object({ t: z.literal('surviveRounds'), n: z.number().int().positive() }),
  z.object({ t: z.literal('escort'), unitId: idSchema, target: coordSchema }),
  // §5.7 (M11) — `target` é o que separa `defend` de `surviveRounds`: segure `rounds`
  // rounds E não deixe inimigo pisar no tile (decisão do usuário, ver DECISIONS.md).
  z.object({ t: z.literal('defend'), rounds: z.number().int().positive(), target: coordSchema }),
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
