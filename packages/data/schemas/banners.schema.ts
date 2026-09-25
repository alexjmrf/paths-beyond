import { z } from 'zod';
import { idSchema } from './shared.js';

// §10 (M18) — o BANNER de invocação. Reescrito no M38 3/N (D54/D55) nos TRÊS tipos que o
// usuário desenhou: o rotativo de personagem, o rotativo de artefato e o genérico misto.
//
// A MECÂNICA da rolagem não mora aqui nem em `packages/core`: ela vive em
// `packages/gacha` (D15/§15). Este arquivo declara só o dado que ela consome.
//
// **O peso e a curva são INTEIROS, e é isto que mantém o sorteio livre de ponto flutuante
// (regra 2).** A curva de soft pity é em milésimos (6 = 0,6%) e o peso decide quem sai DENTRO
// do rank que a curva escolheu.
//
// `.strict()` em tudo pelo mesmo motivo de sempre: o erro provável aqui é alguém autorar uma
// `rate: 0.02`, e um schema permissivo a aceitaria, o motor a ignoraria, e o banner rodaria
// com taxas que ninguém declarou.
//
// O que NÃO é conferido aqui, porque cruza arquivos: que o destaque é `hero`, que o rotativo
// não tem outro `hero`, que o artefato do token é a assinatura do destaque. Isso é
// `packages/content` (carga) e `validateBanner` de `packages/gacha`.

// NÃO existe `rank` na entrada, e a ausência é deliberada (D49/D50, M37): o rank de base
// mora no personagem e no artefato, e quem o leva ao pool é `packages/content`, derivando.
const entradaBase = {
  weight: z.number().int().positive(),
  // O que a duplicata paga. Declarado, e não derivado do id por convenção de nome.
  fragmentMaterialId: idSchema,
};
const entradaDePersonagem = z.object({ characterId: idSchema, ...entradaBase }).strict();
const entradaDeArtefato = z.object({ artifactId: idSchema, ...entradaBase }).strict();
const entrada = z.union([entradaDePersonagem, entradaDeArtefato]);

const pityThresholds = z
  .object({
    adventurer: z.number().int().positive(),
    hero: z.number().int().positive(),
  })
  .strict();

// D54 — a curva de Genshin: `baseRate` até a rampa, `+step` por rolagem a partir de
// `softStart`, e 1000 no teto (`pityThresholds.hero`). Milésimos inteiros.
const softPity = z
  .object({
    baseRate: z.number().int().positive(),
    softStart: z.number().int().positive(),
    step: z.number().int().positive(),
  })
  .strict();

const comum = {
  id: idSchema,
  name: z.string().min(1),
  pityThresholds,
  softPity,
};

// D54 — cada rotativo "fica ativo por um tempo e depois sai". A janela mora no dado; quem
// lê o relógio é o servidor, nunca o core.
const janela = {
  activeFrom: z.string().datetime({ offset: true }),
  activeUntil: z.string().datetime({ offset: true }),
};

const rotativoDePersonagem = z
  .object({
    ...comum,
    ...janela,
    kind: z.literal('rotatingCharacter'),
    featuredCharacterId: idSchema,
    // O token de 1,5·P (roadmap do M38). Só o limiar é autorado: o artefato que ele entrega é
    // a assinatura do destaque, derivada do catálogo de artefatos por `packages/content`.
    tokenThreshold: z.number().int().positive(),
    pool: z.array(entradaDePersonagem).min(1),
  })
  .strict();

const rotativoDeArtefato = z
  .object({
    ...comum,
    ...janela,
    kind: z.literal('rotatingArtifact'),
    featuredArtifactId: idSchema,
    pool: z.array(entradaDeArtefato).min(1),
  })
  .strict();

const generico = z
  .object({
    ...comum,
    kind: z.literal('generic'),
    // D54 — a cada `choiceEvery` rolagens, uma escolha de qualquer `hero` do pool.
    choiceEvery: z.number().int().positive(),
    // D55 — misto: personagens e artefatos no mesmo pool.
    pool: z.array(entrada).min(1),
  })
  .strict();

type Entrada = z.infer<typeof entrada>;
const idDe = (e: Entrada) => ('characterId' in e ? e.characterId : e.artifactId);

const bannerSchema = z
  .discriminatedUnion('kind', [rotativoDePersonagem, rotativoDeArtefato, generico])
  .refine((banner) => new Set(banner.pool.map(idDe)).size === banner.pool.length, {
    message: 'a mesma entrada não pode aparecer duas vezes no pool.',
  })
  .refine((banner) => banner.softPity.softStart <= banner.pityThresholds.hero, {
    message: 'a rampa do soft pity precisa começar dentro do teto duro (softStart <= pityThresholds.hero).',
  })
  .refine((banner) => banner.kind === 'generic' || Date.parse(banner.activeFrom) < Date.parse(banner.activeUntil), {
    message: 'a janela do rotativo precisa começar antes de terminar.',
  })
  .refine(
    (banner) => {
      if (banner.kind === 'rotatingCharacter') return banner.pool.some((e) => e.characterId === banner.featuredCharacterId);
      if (banner.kind === 'rotatingArtifact') return banner.pool.some((e) => e.artifactId === banner.featuredArtifactId);
      return true;
    },
    { message: 'o destaque do rotativo precisa estar no pool.' },
  );

export default bannerSchema;
