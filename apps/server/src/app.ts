import type { ContentCatalog } from '@paths-beyond/content';
import Fastify, { type FastifyInstance } from 'fastify';
import { authPlugin } from './auth.js';
import type { RateLimiter } from './battle/rateLimit.js';
import { battleRoutes } from './battle/routes.js';
import { campaignRoutes } from './campaign/routes.js';
import { rewardsRoutes } from './rewards/routes.js';
import { progressionRoutes } from './economy/progressionRoutes.js';
import { economyRoutes } from './economy/routes.js';
import { matchmakingRoutes } from './matchmaking/routes.js';
import type {
  ArenaDefenseRepository,
  CharacterOwnershipRepository,
  EconomyRepository,
  HeroRepository,
  PlayerRepository,
  ReplayRepository,
  RewardsRepository,
  SeasonRepository,
} from './repository/types.js';
import { seasonRoutes } from './season/routes.js';
import { summonRoutes } from './summon/routes.js';
import type { ShopCatalog } from './shop/catalog.js';
import { shopRoutes } from './shop/routes.js';

export interface BuildAppDeps {
  repository: PlayerRepository;
  heroRepository: HeroRepository;
  arenaDefenseRepository: ArenaDefenseRepository;
  // §10 (M14, sub-sessão 3/N) — estado de conta do PvE (energia, moedas, materiais,
  // inventário, limpezas e trava de entrada).
  economyRepository: EconomyRepository;
  // §10/§9.4 (M18, sub-sessão 3/N) — posse de personagem e contador de pity.
  ownershipRepository: CharacterOwnershipRepository;
  // §10 (M18, sub-sessão 4/N) — reivindicações de prêmio e capítulos limpos.
  rewardsRepository: RewardsRepository;
  replayRepository: ReplayRepository;
  seasonRepository: SeasonRepository;
  catalog: ContentCatalog;
  shopCatalog: ShopCatalog;
  rateLimiter: RateLimiter;
  // §9.4 (M13, sub-sessão 2/N) — segredo do HMAC que deriva a seed de batalha do nonce
  // (ver battle/ticket.ts). Injetado, não lido de env aqui, pelo mesmo motivo de `now`:
  // teste precisa fixar.
  ticketSecret: string;
  // Injeção pra testes de temporada controlarem o tempo (mesmo idioma de
  // `battle/rateLimit.ts`); default `Date.now` quando ausente.
  now?: () => number;
  // Mesma ideia, para o nonce que vira a seed da batalha de masmorra (M15 4/N): sem fixar,
  // um teste que afirma um desfecho joga uma partida diferente a cada execução. Default
  // `generateNonce` (aleatório) quando ausente.
  newNonce?: () => string;
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
      ownershipRepository: deps.ownershipRepository,
      replayRepository: deps.replayRepository,
      catalog: deps.catalog,
      rateLimiter: deps.rateLimiter,
      ticketSecret: deps.ticketSecret,
    });

    await protectedRoutes.register(economyRoutes, {
      repository: deps.repository,
      heroRepository: deps.heroRepository,
      economyRepository: deps.economyRepository,
      ownershipRepository: deps.ownershipRepository,
      catalog: deps.catalog,
      rateLimiter: deps.rateLimiter,
      ticketSecret: deps.ticketSecret,
      now: deps.now ?? (() => Date.now()),
      ...(deps.newNonce ? { newNonce: deps.newNonce } : {}),
    });

    await protectedRoutes.register(progressionRoutes, {
      repository: deps.repository,
      heroRepository: deps.heroRepository,
      economyRepository: deps.economyRepository,
      // `progressionRoutes` compartilha `EconomyRoutesOptions` com `economyRoutes` desde
      // M14 4/N; ele não consulta posse, mas o tipo é um só.
      ownershipRepository: deps.ownershipRepository,
      catalog: deps.catalog,
      rateLimiter: deps.rateLimiter,
      ticketSecret: deps.ticketSecret,
      now: deps.now ?? (() => Date.now()),
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

    await protectedRoutes.register(campaignRoutes, {
      repository: deps.repository,
      heroRepository: deps.heroRepository,
      ownershipRepository: deps.ownershipRepository,
      rewardsRepository: deps.rewardsRepository,
      catalog: deps.catalog,
      rateLimiter: deps.rateLimiter,
      ticketSecret: deps.ticketSecret,
      now: deps.now ?? (() => Date.now()),
      ...(deps.newNonce ? { newNonce: deps.newNonce } : {}),
    });

    await protectedRoutes.register(rewardsRoutes, {
      repository: deps.repository,
      heroRepository: deps.heroRepository,
      ownershipRepository: deps.ownershipRepository,
      economyRepository: deps.economyRepository,
      rewardsRepository: deps.rewardsRepository,
      catalog: deps.catalog,
      now: deps.now ?? (() => Date.now()),
    });

    await protectedRoutes.register(summonRoutes, {
      repository: deps.repository,
      economyRepository: deps.economyRepository,
      ownershipRepository: deps.ownershipRepository,
      catalog: deps.catalog,
      ticketSecret: deps.ticketSecret,
      now: deps.now ?? (() => Date.now()),
    });

    await protectedRoutes.register(shopRoutes, {
      repository: deps.repository,
      heroRepository: deps.heroRepository,
      catalog: deps.shopCatalog,
    });
  });

  return app;
}
