import { loadCatalogFromDisk } from '@paths-beyond/content';
import type { Hero } from '@paths-beyond/core';
import { buildApp } from './app.js';
import { createInMemoryRateLimiter } from './battle/rateLimit.js';
import {
  createMemoryArenaDefenseRepository,
  createMemoryHeroRepository,
  createMemoryPlayerRepository,
  createMemoryReplayRepository,
  createMemorySeasonRepository,
  createMemoryEconomyRepository,
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

const ATTACKER_TOKEN = 'dev-atacante';
const DEFENDER_TOKEN = 'dev-defensor';

// Nível 40: o servidor de dev existe para exercitar o CLIENTE, e um time nível 10 perderia
// toda masmorra — o roteiro falaria sobre dificuldade em vez de sobre tela.
function devHero(id: string, classId: string, weaponType: string, weapon: string, level = 40): Hero {
  const slug = classId.replace(/^class-/, '');
  return {
    id,
    classId,
    level,
    exp: 0,
    awakening: 0,
    imprint: 0,
    talents: {},
    equipment: { weapon, helmet: null, armor: null, necklace: 'item-colar-forca', ring: null, boots: null },
    weaponType: weaponType as Hero['weaponType'],
    duelSkills: [`skill-ataque-${slug}`, `skill-especial-${slug}`],
    mapSkills: [],
    tacticsScript: [{ enabled: true, skillId: `skill-especial-${slug}`, conditions: [] }],
  };
}

function stored(ownerPlayerId: string, hero: Hero): StoredHero {
  const equippedItems = Object.values(hero.equipment)
    .filter((id): id is string => id !== null)
    .map((id) => catalog.items[id])
    .filter((item): item is NonNullable<typeof item> => item !== undefined);
  return { ownerPlayerId, hero, equippedItems };
}

const heroes: StoredHero[] = [
  // `hero-jogador` é o herói que tem fragmento declarado no catálogo
  // (`material-fragmento-hero-jogador`), então é o único que pode ganhar imprint — o
  // roteiro de verificação precisa exatamente dele.
  stored('dev-player-1', devHero('hero-jogador', 'class-espadachim', 'sword', 'item-arma-espadachim')),
  stored('dev-player-1', devHero('dev-arqueiro', 'class-arqueiro', 'bow', 'item-arma-arqueiro')),
  stored('dev-player-2', devHero('dev-guerreiro', 'class-guerreiro', 'axe', 'item-arma-guerreiro')),
  stored('dev-player-2', devHero('dev-lanceiro', 'class-lanceiro', 'spear', 'item-arma-lanceiro')),
];

const app = buildApp({
    economyRepository: createMemoryEconomyRepository(),
  repository: createMemoryPlayerRepository([
    // Ouro e pedras semeados: o ciclo de aceite começa em farmar, mas verificar enhance
    // sem nada na carteira exigiria farmar ouro antes de cada tentativa.
    {
      id: 'dev-player-1',
      token: ATTACKER_TOKEN,
      displayName: 'Atacante (dev)',
      elo: 1200,
      arenaMarks: 0,
      ...DEFAULT_PVE_ACCOUNT,
      gold: 50_000,
      stones: 200,
      energy: { stored: catalog.economyRules.energy.max, asOfMs: Date.now() },
    },
    { id: 'dev-player-2', token: DEFENDER_TOKEN, displayName: 'Defensor (dev)', elo: 1200, arenaMarks: 0, ...DEFAULT_PVE_ACCOUNT },
  ]),
  heroRepository: createMemoryHeroRepository(heroes),
  // O defensor já entra com defesa montada: sem ela, `/matchmaking/opponent` não devolve
  // ninguém e não há partida a jogar.
  arenaDefenseRepository: createMemoryArenaDefenseRepository([
    {
      ownerPlayerId: 'dev-player-2',
      mapId: 'map-arena-coliseu',
      units: [
        { heroId: 'dev-guerreiro', pos: { x: 12, y: 6 }, height: 0, aiArchetype: 'aggressive' },
        { heroId: 'dev-lanceiro', pos: { x: 12, y: 8 }, height: 0, aiArchetype: 'hold-position' },
      ],
    },
  ]),
  replayRepository: createMemoryReplayRepository(),
  seasonRepository: createMemorySeasonRepository(),
  catalog,
  shopCatalog: loadShopCatalog(),
  rateLimiter: createInMemoryRateLimiter({ maxRequests: 60, windowMs: 60_000 }),
  // Segredo fixo: é servidor de desenvolvimento, e a seed precisa ser reprodutível entre
  // reinícios pra um roteiro de verificação valer alguma coisa.
  ticketSecret: 'segredo-de-desenvolvimento',
});

const port = Number(process.env.PORT ?? 3000);
app.listen({ port, host: '127.0.0.1' }).then(() => {
  console.log(`servidor de desenvolvimento (em memória) em http://127.0.0.1:${port}`);
  console.log(`  token do atacante: ${ATTACKER_TOKEN}  (heróis: dev-espadachim, dev-arqueiro)`);
  console.log(`  token do defensor: ${DEFENDER_TOKEN}  (defesa montada em map-arena-coliseu)`);
});
