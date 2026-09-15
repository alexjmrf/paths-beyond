import { loadCatalogFromDisk } from '@paths-beyond/content';
import { Pool } from 'pg';
import { buildApp } from './app.js';
import { createSteamIdentityValidator } from './identity/steam.js';
import {
  createPostgresArenaDefenseRepository,
  createPostgresPartyPresetRepository,
  createPostgresTelemetryRepository,
  createPostgresCharacterOwnershipRepository,
  createPostgresEconomyRepository,
  createPostgresIdempotencyRepository,
  createPostgresRateLimiter,
  createPostgresRewardsRepository,
  createPostgresHeroRepository,
  createPostgresPlayerRepository,
  createPostgresReplayRepository,
  createPostgresSeasonRepository,
} from './repository/postgresRepository.js';
import { loadShopCatalog } from './shop/catalog.js';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('DATABASE_URL is required to start the server');
}

// §9.4 — sem segredo não há como derivar a seed de batalha sem deixar o cliente
// escolhê-la; falha alto em vez de cair num default previsível.
const ticketSecret = process.env.BATTLE_TICKET_SECRET;
if (!ticketSecret) {
  throw new Error('BATTLE_TICKET_SECRET is required to start the server');
}

// §9.4 (M20) — identidade de plataforma. Sem chave da Steam o servidor não sobe: um
// fallback permissivo aqui seria uma porta aberta que ninguém veria, e é exatamente o que o
// M20 saiu de cima.
const steamApiKey = process.env.STEAM_WEB_API_KEY;
const steamAppId = process.env.STEAM_APP_ID;
if (!steamApiKey || !steamAppId) {
  throw new Error('STEAM_WEB_API_KEY and STEAM_APP_ID are required to start the server');
}

const pool = new Pool({ connectionString });
const app = buildApp({
  // M19 — o repositório de economia era o de MEMÓRIA aqui, no ponto de entrada de
  // PRODUÇÃO, desde M14 3/N: materiais, inventário e limpezas de masmorra se perdiam a cada
  // reinício. A implementação de Postgres já existia e nunca tinha sido ligada — nem
  // executada por teste nenhum, que é como a cláusula CHECK de `economy_actions` conseguiu
  // derivar do código sem ninguém ver (ver migration 0011).
  economyRepository: createPostgresEconomyRepository(pool),
  // §9.4 (M22, 2/N) — sem ele, reconectar no meio de uma run devolve 409 em vez da run.
  idempotencyRepository: createPostgresIdempotencyRepository(pool),
  ownershipRepository: createPostgresCharacterOwnershipRepository(pool),
  rewardsRepository: createPostgresRewardsRepository(pool),
  repository: createPostgresPlayerRepository(pool),
  heroRepository: createPostgresHeroRepository(pool),
  arenaDefenseRepository: createPostgresArenaDefenseRepository(pool),
  partyPresetRepository: createPostgresPartyPresetRepository(pool),
  telemetryRepository: createPostgresTelemetryRepository(pool),
  replayRepository: createPostgresReplayRepository(pool),
  seasonRepository: createPostgresSeasonRepository(pool),
  identityValidator: createSteamIdentityValidator({ apiKey: steamApiKey, appId: steamAppId }),
  catalog: loadCatalogFromDisk(),
  shopCatalog: loadShopCatalog(),
  // §9.4 — 10 batalhas/minuto por jogador; corte de escopo (ver DECISIONS.md), ajustável.
  // M22 3/N — COMPARTILHADO entre processos. Em memória o teto se multiplicava por
  // instância, e o limite existe justamente para proteger as rotas que gastam dinheiro real.
  //
  // **Dois números, e os dois mudaram com a auditoria da milestone.** O balde geral era 10
  // por minuto porque só seis rotas de batalha o consumiam; com o hook cobrindo toda rota
  // que muda estado, 10 passa a punir quem só está editando o script tático de cinco heróis.
  // 60 por minuto é um por segundo — folgado para jogar, apertado para script.
  rateLimiter: createPostgresRateLimiter(pool, { maxRequests: 60, windowMs: 60_000 }),
  // E as três rotas que gastam a moeda comprável com dinheiro real ficam com o teto
  // estreito, que é onde ele importa: 10 por minuto é mais do que qualquer humano invoca.
  expensiveRateLimiter: createPostgresRateLimiter(pool, { maxRequests: 10, windowMs: 60_000 }),
  ticketSecret,
});

const port = Number(process.env.PORT ?? 3000);
app.listen({ port, host: '0.0.0.0' }).catch((err) => {
  app.log.error(err);
  process.exit(1);
});
