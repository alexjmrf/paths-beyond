import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Id, ItemInstance } from '@paths-beyond/core';
import arenaShopOfferSchema from '@paths-beyond/data/schemas/arena-shop.schema.js';
import itemSchema from '@paths-beyond/data/schemas/items.schema.js';
import { findJsonFiles } from '@paths-beyond/data/validate.js';

// §10 — "na loja de PvP venda gear de set específico e cosméticos — nunca poder bruto."
// Uma oferta é a referência (`arena-shop/*.json`, packages/data) resolvida contra o item
// real (`items/*.json`) que ela vende — a loja nunca inventa um item exclusivo mais forte.
export interface ShopOffer {
  readonly id: Id;
  readonly item: ItemInstance;
  readonly priceMarks: number;
}

export type ShopCatalog = Readonly<Record<Id, ShopOffer>>;

// Mesmo idioma de `tools/balance/src/loadContent.ts` (findJsonFiles + schema.parse) —
// primeira vez que `apps/server` lê conteúdo real de `packages/data` diretamente (até
// agora `ContentCatalog`, o catálogo de classes/skills/mapas usado por `battle/routes.ts`,
// usa `EMPTY_CATALOG` como placeholder, corte de escopo de M7 ainda em aberto; a loja é
// um catálogo bem menor e mais simples, então resolvê-lo de verdade nesta fatia não
// depende de resolver aquele corte maior primeiro).
export function realDataRootDir(): string {
  const hereDir = fileURLToPath(new URL('.', import.meta.url)); // apps/server/src/shop/
  return join(hereDir, '..', '..', '..', '..', 'packages', 'data');
}

function loadAll<T>(schema: { parse: (input: unknown) => T }, dir: string): T[] {
  return findJsonFiles(dir).map((file) => schema.parse(JSON.parse(readFileSync(file, 'utf8'))));
}

export function loadShopCatalog(dataRootDir: string = realDataRootDir()): ShopCatalog {
  // Mesmo descompasso de tipo Zod-inferido vs. hand-authored já documentado em
  // tools/balance/src/loadContent.ts pra `ItemInstance.enhance` (schema valida `0..15`
  // solto, core tipa como os 6 marcos literais de M4) — cast depois de `schema.parse`
  // já ter validado o valor real.
  const itemList = loadAll(itemSchema, join(dataRootDir, 'items')) as unknown as ItemInstance[];
  const itemsById = new Map(itemList.map((item) => [item.id, item]));

  const offers = loadAll(arenaShopOfferSchema, join(dataRootDir, 'arena-shop'));

  const catalog: Record<Id, ShopOffer> = {};
  for (const offer of offers) {
    const item = itemsById.get(offer.itemId);
    if (!item) throw new Error(`loja de arena referencia item desconhecido: ${offer.itemId}`);
    catalog[offer.id] = { id: offer.id, item, priceMarks: offer.priceMarks };
  }
  return catalog;
}
