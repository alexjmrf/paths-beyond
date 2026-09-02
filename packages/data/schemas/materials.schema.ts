import { z } from 'zod';
import { idSchema } from './shared.js';

// §10 (M14) — materiais de progressão. `awakening` é o "material de promoção" que a
// masmorra de Chefe dropa; `heroFragment` é a "duplicata" de §10 ("Imprint: duplicatas
// viram bônus permanente de stat"), que desde M18 também sai de uma invocação que repete
// alguém que o jogador já possui.
//
// **M18 2/N trocou a chave: era `forHeroId`, é `forCharacterId`.** O fragmento pertence ao
// PERSONAGEM, não a uma instância de herói. A forma antiga funcionava por coincidência de
// autoria (todo herói da campanha tinha `id` e `characterId` iguais) e não sobrevive à
// posse: dois jogadores com o mesmo personagem têm instâncias diferentes, e um fragmento
// por instância não teria como ser autorado como conteúdo. Sem migração — `forHeroId`
// deixou de existir e um material na forma antiga é recusado aqui.
//
// `forCharacterId` é obrigatório em `heroFragment` e proibido nos outros: um fragmento sem
// dono viraria imprint de qualquer um, e um núcleo com dono seria promessa que o motor não
// cumpre (`applyImprint` só aceita `kind: 'heroFragment'`).
const materialSchema = z
  .object({
    id: idSchema,
    name: z.string().min(1),
    kind: z.enum(['awakening', 'heroFragment', 'generic']),
    forCharacterId: idSchema.optional(),
  })
  .strict()
  .refine((m) => (m.kind === 'heroFragment' ? m.forCharacterId !== undefined : m.forCharacterId === undefined), {
    message: 'forCharacterId é obrigatório em heroFragment e proibido nos demais kinds.',
  });

export default materialSchema;
