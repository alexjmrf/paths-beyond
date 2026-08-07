import { z } from 'zod';
import { idSchema } from './shared.js';

// §10 — "na loja de PvP venda gear de set específico e cosméticos — nunca poder bruto."
// Uma oferta é só uma referência a um item real já existente em `items/` + um preço em
// marcas de arena; nenhum item exclusivo/mais forte é inventado pra loja (o que garante
// "nunca poder bruto" — a loja não pode vender nada que não exista fora dela).
// Cosméticos ficam de fora desta fatia: nenhum tipo de conteúdo cosmético existe ainda em
// packages/core/packages/data (decisão registrada em DECISIONS.md, M8 sub-sessão 6).
const arenaShopOfferSchema = z.object({
  id: idSchema,
  itemId: idSchema,
  priceMarks: z.number().int().positive(),
});

export default arenaShopOfferSchema;
