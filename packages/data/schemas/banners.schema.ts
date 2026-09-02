import { z } from 'zod';
import { idSchema } from './shared.js';

// §10 (M18) — o BANNER de invocação. A aquisição de personagens que a economia de M14 já
// tinha a forma de esperar (imprint alimentado por fragmento, awakening, energia) e que só
// faltava a peça de cima.
//
// A MECÂNICA da rolagem não mora aqui nem em `packages/core`: ela vive em
// `packages/gacha` (D15/§15). Este arquivo declara só o dado que ela consome.
//
// **O peso é INTEIRO, e é isto que mantém o sorteio livre de ponto flutuante (regra 2).**
// A escolha é `valor % total` sobre peso acumulado — o mesmo mecanismo de `items/generate`
// e `economy/drops` no core —, então não existe uma única divisão no caminho da decisão e
// não há o que arredondar. A chance em escala 1000 é DERIVADA (`rateOf`, em
// `packages/gacha`) e serve só para a tela mostrar.
//
// `.strict()` pelo mesmo motivo da árvore de coluna (M17 1/N) e do inimigo autorado
// (M17 3/N): o erro provável aqui é alguém autorar uma `rate: 0.02`, e um schema
// permissivo a aceitaria, o motor a ignoraria, e o banner rodaria com taxas que ninguém
// declarou. Falhar alto é o ponto.
const bannerEntrySchema = z
  .object({
    characterId: idSchema,
    weight: z.number().int().positive(),
    // O que a duplicata paga. Declarado, e não derivado do `characterId` por convenção de
    // nome: derivar seria inventar um id de conteúdo, e a convenção quebraria em silêncio
    // no dia em que um personagem tivesse fragmento com outro nome.
    fragmentMaterialId: idSchema,
  })
  .strict();

const bannerSchema = z
  .object({
    id: idSchema,
    name: z.string().min(1),
    // D18 — pity duro contado: depois de N rolagens sem personagem novo, a próxima é
    // garantida. Mora no banner porque é número de balanceamento, e no dado porque a
    // regra 4 não deixa número de balanceamento morar em código.
    pityThreshold: z.number().int().positive(),
    pool: z.array(bannerEntrySchema).min(1),
  })
  .strict()
  .refine((banner) => new Set(banner.pool.map((entry) => entry.characterId)).size === banner.pool.length, {
    message: 'o mesmo personagem não pode aparecer duas vezes no pool.',
  });

export default bannerSchema;
