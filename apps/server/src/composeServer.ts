import { loadCatalogFromDisk } from '@paths-beyond/content';
import { Pool } from 'pg';
import { buildApp } from './app.js';
import { createDevIdentityValidator } from './identity/devIdentity.js';
import {
  createPostgresArenaDefenseRepository,
  createPostgresPartyPresetRepository,
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

// M28, sub-sessão 1/N — o servidor do AMBIENTE LOCAL: Postgres de verdade, identidade de
// mentira.
//
// **O terceiro ponto de entrada, e por que ele existe.** Havia dois, e nenhum servia:
//
// - `devServer.ts` é memória + identidade de dev. Num contêiner ele seria o mesmo servidor
//   de sempre com mais passos: não exercita migration nenhuma, e o critério que esta
//   milestone existe para fechar — destravar o julgamento na tela, hoje bloqueado por *"o
//   Docker não está de pé nesta máquina"* — continuaria bloqueado pela mesma ausência.
// - `index.ts` é Postgres + Steam, e numa máquina limpa não há chave da Steam. Ele falha ao
//   subir sem ela, o que é o comportamento certo e o motivo de não ser este o arquivo.
//
// **A alternativa recusada foi escolher a identidade por variável de ambiente** num
// `index.ts` só. Seria menos código e reabriria a porta que o M20 fechou: uma configuração
// errada em produção passaria a aceitar ticket `dev:<id>`, e aí qualquer um se autentica
// como qualquer conta. Falha silenciosa e total. Com dois arquivos, o validador de
// desenvolvimento simplesmente **não está no caminho de produção** — não há configuração
// capaz de colocá-lo lá.
//
// **Nada aqui é semeado.** O `devServer` semeia jogadores, ouro e moeda premium porque
// existe para exercitar telas isoladas. Este sobe um servidor VAZIO, que é o estado real de
// quem instala o jogo: `POST /accounts/session` cria a conta e concede o núcleo de história
// (M20), e a demo paga o resto conforme se joga (D31). Semear aqui seria inventar uma
// primeira sessão que ninguém vai ter.

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('DATABASE_URL is required to start the server');
}

// §9.4 — mesmo no ambiente local: sem segredo, quem escolhe a seed da batalha é o cliente.
// O valor vem do `compose.yaml` e é explicitamente de mentira; o que não pode existir é um
// default embutido aqui, porque um default embutido é o mesmo segredo em toda instalação.
const ticketSecret = process.env.BATTLE_TICKET_SECRET;
if (!ticketSecret) {
  throw new Error('BATTLE_TICKET_SECRET is required to start the server');
}

const pool = new Pool({ connectionString });

// As migrations NÃO rodam aqui: o `compose.yaml` tem um serviço próprio para elas, e o
// servidor só sobe depois que ele termina (`service_completed_successfully`). Escondê-las
// dentro da subida faria delas um passo invisível — e o M19 gastou uma milestone inteira
// aprendendo que o que não aparece em log é o que falha em produção sem testemunha.
const app = buildApp({
  economyRepository: createPostgresEconomyRepository(pool),
  idempotencyRepository: createPostgresIdempotencyRepository(pool),
  ownershipRepository: createPostgresCharacterOwnershipRepository(pool),
  rewardsRepository: createPostgresRewardsRepository(pool),
  repository: createPostgresPlayerRepository(pool),
  heroRepository: createPostgresHeroRepository(pool),
  arenaDefenseRepository: createPostgresArenaDefenseRepository(pool),
  partyPresetRepository: createPostgresPartyPresetRepository(pool),
  replayRepository: createPostgresReplayRepository(pool),
  seasonRepository: createPostgresSeasonRepository(pool),
  identityValidator: createDevIdentityValidator(),
  catalog: loadCatalogFromDisk(),
  shopCatalog: loadShopCatalog(),
  // Os mesmos dois níveis de produção (M22 3/N). Afrouxá-los aqui faria o ambiente local
  // deixar de reproduzir o 429 que o jogador pode ver — e o limitador é justamente o que
  // protege as rotas que gastam a moeda comprável com dinheiro real.
  rateLimiter: createPostgresRateLimiter(pool, { maxRequests: 60, windowMs: 60_000 }),
  expensiveRateLimiter: createPostgresRateLimiter(pool, { maxRequests: 10, windowMs: 60_000 }),
  ticketSecret,
});

const port = Number(process.env.PORT ?? 3000);
// `0.0.0.0` e não `127.0.0.1`: dentro do contêiner, escutar só no loopback é escutar num
// lugar onde a publicação de porta do compose não alcança — o servidor sobe, o log diz que
// está no ar, e a conexão é recusada de fora.
app.listen({ port, host: '0.0.0.0' }).catch((err) => {
  app.log.error(err);
  process.exit(1);
});
