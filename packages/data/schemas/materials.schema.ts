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
//
// M38 (D53): `artifactFragment` é a duplicata de ARTEFATO, com `forArtifactId` pela mesma
// razão — obrigatório nele e proibido nos outros.
const materialSchema = z
  .object({
    id: idSchema,
    name: z.string().min(1),
    // M39 1/N — `expTome`: o Tomo de Experiência, o jeito mais eficiente de subir de nível.
    kind: z.enum(['awakening', 'heroFragment', 'artifactFragment', 'generic', 'expTome']),
    // O exp que UM tomo dá. Obrigatório no `expTome` e proibido nos outros.
    exp: z.number().int().positive().optional(),
    forCharacterId: idSchema.optional(),
    forArtifactId: idSchema.optional(),
  })
  .strict()
  .refine((m) => (m.kind === 'heroFragment' ? m.forCharacterId !== undefined : m.forCharacterId === undefined), {
    message: 'forCharacterId é obrigatório em heroFragment e proibido nos demais kinds.',
  })
  .refine((m) => (m.kind === 'artifactFragment' ? m.forArtifactId !== undefined : m.forArtifactId === undefined), {
    message: 'forArtifactId é obrigatório em artifactFragment e proibido nos demais kinds.',
  })
  .refine((m) => (m.kind === 'expTome' ? m.exp !== undefined : m.exp === undefined), {
    message: 'exp é obrigatório em expTome e proibido nos demais kinds.',
  });

export default materialSchema;
