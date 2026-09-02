import { z } from 'zod';
import { idSchema } from './shared.js';

// §10 (M14) — a tabela única de números da economia PvE: energia, custo de awakening e
// custo de imprint. Tipo de conteúdo com um arquivo só, mesmo padrão de
// `weapon-duel-ranges/` (M9).
//
// Energia: decisão do usuário nesta fatia — regeneração CONTÍNUA (+1 a cada intervalo) até
// um teto de conta, em vez de recarga diária. §10 só diz "energia de conta limita o farm
// diário", sem número nenhum.

const materialCostSchema = z.record(idSchema, z.number().int().positive());

const economyRulesSchema = z.object({
  id: idSchema,
  energy: z.object({
    max: z.number().int().positive(),
    refillIntervalMs: z.number().int().positive(),
  }),
  // Índice 0 = passo 0→1. §10 fixa a faixa de awakening em 0–6, então são 6 passos; o
  // motor (`awaken`) recusa alto se a tabela for mais curta que o rank corrente, em vez de
  // despertar de graça.
  awakening: z
    .array(z.object({ gold: z.number().int().min(0), materials: materialCostSchema }))
    .length(6),
  // Índice 0 = passo 0→1. São 5 porque `ClassDef.imprintFlat` tem 6 entradas (imprint
  // 0..5) desde M1 — subir além do 5 não teria bônus nenhum para ler.
  imprint: z.array(z.object({ fragments: z.number().int().positive() })).length(5),
  // §7.3 define a mecânica do enhance e as chances, mas nenhum custo. Decisão do usuário
  // (M14 2/N): pedras + ouro — é o que dá sumidouro às pedras, que dropavam desde 1/N sem
  // nada que as gastasse. Um custo por marco (+0→+3 … +12→+15), na mesma ordem de
  // `enhance-rates`.
  enhance: z
    .array(z.object({ gold: z.number().int().min(0), stones: z.number().int().min(0) }))
    .length(5),
  // §10 (M18) — os dois sumidouros da QUARTA moeda, a premium (D17). Ela não se ganha
  // farmando e não paga evolução de personagem: awakening, imprint e enhance continuam em
  // ouro, pedras e material, pela mesma razão que a loja de arena nunca vende poder bruto.
  //
  // O `pityThreshold` aparece aqui E no banner de propósito, e não é duplicação: o do
  // banner é o que a rolagem consome (um banner futuro pode ter pity próprio), e este é o
  // padrão do jogo. Um teste de `packages/content` trava os dois iguais enquanto houver um
  // banner só — divergirem em silêncio seria o defeito.
  summon: z.object({
    premiumCost: z.number().int().positive(),
    pityThreshold: z.number().int().positive(),
  }),
  // "Comprar energia extra para farmar mais", nas palavras do usuário ao decidir D17.
  energyPurchase: z.object({
    premiumCost: z.number().int().positive(),
    energy: z.number().int().positive(),
  }),
});

export default economyRulesSchema;
