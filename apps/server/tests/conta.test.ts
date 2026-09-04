import { loadCatalogFromDisk } from '@paths-beyond/content';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { createInMemoryRateLimiter } from '../src/battle/rateLimit.js';
import { createDevIdentityValidator } from '../src/identity/devIdentity.js';
import { runMigrations } from '../src/migrate.js';
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

// §9.4/§10 (M20) — o CICLO DE VIDA DA CONTA, que nunca existiu.
//
// O projeto nunca teve rota de criação: os jogadores eram semeados no banco, e a M18 6/N
// resolveu o núcleo de quatro derivando-o preguiçosamente dentro de `GET /me/heroes`. Foi a
// decisão certa para aquela fatia e não é uma resposta para "o que acontece quando alguém
// compra o jogo".
//
// **Decisão desta milestone (aprovada com o usuário): a criação vira EXPLÍCITA**, no primeiro
// sign-in, e a materialização idempotente continua existindo — mas chamada só por ali, nunca
// por um `GET`. O motivo: com sempre-online e dinheiro real, "quando a conta existe" precisa
// de uma resposta e um lugar só; leitura que escreve é o que torna investigação, rate
// limiting e reprodução de bug difíceis. A propriedade que a 6/N queria continua de pé —
// personagem de história acrescentado amanhã é concedido no sign-in seguinte.

const AGORA = Date.UTC(2026, 8, 3, 12);
const catalog = loadCatalogFromDisk();
const NUCLEO = Object.values(catalog.characters)
  .filter((c) => c.acquisition === 'story')
  .map((c) => c.id)
  .sort();

const TICKET = 'dev:conta-teste';

function memoria() {
  const playerRepository = createMemoryPlayerRepository();
  const heroRepository = createMemoryHeroRepository();

  const app = buildApp({
    repository: playerRepository,
    heroRepository,
    arenaDefenseRepository: createMemoryArenaDefenseRepository(),
    replayRepository: createMemoryReplayRepository(),
    seasonRepository: createMemorySeasonRepository(),
    economyRepository: createMemoryEconomyRepository(),
    ownershipRepository: createMemoryCharacterOwnershipRepository(),
    rewardsRepository: createMemoryRewardsRepository(),
    catalog,
    shopCatalog: {},
    rateLimiter: createInMemoryRateLimiter({ maxRequests: 1000, windowMs: 60_000 }),
    ticketSecret: 'segredo-de-teste',
    now: () => AGORA,
    identityValidator: createDevIdentityValidator(),
  });

  return { app, playerRepository, heroRepository };
}

async function sessao(app: ReturnType<typeof buildApp>, ticket = TICKET) {
  const response = await app.inject({
    method: 'POST',
    url: '/accounts/session',
    headers: { 'x-platform-ticket': ticket },
    payload: {},
  });
  return { status: response.statusCode, body: response.json() as any };
}

describe('criação explícita da conta', () => {
  it('o primeiro sign-in cria a conta e entrega o núcleo de quatro', async () => {
    const { app } = memoria();

    const { status, body } = await sessao(app);

    expect(status).toBe(200);
    expect(body.created).toBe(true);

    const heroes = await app.inject({ method: 'GET', url: '/me/heroes', headers: { 'x-platform-ticket': TICKET } });
    expect((heroes.json() as any).map((e: any) => e.hero.characterId).sort()).toEqual(NUCLEO);
  });

  it('o segundo sign-in NÃO cria outra conta nem duplica herói', async () => {
    const { app } = memoria();

    const primeira = await sessao(app);
    const segunda = await sessao(app);

    expect(primeira.body.id).toBe(segunda.body.id);
    expect(segunda.body.created).toBe(false);

    const heroes = await app.inject({ method: 'GET', url: '/me/heroes', headers: { 'x-platform-ticket': TICKET } });
    expect((heroes.json() as any)).toHaveLength(NUCLEO.length);
  });

  // A metade que a decisão de forma promete: `GET` volta a ser só leitura.
  it('`GET /me/heroes` NÃO materializa mais nada por conta própria', async () => {
    const { app, playerRepository, heroRepository } = memoria();
    // Conta que existe mas nunca passou pelo sign-in desta versão — o caso de uma conta
    // criada antes de um personagem de história novo entrar no catálogo.
    await playerRepository.createPlayer({
      id: 'conta-antiga',
      platformProvider: 'dev',
      platformId: 'conta-antiga',
      displayName: 'Antiga',
    });

    const heroes = await app.inject({
      method: 'GET',
      url: '/me/heroes',
      headers: { 'x-platform-ticket': 'dev:conta-antiga' },
    });

    expect(heroes.statusCode).toBe(200);
    expect(heroes.json()).toEqual([]);
    expect(await heroRepository.listHeroesByOwner('conta-antiga')).toEqual([]);
  });

  // E a propriedade que a 6/N queria, preservada: o sign-in reconcilia.
  it('o sign-in de uma conta antiga concede o que faltava, sem duplicar o que já havia', async () => {
    const { app, playerRepository, heroRepository } = memoria();
    await playerRepository.createPlayer({
      id: 'conta-antiga',
      platformProvider: 'dev',
      platformId: 'conta-antiga',
      displayName: 'Antiga',
    });

    await sessao(app, 'dev:conta-antiga');
    const depois = await heroRepository.listHeroesByOwner('conta-antiga');
    expect(depois.map((h) => h.hero.characterId).sort()).toEqual(NUCLEO);

    await sessao(app, 'dev:conta-antiga');
    expect(await heroRepository.listHeroesByOwner('conta-antiga')).toHaveLength(NUCLEO.length);
  });
});

describe('exportação da conta', () => {
  it('devolve o estado do jogador, e não o de outro', async () => {
    const { app } = memoria();
    await sessao(app);
    await sessao(app, 'dev:outra-pessoa');

    const response = await app.inject({ method: 'GET', url: '/me/export', headers: { 'x-platform-ticket': TICKET } });

    expect(response.statusCode).toBe(200);
    const exportado = response.json() as any;
    expect(exportado.player.platformId).toBe('conta-teste');
    expect(exportado.heroes).toHaveLength(NUCLEO.length);
    expect(JSON.stringify(exportado)).not.toContain('outra-pessoa');
  });
});

describe('exclusão da conta', () => {
  it('remove o jogador, e o ticket dele deixa de abrir porta', async () => {
    const { app, playerRepository } = memoria();
    await sessao(app);

    const apagou = await app.inject({ method: 'DELETE', url: '/me', headers: { 'x-platform-ticket': TICKET } });
    expect(apagou.statusCode).toBe(200);

    expect(await playerRepository.getPlayerById('conta-teste')).toBeNull();
    const depois = await app.inject({ method: 'GET', url: '/me', headers: { 'x-platform-ticket': TICKET } });
    expect(depois.statusCode).toBe(401);
  });

  it('apaga os heróis junto — conta apagada não deixa herói órfão', async () => {
    const { app, heroRepository } = memoria();
    await sessao(app);
    expect(await heroRepository.listHeroesByOwner('conta-teste')).toHaveLength(NUCLEO.length);

    await app.inject({ method: 'DELETE', url: '/me', headers: { 'x-platform-ticket': TICKET } });

    expect(await heroRepository.listHeroesByOwner('conta-teste')).toEqual([]);
  });

  it('depois de apagar, o mesmo ticket cria uma conta NOVA e vazia', async () => {
    const { app } = memoria();
    await sessao(app);
    await app.inject({ method: 'DELETE', url: '/me', headers: { 'x-platform-ticket': TICKET } });

    const denovo = await sessao(app);

    expect(denovo.body.created).toBe(true);
  });
});

// A exclusão só é verdadeira se ela varrer o banco de verdade. Em memória um `Map` some
// junto; no Postgres, uma tabela esquecida deixa linha órfã — e com chave estrangeira, deixa
// a exclusão FALHAR. É o teste que precisa de banco.
const DATABASE_URL = process.env.DATABASE_URL;
const descrevePostgres = DATABASE_URL ? describe : describe.skip;

descrevePostgres('exclusão da conta, contra Postgres', () => {
  let pool: Pool;
  let app: ReturnType<typeof buildApp>;
  const sufixo = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  const ticket = `dev:conta-pg-${sufixo}`;
  const playerId = `conta-pg-${sufixo}`;

  beforeAll(async () => {
    pool = new Pool({ connectionString: DATABASE_URL });
    await runMigrations(pool);

    app = buildApp({
      repository: createPostgresPlayerRepository(pool),
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
      now: () => AGORA,
      identityValidator: createDevIdentityValidator(),
    });
  });

  afterAll(async () => {
    if (pool) await pool.end();
  });

  it('não sobra UMA linha em nenhuma tabela que referencia `players`', async () => {
    await sessao(app, ticket);

    // Estado espalhado por várias tabelas antes de apagar: sem isso o teste apagaria uma
    // conta vazia e não provaria nada.
    const economia = createPostgresEconomyRepository(pool);
    await economia.setMaterials(playerId, { 'material-nucleo-de-despertar': 2 });
    await economia.markCleared(playerId, 'dungeon-forja-abandonada');
    await economia.saveAction({ nonce: `del-${sufixo}`, playerId, kind: 'summon', createdAt: new Date(AGORA).toISOString() });
    await createPostgresCharacterOwnershipRepository(pool).grant(playerId, 'ally-grifeiro');
    await createPostgresRewardsRepository(pool).claim(playerId, 'achievement-primeiro-passo');

    const apagou = await app.inject({ method: 'DELETE', url: '/me', headers: { 'x-platform-ticket': ticket } });
    expect(apagou.statusCode).toBe(200);

    // A lista de tabelas NÃO é escrita à mão aqui: sai do catálogo do próprio banco. Uma
    // tabela nova com FK para `players` entra nesta varredura sozinha, e é o que impede a
    // exclusão de envelhecer em silêncio.
    const referenciam = await pool.query<{ tabela: string; coluna: string }>(`
      SELECT src.relname AS tabela, att.attname AS coluna
      FROM pg_constraint c
      JOIN pg_class src ON src.oid = c.conrelid
      JOIN pg_class alvo ON alvo.oid = c.confrelid
      JOIN unnest(c.conkey) AS k(attnum) ON true
      JOIN pg_attribute att ON att.attrelid = src.oid AND att.attnum = k.attnum
      WHERE c.contype = 'f' AND alvo.relname = 'players'
    `);

    expect(referenciam.rows.length).toBeGreaterThan(8);

    for (const { tabela, coluna } of referenciam.rows) {
      const sobrou = await pool.query<{ n: number }>(
        `SELECT count(*)::int AS n FROM ${tabela} WHERE ${coluna} = $1`,
        [playerId],
      );
      expect(sobrou.rows[0]?.n, `${tabela}.${coluna} deixou linha órfã`).toBe(0);
    }

    const jogador = await pool.query('SELECT id FROM players WHERE id = $1', [playerId]);
    expect(jogador.rowCount).toBe(0);
  });
});
