import { loadCatalogFromDisk, toStartingHero } from '@paths-beyond/content';
import type { Hero } from '@paths-beyond/core';
import { buildApp } from './app.js';
import { createDevIdentityValidator } from './identity/devIdentity.js';
import { createInMemoryRateLimiter } from './battle/rateLimit.js';
import {
  createMemoryArenaDefenseRepository,
  createMemoryPartyPresetRepository,
  createMemoryTelemetryRepository,
  createMemoryHeroRepository,
  createMemoryPlayerRepository,
  createMemoryReplayRepository,
  createMemoryRewardsRepository,
  createMemorySeasonRepository,
  createMemoryCharacterOwnershipRepository,
  createMemoryEconomyRepository,
  createMemoryIdempotencyRepository,
} from './repository/memoryRepository.js';
import type { StoredHero } from './repository/types.js';
import { loadShopCatalog } from './shop/catalog.js';
import { DEFAULT_PVE_ACCOUNT } from './repository/types.js';

// M13, sub-sessão 2/N — servidor de DESENVOLVIMENTO, em memória.
//
// `index.ts` exige `DATABASE_URL` e um Postgres de verdade, o que é certo pra produção e
// impraticável pro laço de trabalho do cliente: verificar "o cliente conversa com o
// servidor real" (critério de aceite de M13) não deveria exigir subir banco. Os
// repositórios em memória já existiam — eram usados só por teste desde M7.
//
// Nada aqui é conteúdo de jogo: os heróis do seed saem do catálogo real
// (`packages/data`), montados a partir das classes existentes. É ferramenta, no mesmo
// espírito de `packages/data/scripts/*`.

const catalog = loadCatalogFromDisk();

// §9.4 (M20) — o token digitado morreu; o que identifica é o ticket de plataforma. No
// desenvolvimento o provider é `dev` e o ticket é `dev:<id>`, formato explícito para nenhum
// ticket real ser confundido com um de mentira.
const ATTACKER_ID = 'dev-atacante';
const DEFENDER_ID = 'dev-defensor';
const ATTACKER_TICKET = `dev:${ATTACKER_ID}`;
const DEFENDER_TICKET = `dev:${DEFENDER_ID}`;

// Nível 40: o servidor de dev existe para exercitar o CLIENTE, e um time nível 10 perderia
// toda masmorra — o roteiro falaria sobre dificuldade em vez de sobre tela.
const DEV_LEVEL = 40;

// M18 6/N — os heróis do jogador de dev passam a sair da FICHA INICIAL do catálogo, com o
// nível puxado para 40. Antes eram montados aqui por convenção de id e sem `characterId`,
// e isso deixou de servir por dois motivos: sem personagem declarado eles não passam pela
// checagem de posse de §9.4 do jeito que um herói de verdade passa, e o roteiro de
// verificação da aquisição precisa de uma conta que já tenha o núcleo de quatro.
//
// Um herói de dev COM `characterId` também é o que impede a materialização preguiçosa de
// `GET /me/heroes` de criar uma segunda instância do mesmo personagem ao lado.
function devHero(characterId: string): Hero {
  const character = catalog.characters[characterId];
  if (!character) throw new Error(`personagem desconhecido: ${characterId}`);
  return { ...toStartingHero(character, `dev-${characterId}`), level: DEV_LEVEL };
}

function stored(ownerPlayerId: string, hero: Hero): StoredHero {
  const equippedItems = Object.values(hero.equipment)
    .filter((id): id is string => id !== null)
    .map((id) => catalog.items[id])
    .filter((item): item is NonNullable<typeof item> => item !== undefined);
  return { ownerPlayerId, hero, equippedItems };
}

// O núcleo de história (D14), que é o que toda conta tem. Os adquiríveis não entram aqui de
// propósito: o roteiro de verificação da 6/N é justamente puxá-los no banner.
const NUCLEO = Object.values(catalog.characters)
  .filter((character) => character.acquisition === 'story')
  .map((character) => character.id);

const heroes: StoredHero[] = [
  ...NUCLEO.map((characterId) => stored('dev-player-1', devHero(characterId))),
  // O defensor não precisa de personagem: quem monta defesa de arena é o herói, e posse
  // não se aplica a quem o jogador não leva ao mapa.
  stored('dev-player-2', devHero('ally-guerreiro')),
  stored('dev-player-2', devHero('ally-lanceiro')),
];

const app = buildApp({
    economyRepository: createMemoryEconomyRepository(),
    idempotencyRepository: createMemoryIdempotencyRepository(),
    ownershipRepository: createMemoryCharacterOwnershipRepository(),
    rewardsRepository: createMemoryRewardsRepository(),
  repository: createMemoryPlayerRepository([
    // Ouro e pedras semeados: o ciclo de aceite começa em farmar, mas verificar enhance
    // sem nada na carteira exigiria farmar ouro antes de cada tentativa.
    {
      id: 'dev-player-1',
      platformProvider: 'dev' as const,
      platformId: ATTACKER_ID,
      displayName: 'Atacante (dev)',
      elo: 1200,
      arenaMarks: 0,
      ...DEFAULT_PVE_ACCOUNT,
      gold: 50_000,
      stones: 200,
      // D17 — a moeda premium não se ganha farmando, e o roteiro de verificação da
      // invocação começa em invocar. Semear é o equivalente ao ouro logo acima.
      premium: 10_000,
      energy: { stored: catalog.economyRules.energy.max, asOfMs: Date.now() },
    },
    { id: 'dev-player-2', platformProvider: 'dev' as const, platformId: DEFENDER_ID, displayName: 'Defensor (dev)', elo: 1200, arenaMarks: 0, ...DEFAULT_PVE_ACCOUNT },
  ]),
  heroRepository: createMemoryHeroRepository(heroes),
  // O defensor já entra com defesa montada: sem ela, `/matchmaking/opponent` não devolve
  // ninguém e não há partida a jogar.
  arenaDefenseRepository: createMemoryArenaDefenseRepository([
    {
      ownerPlayerId: 'dev-player-2',
      mapId: 'map-arena-coliseu',
      units: [
        { heroId: 'dev-ally-guerreiro', pos: { x: 12, y: 6 }, height: 0, aiArchetype: 'aggressive' },
        { heroId: 'dev-ally-lanceiro', pos: { x: 12, y: 8 }, height: 0, aiArchetype: 'hold-position' },
      ],
    },
  ]),
  partyPresetRepository: createMemoryPartyPresetRepository(),
  telemetryRepository: createMemoryTelemetryRepository(),
  replayRepository: createMemoryReplayRepository(),
  seasonRepository: createMemorySeasonRepository(),
  catalog,
  shopCatalog: loadShopCatalog(),
  rateLimiter: createInMemoryRateLimiter({ maxRequests: 60, windowMs: 60_000 }),
  // Segredo fixo: é servidor de desenvolvimento, e a seed precisa ser reprodutível entre
  // reinícios pra um roteiro de verificação valer alguma coisa.
  ticketSecret: 'segredo-de-desenvolvimento',
  // O validador de dev: `dev:<id>` vira identidade. Produção monta o da Steam.
  identityValidator: createDevIdentityValidator(),
});

const port = Number(process.env.PORT ?? 3000);
app.listen({ port, host: '127.0.0.1' }).then(() => {
  console.log(`servidor de desenvolvimento (em memória) em http://127.0.0.1:${port}`);
  console.log(`  ticket do atacante: ${ATTACKER_TICKET}  (núcleo: ${NUCLEO.join(', ')})`);
  console.log(`  ticket do defensor: ${DEFENDER_TICKET}  (defesa montada em map-arena-coliseu)`);
});
