import type { Hero, ItemInstance } from '@paths-beyond/core';
import type { ContentCatalog } from '@paths-beyond/content';
import { describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { createInMemoryRateLimiter } from '../src/battle/rateLimit.js';
import {
  createMemoryArenaDefenseRepository,
  createMemoryHeroRepository,
  createMemoryPlayerRepository,
  createMemoryReplayRepository,
  createMemorySeasonRepository,
} from '../src/repository/memoryRepository.js';
import type { Player, StoredHero } from '../src/repository/types.js';
import { loadShopCatalog, type ShopCatalog } from '../src/shop/catalog.js';

const emptyCatalog: ContentCatalog = {
  classes: {},
  skills: {},
  items: {},
  itemSets: {},
  effects: {},
  valorSkills: {},
  weaponDuelRanges: { sword: 1, axe: 1, spear: 1, bow: 2, arcane: 2, nature: 2, holy: 2 },
  maps: {},
  comps: [],
  encounters: [],
  baselineReactionSkillIds: [],
};

describe('loadShopCatalog() — conteúdo real de packages/data', () => {
  it('carrega as ofertas reais e resolve cada uma contra um item real', () => {
    const catalog = loadShopCatalog();
    const offers = Object.values(catalog);
    expect(offers.length).toBeGreaterThan(0);
    for (const offer of offers) {
      expect(offer.item.id).toBeTruthy();
      expect(offer.priceMarks).toBeGreaterThan(0);
    }
  });

  it('é determinístico — carregar duas vezes produz o mesmo catálogo', () => {
    expect(JSON.stringify(loadShopCatalog())).toBe(JSON.stringify(loadShopCatalog()));
  });
});

const TOKEN = 'token-comprador';

const weaponItem: ItemInstance = {
  id: 'item-espada-loja',
  setId: 'set-teste',
  slot: 'weapon',
  rarity: 'common',
  ilvl: 58,
  mainstat: { stat: 'atk', value: 20 },
  substats: [],
  enhance: 0,
  reforged: false,
};

const necklaceItem: ItemInstance = {
  id: 'item-colar-loja',
  setId: 'set-teste',
  slot: 'necklace',
  rarity: 'common',
  ilvl: 58,
  mainstat: { stat: 'hp', value: 40 },
  substats: [],
  enhance: 0,
  reforged: false,
};

const testShopCatalog: ShopCatalog = {
  'offer-espada': { id: 'offer-espada', item: weaponItem, priceMarks: 50 },
  'offer-colar': { id: 'offer-colar', item: necklaceItem, priceMarks: 30 },
};

function buildHero(overrides: Partial<Hero> = {}): Hero {
  return {
    id: 'heroi-comprador',
    classId: 'classe-teste',
    level: 10,
    exp: 0,
    awakening: 0,
    imprint: 0,
    talents: {},
    equipment: { weapon: 'item-espada-velha', helmet: null, armor: null, necklace: null, ring: null, boots: null },
    weaponType: 'sword',
    duelSkills: [],
    mapSkills: [],
    tacticsScript: [],
    ...overrides,
  };
}

const oldWeapon: ItemInstance = { ...weaponItem, id: 'item-espada-velha', mainstat: { stat: 'atk', value: 5 } };

function buildTestApp(players: readonly Player[], heroes: readonly StoredHero[], shopCatalog: ShopCatalog = testShopCatalog) {
  const repository = createMemoryPlayerRepository(players);
  const heroRepository = createMemoryHeroRepository(heroes);
  return { app: buildApp({
    repository,
    heroRepository,
    arenaDefenseRepository: createMemoryArenaDefenseRepository(),
    replayRepository: createMemoryReplayRepository(),
    seasonRepository: createMemorySeasonRepository(),
    catalog: emptyCatalog,
    shopCatalog,
    rateLimiter: createInMemoryRateLimiter({ maxRequests: 1000, windowMs: 60_000 }),
  }), heroRepository };
}

describe('GET /shop/catalog', () => {
  it('rejeita sem autenticação', async () => {
    const { app } = buildTestApp([], []);
    const response = await app.inject({ method: 'GET', url: '/shop/catalog' });
    expect(response.statusCode).toBe(401);
  });

  it('lista as ofertas com item e preço', async () => {
    const buyer: Player = { id: 'player-comprador', token: TOKEN, displayName: 'Comprador', elo: 1200, arenaMarks: 100 };
    const { app } = buildTestApp([buyer], []);
    const response = await app.inject({ method: 'GET', url: '/shop/catalog', headers: { 'x-player-token': TOKEN } });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual([
      { id: 'offer-espada', itemId: 'item-espada-loja', slot: 'weapon', priceMarks: 50 },
      { id: 'offer-colar', itemId: 'item-colar-loja', slot: 'necklace', priceMarks: 30 },
    ]);
  });
});

describe('POST /shop/purchase', () => {
  const buyer: Player = { id: 'player-comprador', token: TOKEN, displayName: 'Comprador', elo: 1200, arenaMarks: 100 };
  const hero: StoredHero = { ownerPlayerId: 'player-comprador', hero: buildHero(), equippedItems: [oldWeapon] };

  it('rejeita sem autenticação', async () => {
    const { app } = buildTestApp([buyer], [hero]);
    const response = await app.inject({ method: 'POST', url: '/shop/purchase', payload: { heroId: hero.hero.id, offerId: 'offer-espada' } });
    expect(response.statusCode).toBe(401);
  });

  it('rejeita oferta desconhecida', async () => {
    const { app } = buildTestApp([buyer], [hero]);
    const response = await app.inject({
      method: 'POST', url: '/shop/purchase', headers: { 'x-player-token': TOKEN },
      payload: { heroId: hero.hero.id, offerId: 'oferta-que-nao-existe' },
    });
    expect(response.statusCode).toBe(404);
  });

  it('rejeita herói alheio', async () => {
    const outroHero: StoredHero = { ownerPlayerId: 'outro-jogador', hero: buildHero({ id: 'heroi-alheio' }), equippedItems: [] };
    const { app } = buildTestApp([buyer], [outroHero]);
    const response = await app.inject({
      method: 'POST', url: '/shop/purchase', headers: { 'x-player-token': TOKEN },
      payload: { heroId: 'heroi-alheio', offerId: 'offer-espada' },
    });
    expect(response.statusCode).toBe(403);
  });

  it('rejeita quando o jogador não tem marcas suficientes', async () => {
    const pobre: Player = { id: 'player-pobre', token: 'token-pobre', displayName: 'Pobre', elo: 1200, arenaMarks: 10 };
    const heroDoPobre: StoredHero = { ownerPlayerId: 'player-pobre', hero: buildHero({ id: 'heroi-pobre' }), equippedItems: [] };
    const { app } = buildTestApp([pobre], [heroDoPobre]);
    const response = await app.inject({
      method: 'POST', url: '/shop/purchase', headers: { 'x-player-token': 'token-pobre' },
      payload: { heroId: 'heroi-pobre', offerId: 'offer-espada' },
    });
    expect(response.statusCode).toBe(400);
  });

  it('compra com sucesso: debita marcas e equipa o item novo no lugar do antigo do mesmo slot', async () => {
    const { app, heroRepository } = buildTestApp([buyer], [hero]);
    const response = await app.inject({
      method: 'POST', url: '/shop/purchase', headers: { 'x-player-token': TOKEN },
      payload: { heroId: hero.hero.id, offerId: 'offer-espada' },
    });
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.arenaMarks).toBe(50); // 100 - 50
    expect(body.hero.equipment.weapon).toBe('item-espada-loja');
    expect(body.equippedItems).toHaveLength(1); // trocou, não acumulou
    expect(body.equippedItems[0].id).toBe('item-espada-loja');

    const meResponse = await app.inject({ method: 'GET', url: '/me', headers: { 'x-player-token': TOKEN } });
    expect(meResponse.json().arenaMarks).toBe(50);

    const stored = await heroRepository.getHeroById(hero.hero.id);
    expect(stored?.hero.equipment.weapon).toBe('item-espada-loja');
  });

  it('comprar um item de slot diferente não remove o já equipado', async () => {
    const { app } = buildTestApp([buyer], [hero]);
    const response = await app.inject({
      method: 'POST', url: '/shop/purchase', headers: { 'x-player-token': TOKEN },
      payload: { heroId: hero.hero.id, offerId: 'offer-colar' },
    });
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.hero.equipment.weapon).toBe('item-espada-velha'); // continua equipada
    expect(body.hero.equipment.necklace).toBe('item-colar-loja');
    expect(body.equippedItems).toHaveLength(2);
  });
});
