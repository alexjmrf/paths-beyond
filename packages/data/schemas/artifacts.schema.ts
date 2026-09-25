import { z } from 'zod';
import { idSchema, statKeySchema, statModifierSchema } from './shared.js';

// M38 (D53) — O ARTEFATO: o 7º slot, separado da arma, no molde do artefato do Epic Seven.
// Mirror de `ArtifactDef` em packages/core/src/artifacts/types.ts.
//
// As travas são de FORMA:
// - `classId` obrigatório — a trava por CLASSE (qualquer personagem daquela classe equipa).
//   A trava por PERSONAGEM é da Soul (M39), com outro nome, para ninguém fundir as duas.
// - `rank` de base obrigatório, `adventurer` ou `hero`. `legend` nunca é base: chega-se nele
//   pelo awakening PRÓPRIO do artefato (decisão do usuário), e o rank corrente é função.
// - `.strict()` recusa o que é estado de conta (awakening, imprint, rank corrente).
// - A passiva é UMA, e o imprint só mexe no número dela (decisão do usuário: com PvP,
//   duplicata é status, não mecânica nova). Não há campo onde declarar efeito por imprint.

const naoDecrescente = (valores: readonly number[]) => valores.every((v, i) => i === 0 || v >= valores[i - 1]!);
const curva = (degraus: number) =>
  z
    .array(z.number().int().min(0))
    .length(degraus)
    .refine(naoDecrescente, { message: 'a curva não pode descer: evoluir nunca tira poder.' });

const porAwakening = curva(7); // awakening 0..6
const porImprint = curva(6); // imprint 0..5

const passiveSchema = z.discriminatedUnion('t', [
  z.object({ t: z.literal('stat'), stat: statKeySchema, pctByImprint: porImprint }).strict(),
  z.object({ t: z.literal('startingPool'), pool: z.enum(['ap', 'pp']), amountByImprint: porImprint }).strict(),
  z.object({ t: z.literal('reaction'), skillId: idSchema, multiplierByImprint: porImprint.optional() }).strict(),
]);

const artifactSchema = z
  .object({
    id: idSchema,
    // M38 2/N — de QUEM o artefato é assinatura (o banner rotativo garante o artefato do Hero
    // em destaque, D54). NÃO é trava: quem equipa é decidido por `classId`. É associação.
    signatureOf: idSchema,
    name: z.string().min(1),
    classId: idSchema,
    rank: z.enum(['adventurer', 'hero']),
    // O stat FIXO de todo artefato é `atk` (decisão do usuário: um fixo + um variável).
    atkByAwakening: porAwakening,
    variableStat: z
      .object({
        stat: statKeySchema.refine((s) => s !== 'atk', { message: 'o stat variável não pode ser atk — o fixo já é atk.' }),
        byAwakening: porAwakening,
      })
      .strict(),
    // índice 0..5 = imprint 0..5, bônus total naquele nível — mesma forma de `imprintFlat` da classe.
    imprintFlat: z.array(z.array(statModifierSchema)).length(6),
    passive: passiveSchema,
  })
  .strict();

export default artifactSchema;
