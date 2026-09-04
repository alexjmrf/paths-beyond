import { loadCatalogFromDisk } from '@paths-beyond/content';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { createDevIdentityValidator } from '../src/identity/devIdentity.js';
import { createInMemoryRateLimiter } from '../src/battle/rateLimit.js';
import { runMigrations } from '../src/migrate.js';
import {
  createPostgresArenaDefenseRepository,
  createPostgresCharacterOwnershipRepository,
  createPostgresEconomyRepository,
  createPostgresHeroRepository,
  createPostgresPlayerRepository,
  createPostgresReplayRepository,
  createPostgresRewardsRepository,
  createPostgresSeasonRepository,
} from '../src/repository/postgresRepository.js';
import { loadShopCatalog } from '../src/shop/catalog.js';

// M19 — o app REAL contra o banco REAL.
//
// `repositoryParity.test.ts` prova a camada de repositório; este prova o que o jogador faz.
// A diferença importa porque o defeito que esta milestone encontrou não era de repositório e
// sim de INTEGRAÇÃO: a constraint de `economy_actions` só falha quando uma rota tenta gravar
// uma ação, e nenhuma rota jamais tinha rodado contra Postgres.
//
// A montagem é a MESMA de `apps/server/src/index.ts` — todos os repositórios de Postgres,
// nenhum de memória. Se produção e teste montarem coisas diferentes, o teste volta a não
// dizer nada sobre produção, que é exatamente o buraco que se está fechando.
//
// Pulado sem `DATABASE_URL`, como a bateria de paridade, e ligado no CI pelo mesmo serviço.

const DATABASE_URL = process.env.DATABASE_URL;
const descreve = DATABASE_URL ? describe : describe.skip;

const catalog = loadCatalogFromDisk();
const sufixo = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
const PLAYER = `prod-player-${sufixo}`;
const TOKEN = `prod-token-${sufixo}`;
const AGORA = Date.UTC(2026, 8, 3, 12);

descreve('produção: o app montado como em `index.ts`, contra Postgres', () => {
  let pool: Pool;
  let app: ReturnType<typeof buildApp>;

  beforeAll(async () => {
    pool = new Pool({ connectionString: DATABASE_URL });
    await runMigrations(pool);

    const players = createPostgresPlayerRepository(pool);
    await players.createPlayer({
      id: PLAYER,
      platformProvider: 'dev' as const,
      platformId: TOKEN,
      displayName: 'Produção',
      // Premium para DOIS summons e uma compra de energia. O segundo summon existe para o
      // teste de reenvio: a rota confere o saldo ANTES de reservar o nonce (decisão da M18
      // 3/N — recusar por falta de moeda não pode queimar a chave de idempotência), então
      // com saldo para um só o reenvio bateria em 400 por saldo e nunca chegaria no 409 que
      // se quer medir.
      premium: catalog.premiumRules.summon.premiumCost * 2 + catalog.premiumRules.energyPurchase.premiumCost,
      energy: { stored: catalog.economyRules.energy.max, asOfMs: AGORA },
    });

    app = buildApp({
      repository: players,
      heroRepository: createPostgresHeroRepository(pool),
      arenaDefenseRepository: createPostgresArenaDefenseRepository(pool),
      replayRepository: createPostgresReplayRepository(pool),
      seasonRepository: createPostgresSeasonRepository(pool),
      economyRepository: createPostgresEconomyRepository(pool),
      ownershipRepository: createPostgresCharacterOwnershipRepository(pool),
      rewardsRepository: createPostgresRewardsRepository(pool),
      catalog,
      shopCatalog: loadShopCatalog(),
      rateLimiter: createInMemoryRateLimiter({ maxRequests: 1000, windowMs: 60_000 }),
      ticketSecret: 'segredo-de-teste',
      identityValidator: createDevIdentityValidator(),
      now: () => AGORA,
    });
  });

  afterAll(async () => {
    if (!pool) return;
    for (const [tabela, coluna] of [
      ['player_materials', 'player_id'],
      ['player_items', 'owner_player_id'],
      ['economy_actions', 'player_id'],
      ['player_characters', 'player_id'],
      ['banner_pity', 'player_id'],
      ['heroes', 'owner_player_id'],
    ] as const) {
      await pool.query(`DELETE FROM ${tabela} WHERE ${coluna} = $1`, [PLAYER]).catch(() => undefined);
    }
    await pool.query('DELETE FROM players WHERE id = $1', [PLAYER]).catch(() => undefined);
    await pool.end();
  });

  async function post(url: string, payload: Record<string, unknown>) {
    const response = await app.inject({ method: 'POST', url, headers: { 'x-platform-ticket': `dev:${TOKEN}`}, payload });
    return { status: response.statusCode, body: response.json() as any };
  }

  async function get(url: string) {
    const response = await app.inject({ method: 'GET', url, headers: { 'x-platform-ticket': `dev:${TOKEN}`} });
    return { status: response.statusCode, body: response.json() as any };
  }

  it('a conta nova recebe o núcleo materializado, com linhas de verdade no banco', async () => {
    // §9.4 (M20) — a materialização saiu do `GET` e mora no sign-in explícito. O que se
    // afirma continua sendo o mesmo: a conta nova tem o núcleo, com linha no banco.
    const entrada = await app.inject({
      method: 'POST',
      url: '/accounts/session',
      headers: { 'x-platform-ticket': `dev:${TOKEN}` },
      payload: {},
    });
    expect(entrada.statusCode).toBe(200);

    const { status, body } = await get('/me/heroes');

    expect(status).toBe(200);
    const nucleo = Object.values(catalog.characters).filter((c) => c.acquisition === 'story');
    expect(body.map((e: any) => e.hero.characterId).sort()).toEqual(nucleo.map((c) => c.id).sort());

    // E as instâncias existem NO BANCO, não só na resposta: é a diferença entre materializar
    // e devolver algo montado na hora.
    const linhas = await pool.query('SELECT count(*)::int AS n FROM heroes WHERE owner_player_id = $1', [PLAYER]);
    expect(linhas.rows[0].n).toBe(nucleo.length);
  });

  // O teste que a milestone existe para escrever. Com a migration 0008 como estava, isto
  // devolveria 500 por violação de constraint — o summon inteiro, em produção.
  it('POST /summon funciona ponta a ponta e grava a ação de idempotência', async () => {
    const banner = Object.values(catalog.banners)[0]!;
    const nonce = `prod-summon-${sufixo}`;

    const { status, body } = await post('/summon', { nonce, bannerId: banner.id });

    expect(status).toBe(200);
    expect(['character', 'duplicate']).toContain(body.outcome.kind);

    const acao = await pool.query('SELECT kind FROM economy_actions WHERE nonce = $1', [nonce]);
    expect(acao.rows[0]?.kind).toBe('summon');
  });

  it('o reenvio do mesmo nonce é recusado pela LINHA no banco, e não por um Map', async () => {
    const banner = Object.values(catalog.banners)[0]!;
    const nonce = `prod-summon-${sufixo}`;

    // Com saldo de sobra: o que recusa aqui é `economy_actions`, e é isso que se afirma.
    const reenvio = await post('/summon', { nonce, bannerId: banner.id });

    expect(reenvio.status).toBe(409);
    const acoes = await pool.query('SELECT count(*)::int AS n FROM economy_actions WHERE nonce = $1', [nonce]);
    expect(acoes.rows[0].n).toBe(1);
  });

  it('POST /energy/purchase funciona ponta a ponta e grava a ação', async () => {
    const nonce = `prod-energy-${sufixo}`;

    const { status, body } = await post('/energy/purchase', { nonce });

    expect(status).toBe(200);
    expect(body.energy.stored).toBeGreaterThan(catalog.economyRules.energy.max);

    const acao = await pool.query('SELECT kind FROM economy_actions WHERE nonce = $1', [nonce]);
    expect(acao.rows[0]?.kind).toBe('energy');
  });

  // §10 (M14) — o que se perdia a cada reinício, e o critério de aceite do M19 nomeia os
  // três: material, item de inventário e limpeza de masmorra.
  //
  // "Reiniciar o processo" é simulado do jeito que importa: **pool novo, repositórios
  // novos**. É o que sobra depois de um restart — a RAM some, o banco fica. Derrubar o
  // processo de teste de verdade não provaria mais nada e tornaria a suíte impossível de
  // rodar em CI.
  it('material, item e limpeza sobrevivem a um REINÍCIO do processo', async () => {
    const economia = createPostgresEconomyRepository(pool);
    const itemDeTeste = {
      id: `item-persistente-${sufixo}`,
      setId: 'set-teste',
      slot: 'weapon',
      rarity: 'rare',
      ilvl: 60,
      mainstat: { stat: 'atk', value: 40 },
      substats: [{ stat: 'chc', value: 25, rolls: 1 }],
      enhance: 0,
      reforged: false,
    } as const;

    await economia.setMaterials(PLAYER, { 'material-nucleo-de-despertar': 4 });
    await economia.addItems(PLAYER, [itemDeTeste]);
    await economia.markCleared(PLAYER, 'dungeon-forja-abandonada');

    // O "reinício": conexão nova, repositório novo, nada da execução anterior em memória.
    const poolNovo = new Pool({ connectionString: DATABASE_URL });
    try {
      const depoisDoReinicio = createPostgresEconomyRepository(poolNovo);

      expect(await depoisDoReinicio.getMaterials(PLAYER)).toEqual({ 'material-nucleo-de-despertar': 4 });
      expect((await depoisDoReinicio.listItems(PLAYER)).map((i) => i.id)).toContain(itemDeTeste.id);
      expect(await depoisDoReinicio.listClears(PLAYER)).toContain('dungeon-forja-abandonada');
    } finally {
      await poolNovo.end();
    }
  });
});
