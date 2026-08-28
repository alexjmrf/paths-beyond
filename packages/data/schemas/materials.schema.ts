import { z } from 'zod';
import { idSchema } from './shared.js';

// §10 (M14) — materiais de progressão. `awakening` é o "material de promoção" que a
// masmorra de Chefe dropa; `heroFragment` é a "duplicata" de §10 ("Imprint: duplicatas
// viram bônus permanente de stat") resolvida como consumível de um herói nomeado
// (decisão do usuário, ver DECISIONS.md — o projeto não tem coleção de heróis e gacha
// está fora de escopo, §15).
//
// `forHeroId` é obrigatório em `heroFragment` e proibido nos outros: um fragmento sem dono
// viraria imprint de qualquer herói, e um núcleo com dono seria promessa que o motor não
// cumpre (`applyImprint` só aceita `kind: 'heroFragment'`).
const materialSchema = z
  .object({
    id: idSchema,
    name: z.string().min(1),
    kind: z.enum(['awakening', 'heroFragment', 'generic']),
    forHeroId: idSchema.optional(),
  })
  .refine((m) => (m.kind === 'heroFragment' ? m.forHeroId !== undefined : m.forHeroId === undefined), {
    message: 'forHeroId é obrigatório em heroFragment e proibido nos demais kinds.',
  });

export default materialSchema;
