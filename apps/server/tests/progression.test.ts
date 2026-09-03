import { loadCatalogFromDisk } from '@paths-beyond/content';
import { resolveAutoBattle, resolveHeroStatSheet, type Hero, type ItemInstance } from '@paths-beyond/core';
import { describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { createInMemoryRateLimiter } from '../src/battle/rateLimit.js';
import {
  createMemoryArenaDefenseRepository,
  createMemoryCharacterOwnershipRepository,
  createMemoryEconomyRepository,
  createMemoryHeroRepository,
  createMemoryPlayerRepository,
  createMemoryReplayRepository,
  createMemoryRewardsRepository,
  createMemorySeasonRepository,
} from '../src/repository/memoryRepository.js';
import { DEFAULT_PVE_ACCOUNT } from '../src/repository/types.js';

// §10 (M14, sub-sessão 4/N) — as rotas de progressão e o CICLO DE ACEITE da milestone:
// "farm → drop → enhance → equipar → subir de poder".
//
// O teste do ciclo mede o poder no fim: o stat sheet do herói, resolvido pelo core a partir
// do que está no banco, tem de ser maior do que era antes. Sem essa medida, "subir de poder"
// seria uma sequência de 200s.

const TICKET_SECRET = 'segredo-de-teste';
const TOKEN = 'token-progressao';
const SEXTA = Date.UTC(2024, 0, 5, 12);

const catalog = loadCatalogFromDisk();

function heroi(
  id: string,
  classId: string,
  weaponType: Hero['weaponType'],
  skill: string,
  level = 50,
  // M18 2/N — o fragmento passou a pertencer ao PERSONAGEM. Um herói sem `characterId`
  // deixou de ser um caso "sem fragmento" e virou um caso "não é personagem": são dois
  // erros diferentes, e este parâmetro é o que permite montar os dois.
  characterId?: string,
): Hero {
  return {
    id,
    characterId,
    classId,
    level,
    exp: 0,
    awakening: 0,
    imprint: 0,
    talents: {},
    equipment: { weapon: null, helmet: null, armor: null, necklace: null, ring: null, boots: null },
    weaponType,
    duelSkills: [skill],
    mapSkills: [],
    tacticsScript: [{ enabled: true, skillId: skill, conditions: [] }],
  };
}

// O herói cujo PERSONAGEM tem fragmento declarado no catálogo
// (`material-fragmento-hero-jogador`). Desde M18 2/N o id da instância e o do personagem
// são declarados separados de propósito: enquanto fossem a mesma string, a rota poderia
// estar comparando o campo errado e passaria assim mesmo.
const HERO_COM_FRAGMENTO = 'heroi-do-comandante';
const PERSONAGEM_COM_FRAGMENTO = 'hero-jogador';

// §8.1 (M17, 2/N) — `resolveHeroStatSheet` passou a receber a árvore do PERSONAGEM em vez
// de lê-la da classe. Os heróis deste arquivo são montados por `heroi()` acima, sem
// `characterId` e com `talents: {}`: árvore vazia é a entrada FIEL a eles, e não um
// atalho. O que este arquivo mede é awakening, imprint e equipamento mexendo no stat —
// talento tem os testes dele em `packages/core` e o conteúdo dele em `elenco.test.ts`.
const ARVORE_DE_TESTE: readonly [] = [];

interface Harness {
  readonly app: ReturnType<typeof buildApp>;
  readonly heroRepository: ReturnType<typeof createMemoryHeroRepository>;
  readonly economyRepository: ReturnType<typeof createMemoryEconomyRepository>;
  readonly ownershipRepository: ReturnType<typeof createMemoryCharacterOwnershipRepository>;
  readonly rewardsRepository: ReturnType<typeof createMemoryRewardsRepository>;
  now: number;
}

function buildHarness(options: { gold?: number; stones?: number } = {}): Harness {
  const playerRepository = createMemoryPlayerRepository([
    {
      id: 'player-1',
      token: TOKEN,
      displayName: 'Progressor',
      elo: 1200,
      arenaMarks: 0,
      ...DEFAULT_PVE_ACCOUNT,
      gold: options.gold ?? 0,
      stones: options.stones ?? 0,
      energy: { stored: catalog.economyRules.energy.max, asOfMs: SEXTA },
    },
  ]);

  const heroRepository = createMemoryHeroRepository([
    {
      ownerPlayerId: 'player-1',
      hero: heroi(
        HERO_COM_FRAGMENTO,
        'class-espadachim',
        'sword',
        'skill-ataque-espadachim',
        50,
        PERSONAGEM_COM_FRAGMENTO,
      ),
      equippedItems: [],
    },
    {
      // Sem `characterId`: é a forma do `dev-arqueiro` do servidor de desenvolvimento, e
      // desde M18 2/N ela é recusada com um motivo em vez de nunca casar em silêncio.
      ownerPlayerId: 'player-1',
      hero: heroi('heroi-2', 'class-couracado', 'axe', 'skill-ataque-couracado'),
      equippedItems: [],
    },
    {
      // Personagem de verdade, mas um que o catálogo de materiais não conhece: é o caso
      // "sem fragmento declarado", que era o único antes e agora é o segundo dos dois.
      ownerPlayerId: 'player-1',
      hero: heroi('heroi-3', 'class-couracado', 'axe', 'skill-ataque-couracado', 50, 'personagem-inexistente'),
      equippedItems: [],
    },
  ]);

  const economyRepository = createMemoryEconomyRepository();

  const ownershipRepository = createMemoryCharacterOwnershipRepository();
  const rewardsRepository = createMemoryRewardsRepository();
  const harness: Harness = {
    now: SEXTA,
    heroRepository,
    economyRepository,
    ownershipRepository,
    rewardsRepository,
    app: buildApp({
      repository: playerRepository,
      heroRepository,
      arenaDefenseRepository: createMemoryArenaDefenseRepository(),
      replayRepository: createMemoryReplayRepository(),
      seasonRepository: createMemorySeasonRepository(),
      economyRepository,
      ownershipRepository,
      rewardsRepository,
      catalog,
      shopCatalog: {},
      rateLimiter: createInMemoryRateLimiter({ maxRequests: 1000, windowMs: 60_000 }),
      ticketSecret: TICKET_SECRET,
      now: () => harness.now,
    }),
  };
  return harness;
}

async function post(h: Harness, url: string, payload: Record<string, unknown>) {
  const response = await h.app.inject({ method: 'POST', url, headers: { 'x-player-token': TOKEN }, payload });
  return { status: response.statusCode, body: response.json() as any };
}

async function economia(h: Harness) {
  const response = await h.app.inject({ method: 'GET', url: '/me/economy', headers: { 'x-player-token': TOKEN } });
  return response.json() as any;
}

// Joga uma masmorra de verdade e devolve o que caiu — o começo do ciclo.
async function farmar(h: Harness, dungeonId: string, heroIds = [HERO_COM_FRAGMENTO, 'heroi-2']) {
  const ticket = await post(h, `/dungeons/${dungeonId}/ticket`, { heroIds });
  expect(ticket.status).toBe(200);
  const jogada = resolveAutoBattle({ setup: ticket.body.setup, seed: ticket.body.seed });
  const run = await post(h, `/dungeons/${dungeonId}/run`, {
    nonce: ticket.body.nonce,
    heroIds,
    commands: jogada.commands,
  });
  expect(run.body.outcome).toBe('victory');
  return run.body.rewards as { items: ItemInstance[]; materials: Record<string, number>; gold: number; stones: number };
}

describe('POST /heroes/:heroId/awaken', () => {
  it('rejeita herói de outro jogador', async () => {
    const h = buildHarness();
    const response = await h.app.inject({
      method: 'POST',
      url: '/heroes/heroi-fantasma/awaken',
      headers: { 'x-player-token': TOKEN },
      payload: { nonce: 'n1' },
    });
    expect(response.statusCode).toBe(403);
  });

  it('sem material, recusa e não cobra ouro', async () => {
    const h = buildHarness({ gold: 999_999 });
    const resultado = await post(h, `/heroes/${HERO_COM_FRAGMENTO}/awaken`, { nonce: 'n-awaken-1' });
    expect(resultado.status).toBe(400);
    expect((await economia(h)).wallet.gold).toBe(999_999);
  });

  it('com material e ouro, sobe o rank e o STAT do herói aumenta', async () => {
    const h = buildHarness({ gold: 999_999 });
    const passo = catalog.economyRules.awakening[0]!;
    await h.economyRepository.setMaterials('player-1', { ...passo.materials });

    const antes = await h.heroRepository.getHeroById(HERO_COM_FRAGMENTO);
    const classDef = catalog.classes[antes!.hero.classId]!;
    const poderAntes = resolveHeroStatSheet({
      hero: antes!.hero,
      classDef,
      equippedItems: [],
      itemSets: catalog.itemSets,
      talentTree: ARVORE_DE_TESTE,
    });

    const resultado = await post(h, `/heroes/${HERO_COM_FRAGMENTO}/awaken`, { nonce: 'n-awaken-2' });
    expect(resultado.status).toBe(200);
    expect(resultado.body.hero.awakening).toBe(1);
    expect(resultado.body.wallet.gold).toBe(999_999 - passo.gold);

    const depois = await h.heroRepository.getHeroById(HERO_COM_FRAGMENTO);
    const poderDepois = resolveHeroStatSheet({
      hero: depois!.hero,
      classDef,
      equippedItems: [],
      itemSets: catalog.itemSets,
      talentTree: ARVORE_DE_TESTE,
    });
    expect(poderDepois.atk).toBeGreaterThan(poderAntes.atk);
  });

  it('o mesmo nonce não cobra duas vezes', async () => {
    const h = buildHarness({ gold: 999_999 });
    await h.economyRepository.setMaterials('player-1', { 'material-nucleo-de-despertar': 99 });

    const primeira = await post(h, `/heroes/${HERO_COM_FRAGMENTO}/awaken`, { nonce: 'n-repetido' });
    const ouroDepois = (await economia(h)).wallet.gold;
    const segunda = await post(h, `/heroes/${HERO_COM_FRAGMENTO}/awaken`, { nonce: 'n-repetido' });

    expect(primeira.status).toBe(200);
    expect(segunda.status).toBe(409);
    expect((await economia(h)).wallet.gold).toBe(ouroDepois);
  });
});

describe('POST /heroes/:heroId/imprint', () => {
  it('o fragmento é do catálogo: personagem sem fragmento declarado é recusado', async () => {
    const h = buildHarness();
    const resultado = await post(h, '/heroes/heroi-3/imprint', { nonce: 'n-imprint-1' });
    expect(resultado.status).toBe(400);
    expect(resultado.body.error).toContain('fragmento');
  });

  it('herói que não é personagem é recusado com o motivo certo, e não como "sem fragmento"', async () => {
    // Os dois erros eram indistinguíveis antes de M18 2/N, porque a busca por `hero.id`
    // simplesmente não achava nada nos dois casos.
    const h = buildHarness();
    const resultado = await post(h, '/heroes/heroi-2/imprint', { nonce: 'n-imprint-1b' });
    expect(resultado.status).toBe(400);
    expect(resultado.body.error).toContain('não é um personagem');
  });

  it('com fragmentos, sobe o imprint e o stat do herói aumenta', async () => {
    const h = buildHarness();
    await h.economyRepository.setMaterials('player-1', { 'material-fragmento-hero-jogador': 5 });

    const antes = await h.heroRepository.getHeroById(HERO_COM_FRAGMENTO);
    const classDef = catalog.classes[antes!.hero.classId]!;
    const poderAntes = resolveHeroStatSheet({ hero: antes!.hero, classDef, equippedItems: [], itemSets: catalog.itemSets, talentTree: ARVORE_DE_TESTE });

    const resultado = await post(h, `/heroes/${HERO_COM_FRAGMENTO}/imprint`, { nonce: 'n-imprint-2' });
    expect(resultado.status).toBe(200);
    expect(resultado.body.hero.imprint).toBe(1);

    const depois = await h.heroRepository.getHeroById(HERO_COM_FRAGMENTO);
    const poderDepois = resolveHeroStatSheet({ hero: depois!.hero, classDef, equippedItems: [], itemSets: catalog.itemSets, talentTree: ARVORE_DE_TESTE });
    expect(poderDepois.atk).toBeGreaterThanOrEqual(poderAntes.atk);
    expect(JSON.stringify(poderDepois)).not.toBe(JSON.stringify(poderAntes));
  });

  it('sem fragmento suficiente, recusa', async () => {
    const h = buildHarness();
    const resultado = await post(h, `/heroes/${HERO_COM_FRAGMENTO}/imprint`, { nonce: 'n-imprint-3' });
    expect(resultado.status).toBe(400);
  });
});

describe('POST /items/:itemId/enhance', () => {
  it('cobra pedras e ouro — o sumidouro que faltava às pedras', async () => {
    const h = buildHarness({ gold: 999_999, stones: 999 });
    const recompensa = await farmar(h, 'dungeon-forja-abandonada');
    const item = recompensa.items[0]!;

    const custo = catalog.economyRules.enhance[0]!;
    const antes = await economia(h);
    const resultado = await post(h, `/items/${item.id}/enhance`, { nonce: 'n-enhance-1' });

    expect(resultado.status).toBe(200);
    expect(resultado.body.cost).toEqual(custo);
    const depois = await economia(h);
    expect(antes.wallet.stones - depois.wallet.stones).toBe(custo.stones);
    expect(antes.wallet.gold - depois.wallet.gold).toBe(custo.gold);
  });

  it('o primeiro marco de §7.3 é 100%: o item sai de +0 para +3', async () => {
    const h = buildHarness({ gold: 999_999, stones: 999 });
    const recompensa = await farmar(h, 'dungeon-forja-abandonada');
    const item = recompensa.items[0]!;
    expect(item.enhance).toBe(0);

    const resultado = await post(h, `/items/${item.id}/enhance`, { nonce: 'n-enhance-2' });
    expect(resultado.body.success).toBe(true);
    expect(resultado.body.item.enhance).toBe(3);
  });

  it('sem pedras, recusa e não cobra ouro', async () => {
    const h = buildHarness({ gold: 999_999, stones: 0 });
    const recompensa = await farmar(h, 'dungeon-forja-abandonada');
    const item = recompensa.items[0]!;

    // O ouro do farm já entrou na conta: o que importa é que a tentativa recusada não
    // debita nada, não que o saldo seja o inicial.
    const ouroAntes = (await economia(h)).wallet.gold;
    const resultado = await post(h, `/items/${item.id}/enhance`, { nonce: 'n-enhance-3' });
    expect(resultado.status).toBe(400);
    expect(resultado.body.error).toContain('pedras');
    expect((await economia(h)).wallet.gold).toBe(ouroAntes);
  });

  it('item que não é seu não é encontrado', async () => {
    const h = buildHarness({ gold: 999_999, stones: 999 });
    const resultado = await post(h, '/items/item-que-nao-existe/enhance', { nonce: 'n-enhance-4' });
    expect(resultado.status).toBe(404);
  });
});

describe('POST /heroes/:heroId/equip', () => {
  it('equipa do inventário e o item sai de lá', async () => {
    const h = buildHarness();
    const recompensa = await farmar(h, 'dungeon-forja-abandonada');
    const item = recompensa.items[0]!;

    const resultado = await post(h, `/heroes/${HERO_COM_FRAGMENTO}/equip`, { nonce: 'n-equip-1', itemId: item.id });
    expect(resultado.status).toBe(200);
    expect(resultado.body.hero.equipment[item.slot]).toBe(item.id);

    const inventario = (await economia(h)).inventory as ItemInstance[];
    expect(inventario.find((i) => i.id === item.id)).toBeUndefined();
  });

  it('o item substituído VOLTA para o inventário — nada some', async () => {
    const h = buildHarness();
    const primeira = await farmar(h, 'dungeon-forja-abandonada');
    const segunda = await farmar(h, 'dungeon-forja-abandonada');

    // Dois itens do mesmo slot: o segundo empurra o primeiro de volta ao inventário.
    const item1 = primeira.items[0]!;
    const item2 = [...segunda.items, ...primeira.items.slice(1)].find((i) => i.slot === item1.slot);
    if (!item2) return; // as duas runs não deram o mesmo slot: nada a provar aqui

    await post(h, `/heroes/${HERO_COM_FRAGMENTO}/equip`, { nonce: 'n-equip-2', itemId: item1.id });
    await post(h, `/heroes/${HERO_COM_FRAGMENTO}/equip`, { nonce: 'n-equip-3', itemId: item2.id });

    const inventario = (await economia(h)).inventory as ItemInstance[];
    expect(inventario.find((i) => i.id === item1.id), 'o item substituído sumiu').toBeDefined();
  });
});

// O critério de aceite raiz de M14, medido de ponta a ponta pelas rotas.
describe('ciclo completo: farm → drop → enhance → equipar → subir de poder', () => {
  it('o poder do herói é MAIOR no fim do ciclo do que no começo', async () => {
    const h = buildHarness({ gold: 999_999, stones: 999 });
    const classDef = catalog.classes['class-espadachim']!;

    const inicial = await h.heroRepository.getHeroById(HERO_COM_FRAGMENTO);
    const poderInicial = resolveHeroStatSheet({
      hero: inicial!.hero,
      classDef,
      equippedItems: inicial!.equippedItems,
      itemSets: catalog.itemSets,
      talentTree: ARVORE_DE_TESTE,
    });

    // 1. Farm: joga a masmorra de equipamento e recebe drop.
    const recompensa = await farmar(h, 'dungeon-forja-abandonada');
    expect(recompensa.items.length).toBeGreaterThan(0);
    const item = recompensa.items[0]!;

    // 2. Enhance: +0 → +3 (o marco de 100% de §7.3).
    const aprimorado = await post(h, `/items/${item.id}/enhance`, { nonce: 'n-ciclo-enhance' });
    expect(aprimorado.status).toBe(200);
    expect(aprimorado.body.item.enhance).toBe(3);

    // 3. Equipar.
    const equipado = await post(h, `/heroes/${HERO_COM_FRAGMENTO}/equip`, {
      nonce: 'n-ciclo-equip',
      itemId: item.id,
    });
    expect(equipado.status).toBe(200);

    // 4. Subir de poder: o stat sheet resolvido do banco, não uma promessa da rota.
    const final = await h.heroRepository.getHeroById(HERO_COM_FRAGMENTO);
    const poderFinal = resolveHeroStatSheet({
      hero: final!.hero,
      classDef,
      equippedItems: final!.equippedItems,
      itemSets: catalog.itemSets,
      talentTree: ARVORE_DE_TESTE,
    });

    const somaAntes = Object.values(poderInicial).reduce((s, n) => s + n, 0);
    const somaDepois = Object.values(poderFinal).reduce((s, n) => s + n, 0);
    expect(somaDepois).toBeGreaterThan(somaAntes);
  });
});
