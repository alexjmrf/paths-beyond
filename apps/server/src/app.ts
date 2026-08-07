import Fastify, { type FastifyInstance } from 'fastify';
import { authPlugin } from './auth.js';
import type { RateLimiter } from './battle/rateLimit.js';
import { battleRoutes } from './battle/routes.js';
import type { ContentCatalog } from './content/types.js';
import { matchmakingRoutes } from './matchmaking/routes.js';
import type {
  ArenaDefenseRepository,
  HeroRepository,
  PlayerRepository,
  ReplayRepository,
  SeasonRepository,
} from './repository/types.js';
import { seasonRoutes } from './season/routes.js';
import type { ShopCatalog } from './shop/catalog.js';
import { shopRoutes } from './shop/routes.js';

export interface BuildAppDeps {
  repository: PlayerRepository;
  heroRepository: HeroRepository;
  arenaDefenseRepository: ArenaDefenseRepository;
  replayRepository: ReplayRepository;
  seasonRepository: SeasonRepository;
  catalog: ContentCatalog;
  shopCatalog: ShopCatalog;
  rateLimiter: RateLimiter;
  // Injeção pra testes de temporada controlarem o tempo (mesmo idioma de
  // `battle/rateLimit.ts`); default `Date.now` quando ausente.
  now?: () => number;
}

export function buildApp(deps: BuildAppDeps): FastifyInstance {
  const app = Fastify();

  app.get('/health', async () => ({ status: 'ok' }));

  app.register(async (protectedRoutes) => {
    await protectedRoutes.register(authPlugin, { repository: deps.repository });

    protectedRoutes.get('/me', async (request, reply) => {
      if (!request.player) {
        return reply.code(401).send({ error: 'missing player token' });
      }
      return request.player;
    });

    // Registrados DENTRO do mesmo escopo protegido — o hook de auth (fp(), acima) já vale
    // pra qualquer plugin filho registrado aqui, sem precisar chamar authPlugin de novo.
    await protectedRoutes.register(battleRoutes, {
      repository: deps.repository,
      heroRepository: deps.heroRepository,
      arenaDefenseRepository: deps.arenaDefenseRepository,
      replayRepository: deps.replayRepository,
      catalog: deps.catalog,
      rateLimiter: deps.rateLimiter,
    });

    await protectedRoutes.register(matchmakingRoutes, {
      repository: deps.repository,
      arenaDefenseRepository: deps.arenaDefenseRepository,
    });

    await protectedRoutes.register(seasonRoutes, {
      seasonRepository: deps.seasonRepository,
      playerRepository: deps.repository,
      now: deps.now,
    });

    await protectedRoutes.register(shopRoutes, {
      repository: deps.repository,
      heroRepository: deps.heroRepository,
      catalog: deps.shopCatalog,
    });
  });

  return app;
}
