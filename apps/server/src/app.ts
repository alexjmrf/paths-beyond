import type { ContentCatalog } from '@paths-beyond/content';
import fastifyCors from '@fastify/cors';
import Fastify, { type FastifyInstance } from 'fastify';
import { authPlugin } from './auth.js';
import { registerRateLimit, type RateLimiter } from './battle/rateLimit.js';
import { battleRoutes } from './battle/routes.js';
import { campaignRoutes } from './campaign/routes.js';
import { rewardsRoutes } from './rewards/routes.js';
import { preparationRoutes } from './economy/preparationRoutes.js';
import { progressionRoutes } from './economy/progressionRoutes.js';
import { economyRoutes } from './economy/routes.js';
import { matchmakingRoutes } from './matchmaking/routes.js';
import type {
  ArenaDefenseRepository,
  PartyPresetRepository,
  TelemetryRepository,
  CharacterOwnershipRepository,
  EconomyRepository,
  HeroRepository,
  PlayerRepository,
  ReplayRepository,
  IdempotencyRepository,
  RewardsRepository,
  SeasonRepository,
} from './repository/types.js';
import { seasonRoutes } from './season/routes.js';
import { summonRoutes } from './summon/routes.js';
import { accountRoutes } from './accounts/routes.js';
import type { IdentityValidator } from './identity/types.js';
import { registerIdempotency } from './idempotency.js';
import { registerRequestLogging, type RequestLogLine } from './observability.js';
import type { ShopCatalog } from './shop/catalog.js';
import { shopRoutes } from './shop/routes.js';
import { createTelemetria, telemetryRoutes } from './telemetry/telemetria.js';

export interface BuildAppDeps {
  repository: PlayerRepository;
  heroRepository: HeroRepository;
  arenaDefenseRepository: ArenaDefenseRepository;
  // M35 3/N (D42) — os presets de party.
  partyPresetRepository: PartyPresetRepository;
  // M34 1/N (D45) — a telemetria. Opcional pelo mesmo motivo de `idempotencyRepository`:
  // sem ela o servidor é o de antes e nada é medido; com ela, `/me/telemetry` existe.
  telemetryRepository?: TelemetryRepository;
  // §10 (M14, sub-sessão 3/N) — estado de conta do PvE (energia, moedas, materiais,
  // inventário, limpezas e trava de entrada).
  economyRepository: EconomyRepository;
  // §10/§9.4 (M18, sub-sessão 3/N) — posse de personagem e contador de pity.
  ownershipRepository: CharacterOwnershipRepository;
  // §10 (M18, sub-sessão 4/N) — reivindicações de prêmio e capítulos limpos.
  rewardsRepository: RewardsRepository;
  // §9.4 (M22, sub-sessão 2/N) — a resposta guardada por nonce, que é o que faz reconectar
  // devolver a run em vez de um 409. Opcional para não quebrar quem monta o app sem ela: sem
  // repositório, o comportamento é o de antes.
  idempotencyRepository?: IdempotencyRepository;
  replayRepository: ReplayRepository;
  seasonRepository: SeasonRepository;
  catalog: ContentCatalog;
  shopCatalog: ShopCatalog;
  rateLimiter: RateLimiter;
  // §9.4 (M22, 3/N + auditoria) — o balde ESTREITO, só para as rotas que movem a moeda
  // comprável com dinheiro real. Ausente = um balde só para tudo, que é o que a suíte monta.
  expensiveRateLimiter?: RateLimiter;
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
  // M19 — para onde vai o log estruturado de cada requisição. Ausente = `console.log` em
  // JSON, que é o que produção usa. O teste injeta um array para poder LER as linhas.
  logSink?: (line: RequestLogLine) => void;
  // §9.4 (M20) — quem confirma a identidade do jogador. Injetado no mesmo padrão de `now` e
  // `newNonce`: sem essa costura a suíte dependeria da Steam para rodar. Produção monta o
  // validador da Steam em `index.ts`; teste e `devServer` montam o de desenvolvimento.
  identityValidator: IdentityValidator;
  newPlayerId?: () => string;
}

export function buildApp(deps: BuildAppDeps): FastifyInstance {
  const app = Fastify();
  const now = deps.now ?? (() => Date.now());
  // M34 1/N — um serviço só, compartilhado pelo sign-in (fora do escopo protegido) e pelas
  // rotas de campanha (dentro): é ele que sabe se a conta recusou.
  const telemetria = createTelemetria(deps.telemetryRepository, now);

  // M19 — registrado ANTES de qualquer rota, e no escopo raiz: um hook `onResponse` daqui
  // vale para toda rota registrada depois, inclusive as protegidas. Registrá-lo dentro do
  // escopo protegido deixaria `/health` e as recusas por token ausente fora do log — que
  // são justamente as duas coisas que se olha quando o serviço parece morto.
  registerRequestLogging(app, { sink: deps.logSink });

  // §9.4 (M28, 2/N) — CORS, para o cliente EMPACOTADO.
  //
  // No laço de desenvolvimento o Vite faz proxy de `/api` e cliente e servidor são a mesma
  // origem; o navegador nunca pergunta nada. Empacotado, o renderer carrega por `file://`
  // — origem `null` para o Chromium — e o servidor está noutro host. O cliente manda
  // `x-platform-ticket`, header customizado, e isso obriga a um PREFLIGHT antes do `POST`;
  // sem `Access-Control-*` na resposta o navegador bloqueia e o `fetch` diz "Failed to
  // fetch" sem nunca chegar à rota. Visto pela primeira vez no critério 3 do M28, que é a
  // primeira vez que o cliente empacotado falou com um servidor remoto.
  //
  // A política é estreita: sem `Origin` (curl, servidor a servidor, a suíte) passa como
  // sempre; `null` (o Electron por `file://`) é aceita; qualquer outra origem é recusada.
  // `credentials` nunca — a autenticação é por header, não por cookie, então CORS aqui não
  // protege contra CSRF; o que ele decide é QUEM o navegador deixa falar com este servidor.
  // Registrado ANTES das rotas pelo mesmo motivo do log: vale para todas, `/health` incluso.
  void app.register(fastifyCors, {
    origin: (origem, cb) => {
      if (origem === undefined || origem === 'null') {
        cb(null, true);
        return;
      }
      cb(null, false);
    },
    credentials: false,
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['content-type', 'x-platform-ticket'],
  });

  app.get('/health', async () => ({ status: 'ok' }));

  // Fora do escopo protegido, e tem de ser: é a rota que faz a conta existir, e exigir uma
  // conta para criá-la seria um ciclo. Ela valida o ticket por conta própria.
  app.register(accountRoutes, {
    repository: deps.repository,
    heroRepository: deps.heroRepository,
    arenaDefenseRepository: deps.arenaDefenseRepository,
    partyPresetRepository: deps.partyPresetRepository,
    ...(deps.telemetryRepository ? { telemetryRepository: deps.telemetryRepository } : {}),
    telemetria,
    replayRepository: deps.replayRepository,
    economyRepository: deps.economyRepository,
    ownershipRepository: deps.ownershipRepository,
    rewardsRepository: deps.rewardsRepository,
    ...(deps.idempotencyRepository ? { idempotencyRepository: deps.idempotencyRepository } : {}),
    rateLimiter: deps.rateLimiter,
    identityValidator: deps.identityValidator,
    catalog: deps.catalog,
    ...(deps.newPlayerId ? { newPlayerId: deps.newPlayerId } : {}),
  });

  app.register(async (protectedRoutes) => {
    await protectedRoutes.register(authPlugin, {
      repository: deps.repository,
      identityValidator: deps.identityValidator,
    });

    // §9.4 (M22, 2/N) — dentro do escopo protegido e ANTES das rotas: o hook precisa do
    // `request.player` que o `authPlugin` põe, e precisa valer para toda rota registrada
    // depois — inclusive as que ainda não existem.
    if (deps.idempotencyRepository) {
      registerIdempotency(protectedRoutes, {
        repository: deps.idempotencyRepository,
        ...(deps.now ? { now: deps.now } : {}),
      });
    }

    // §9.4 (M22, 3/N) — o LIMITADOR, para toda rota que muda estado.
    //
    // Registrado DEPOIS do hook de idempotência de propósito: o reenvio de quem perdeu a
    // conexão é respondido do armazém e nem chega aqui — cobrar cota de uma requisição que
    // já foi resolvida seria punir o jogador pela queda da internet dele.
    registerRateLimit(protectedRoutes, {
      padrao: deps.rateLimiter,
      ...(deps.expensiveRateLimiter ? { caro: deps.expensiveRateLimiter } : {}),
    });

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
      ticketSecret: deps.ticketSecret,
    });

    await protectedRoutes.register(economyRoutes, {
      repository: deps.repository,
      heroRepository: deps.heroRepository,
      economyRepository: deps.economyRepository,
      ownershipRepository: deps.ownershipRepository,
      catalog: deps.catalog,
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
      ticketSecret: deps.ticketSecret,
      now: deps.now ?? (() => Date.now()),
    });

    // §6.3/§8.2 (M18, 7/N) — script tático e talentos. Mesmas opções de
    // `progressionRoutes` (o tipo é um só desde M14 4/N), e ao lado dele de propósito: as
    // duas famílias são "o que o jogador faz com um herói fora da batalha".
    await protectedRoutes.register(preparationRoutes, {
      repository: deps.repository,
      heroRepository: deps.heroRepository,
      economyRepository: deps.economyRepository,
      ownershipRepository: deps.ownershipRepository,
      catalog: deps.catalog,
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
      partyPresetRepository: deps.partyPresetRepository,
      telemetria,
      catalog: deps.catalog,
      ticketSecret: deps.ticketSecret,
      now,
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
      heroRepository: deps.heroRepository,
      catalog: deps.catalog,
      ticketSecret: deps.ticketSecret,
      now: deps.now ?? (() => Date.now()),
    });

    // M34 1/N (D45) — a declaração e a recusa. Só existe quando há onde gravar.
    if (deps.telemetryRepository) {
      await protectedRoutes.register(telemetryRoutes, { repository: deps.telemetryRepository });
    }

    await protectedRoutes.register(shopRoutes, {
      repository: deps.repository,
      heroRepository: deps.heroRepository,
      catalog: deps.shopCatalog,
    });
  });

  return app;
}
