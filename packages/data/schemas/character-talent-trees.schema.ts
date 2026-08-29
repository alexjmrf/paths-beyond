import { z } from 'zod';
import { idSchema, talentEffectSchema } from './shared.js';

// M17 (§8.2) — a árvore de talentos do PERSONAGEM, em duas colunas.
//
// Este schema trava a FORMA do dado e só isso. A coerência da árvore — toda linha tendo as duas
// colunas principais, no máximo um nó do meio por linha, o orçamento cabendo na profundidade e
// só subindo dela quando houver nó de rank múltiplo — é do motor, em
// `packages/core/src/talents/columnTree.ts` (`validateColumnTree`). Duplicar aquelas regras em
// Zod seria uma segunda implementação da mesma regra, e o precedente do projeto é claro sobre o
// que isso custa: `weapon-duel-ranges` também tem schema de forma e regra no motor.
//
// A faixa de profundidade entra AQUI mesmo assim, porque 5..9 é normativo em §8.2 e é a única
// coisa que dá para afirmar olhando um arquivo isolado.
const columnTalentNodeSchema = z
  .object({
    id: idSchema,
    column: z.enum(['a', 'b', 'middle']),
    row: z.number().int().min(1),
    maxRank: z.union([z.literal(1), z.literal(2), z.literal(3)]),
    // §10 (M14) — sobrevive à mudança de forma sem alteração.
    minAwakening: z.number().int().min(0).max(6).optional(),
    effects: z.array(talentEffectSchema),
  })
  // Estrito de propósito: `tree`, `requires` e `exclusiveWith` da topologia antiga não podem
  // passar despercebidos. Quem amarra agora é a coluna, e um arquivo autorado no formato velho
  // tem que falhar alto em vez de validar e não fazer nada.
  .strict();

const characterTalentTreeSchema = z
  .object({
    characterId: idSchema,
    depth: z.number().int().min(5).max(9),
    budget: z.number().int().min(5),
    nodes: z.array(columnTalentNodeSchema),
  })
  .strict();

export default characterTalentTreeSchema;
