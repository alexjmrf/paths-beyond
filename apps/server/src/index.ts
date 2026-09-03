import { createMemoryEconomyRepository } from './repository/memoryRepository.js';
import { loadCatalogFromDisk } from '@paths-beyond/content';
import { Pool } from 'pg';
import { buildApp } from './app.js';
import { createInMemoryRateLimiter } from './battle/rateLimit.js';
import {
  createPostgresArenaDefenseRepository,
  createPostgresCharacterOwnershipRepository,
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

const pool = new Pool({ connectionString });
const app = buildApp({
  // ANOMALIA PRÉ-EXISTENTE, herdada de M14 e NÃO desta fatia: o repositório de economia é
  // o de MEMÓRIA aqui, no ponto de entrada de produção — materiais, inventário e limpezas
  // de masmorra se perdem a cada reinício. Registrado em DECISIONS.md (M18 3/N) em vez de
  // corrigido em silêncio junto de outra coisa.
  economyRepository: createMemoryEconomyRepository(),
  ownershipRepository: createPostgresCharacterOwnershipRepository(pool),
  repository: createPostgresPlayerRepository(pool),
  heroRepository: createPostgresHeroRepository(pool),
  arenaDefenseRepository: createPostgresArenaDefenseRepository(pool),
  replayRepository: createPostgresReplayRepository(pool),
  seasonRepository: createPostgresSeasonRepository(pool),
  catalog: loadCatalogFromDisk(),
  shopCatalog: loadShopCatalog(),
  // §9.4 — 10 batalhas/minuto por jogador; corte de escopo (ver DECISIONS.md), ajustável.
  rateLimiter: createInMemoryRateLimiter({ maxRequests: 10, windowMs: 60_000 }),
  ticketSecret,
});

const port = Number(process.env.PORT ?? 3000);
app.listen({ port, host: '0.0.0.0' }).catch((err) => {
  app.log.error(err);
  process.exit(1);
});
