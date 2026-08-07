import type { FastifyPluginAsync } from 'fastify';
import type { HeroRepository, PlayerRepository } from '../repository/types.js';
import type { ShopCatalog } from './catalog.js';

export interface ShopRoutesOptions {
  readonly repository: PlayerRepository;
  readonly heroRepository: HeroRepository;
  readonly catalog: ShopCatalog;
}

interface PurchaseBody {
  readonly heroId?: string;
  readonly offerId?: string;
}

// Mesmo padrão de escopo protegido de `battleRoutes`/`matchmakingRoutes`/`seasonRoutes`
// — registrado como filho do escopo que já carrega `authPlugin` em `app.ts`.
export const shopRoutes: FastifyPluginAsync<ShopRoutesOptions> = async (fastify, opts) => {
  fastify.get('/shop/catalog', async () => {
    return Object.values(opts.catalog).map((offer) => ({
      id: offer.id,
      itemId: offer.item.id,
      slot: offer.item.slot,
      priceMarks: offer.priceMarks,
    }));
  });

  fastify.post('/shop/purchase', async (request, reply) => {
    if (!request.player) return reply.code(401).send({ error: 'missing player token' });
    const player = request.player;

    const body = request.body as PurchaseBody;
    if (!body.heroId || !body.offerId) {
      return reply.code(400).send({ error: 'heroId e offerId são obrigatórios' });
    }

    const offer = opts.catalog[body.offerId];
    if (!offer) return reply.code(404).send({ error: 'oferta desconhecida' });

    const stored = await opts.heroRepository.getHeroById(body.heroId);
    if (!stored || stored.ownerPlayerId !== player.id) {
      return reply.code(403).send({ error: 'esse herói não é seu' });
    }

    if (player.arenaMarks < offer.priceMarks) {
      return reply.code(400).send({ error: 'marcas de arena insuficientes' });
    }

    // §10 — "nunca poder bruto": a compra troca o item do MESMO slot (equipar a peça
    // nova substitui a antiga, nunca acumula), exatamente como equipar qualquer outro
    // item — a loja não dá nada que o jogo normal não desse.
    const item = offer.item;
    const remainingEquippedItems = stored.equippedItems.filter((equipped) => equipped.slot !== item.slot);
    const updatedHero = {
      ...stored,
      hero: { ...stored.hero, equipment: { ...stored.hero.equipment, [item.slot]: item.id } },
      equippedItems: [...remainingEquippedItems, item],
    };
    await opts.heroRepository.updateHero(updatedHero);

    const updatedPlayer = await opts.repository.updateArenaMarks(player.id, player.arenaMarks - offer.priceMarks);

    return { hero: updatedHero.hero, equippedItems: updatedHero.equippedItems, arenaMarks: updatedPlayer.arenaMarks };
  });
};
