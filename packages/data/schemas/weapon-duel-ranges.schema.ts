import { z } from 'zod';
import { weaponTypeSchema } from './shared.js';

// §6.1 — "cada arma tem duelRange" (melee=1, ranged=2-3), mas a spec deixa o valor
// ranged como uma faixa, não um número literal — número de balanceamento por
// definição (regra de dados.md: nunca hardcoded em packages/core). Decisão registrada
// em DECISIONS.md, tomada com o usuário: tabela nova de conteúdo em vez de constante
// no motor, com um valor por WeaponType.
const weaponDuelRangesSchema = z.object({
  sword: z.number().int().positive(),
  axe: z.number().int().positive(),
  spear: z.number().int().positive(),
  bow: z.number().int().positive(),
  arcane: z.number().int().positive(),
  nature: z.number().int().positive(),
  holy: z.number().int().positive(),
}) satisfies z.ZodType<Record<z.infer<typeof weaponTypeSchema>, number>>;

export default weaponDuelRangesSchema;
