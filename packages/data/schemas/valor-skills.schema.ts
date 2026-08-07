import { z } from 'zod';
import { idSchema } from './shared.js';

// §5.6 — "Gasto em: restaurar AP/PP de uma unidade, invocar reforço, artilharia de mapa,
// buff global de 1 round." Schema estrutural mínimo — o motor de M3 só valida saldo e
// gasta um custo fixo (`applyUseValor`), não aplica nenhum desses efeitos ainda (corte
// de escopo registrado em DECISIONS.md). `payload` fica solto até cada `kind` ganhar
// resolução própria em core.
const valorSkillSchema = z.object({
  id: idSchema,
  name: z.string().min(1),
  cost: z.number().int().positive(),
  kind: z.enum(['restoreApPp', 'summonReinforcement', 'artillery', 'globalBuff']),
  payload: z.record(z.string(), z.unknown()).default({}),
});

export default valorSkillSchema;
