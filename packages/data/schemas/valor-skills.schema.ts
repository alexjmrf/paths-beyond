import { z } from 'zod';
import { idSchema } from './shared.js';

// §5.6 — "Gasto em: restaurar AP/PP de uma unidade, invocar reforço, artilharia de mapa,
// buff global de 1 round." Em M3 o `payload` era um `z.record(z.string(), z.unknown())`
// solto, porque nenhum `kind` tinha resolução no motor. M11 (sub-sessão 3/N) resolveu três
// deles, e um payload sem forma passou a ser a mesma classe de bug que o `defend` sem
// `target`: conteúdo que valida e não faz nada. Agora é união discriminada por `kind`.
const baseFields = {
  id: idSchema,
  name: z.string().min(1),
  cost: z.number().int().positive(),
};

const valorSkillSchema = z.discriminatedUnion('kind', [
  z.object({
    ...baseFields,
    kind: z.literal('restoreApPp'),
    // AP/PP devolvidos à unidade no tile alvo. Números de balanceamento vivem aqui (regra 4).
    payload: z.object({
      ap: z.number().int().nonnegative(),
      pp: z.number().int().nonnegative(),
    }),
  }),
  z.object({
    ...baseFields,
    kind: z.literal('artillery'),
    // `damage` entra como `flat` de §6.6: ainda é mitigado por `def` do alvo. `radius` em
    // distância Manhattan (§5.1), como toda área do jogo.
    payload: z.object({
      damage: z.number().int().positive(),
      radius: z.number().int().nonnegative(),
    }),
  }),
  z.object({
    ...baseFields,
    kind: z.literal('globalBuff'),
    // A duração NÃO vem daqui: §5.6 fixa "buff global de 1 round", e quem sabe disso é o
    // motor (`GLOBAL_BUFF_DURATION`). Deixar o autor escolher seria mudar a regra em dado.
    payload: z.object({ effectId: idSchema }),
  }),
  z.object({
    ...baseFields,
    kind: z.literal('summonReinforcement'),
    // M15 D2 — o último `kind` a ganhar resolução. Em M11 o payload era um record solto
    // porque a decisão de ONDE a unidade invocada mora ainda não existia; agora ela mora em
    // `summon-blueprints/` e o payload a nomeia. Payload sem forma aqui teria virado a mesma
    // classe de bug dos outros três: conteúdo que valida e não faz nada.
    payload: z.object({ blueprintId: idSchema }),
  }),
]);

export default valorSkillSchema;
