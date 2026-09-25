import { RULES_VERSION, type Hero } from '@paths-beyond/core';
import { loadCatalogFromDisk } from '@paths-beyond/content';
import { describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { createDevIdentityValidator } from '../src/identity/devIdentity.js';
import { createInMemoryRateLimiter } from '../src/battle/rateLimit.js';
import {
  createMemoryArenaDefenseRepository,
  createMemoryPartyPresetRepository,
  createMemoryHeroRepository,
  createMemoryPlayerRepository,
  createMemoryMatchRepository,
  createMemoryReplayRepository,
  createMemoryRewardsRepository,
  createMemorySeasonRepository,
  createMemoryCharacterOwnershipRepository,
  createMemoryEconomyRepository,
} from '../src/repository/memoryRepository.js';
import { DEFAULT_PVE_ACCOUNT } from '../src/repository/types.js';

// Segredo fixo do HMAC que deriva a seed do nonce (M13, sub-sessão 2/N): teste precisa
// de seed reprodutível.
const TICKET_SECRET = 'segredo-de-teste';

// Fecha o corte de escopo registrado em M7 (`EMPTY_CATALOG`) e o achado 1 da auditoria de
// 2026-08-07 (docs/milestones/M9-integracao-de-conteudo.md, sub-sessão 2): prova que o
// servidor resolve uma batalha real com o catálogo carregado de `packages/data`
// (classes/skills/mapa reais via `loadCatalogFromDisk()`), não só com fixtures montados à
// mão como `battles.test.ts`/`fuzz.test.ts`. Fica AO LADO do fuzz (D5) — o fuzz continua
// testando o MOTOR com conteúdo sintético; este teste prova que o CATÁLOGO real carrega e
// resolve de ponta a ponta através do endpoint HTTP.
describe('a batalha viva com o conteúdo real de packages/data (M9, sub-sessão 2)', () => {
  it('roda uma batalha ponta a ponta com classes/skills/mapa reais e devolve um resultado', async () => {
    const catalog = loadCatalogFromDisk();
    const mapId = Object.keys(catalog.maps)[0];
    expect(mapId).toBeDefined();
    expect(catalog.classes['class-espadachim']).toBeDefined();
    expect(catalog.classes['class-guerreiro']).toBeDefined();

    const attackerHero: Hero = {
      id: 'heroi-real-atacante',
      classId: 'class-espadachim',
      level: 10,
      exp: 0,
      awakening: 0,
      imprint: 0,
      talents: {},
      equipment: { weapon: null, helmet: null, armor: null, necklace: null, ring: null, boots: null },
      weaponType: 'sword',
      duelSkills: ['skill-ataque-espadachim'],
      mapSkills: [],
      tacticsScript: [{ enabled: true, skillId: 'skill-ataque-espadachim', conditions: [] }],
    };
    const defenderHero: Hero = {
      ...attackerHero,
      id: 'heroi-real-defensor',
      classId: 'class-guerreiro',
      weaponType: 'axe',
      duelSkills: ['skill-ataque-guerreiro'],
      tacticsScript: [{ enabled: true, skillId: 'skill-ataque-guerreiro', conditions: [] }],
    };

    const repository = createMemoryPlayerRepository([
      { id: 'player-real-atacante', platformProvider: 'dev' as const, platformId: 'token-real-atacante', displayName: 'Atacante', elo: 1200, arenaMarks: 0, ...DEFAULT_PVE_ACCOUNT },
      { id: 'player-real-defensor', platformProvider: 'dev' as const, platformId: 'token-real-defensor', displayName: 'Defensor', elo: 1200, arenaMarks: 0, ...DEFAULT_PVE_ACCOUNT },
    ]);
    const heroRepository = createMemoryHeroRepository([
      { ownerPlayerId: 'player-real-atacante', hero: attackerHero, equippedItems: [] },
      { ownerPlayerId: 'player-real-defensor', hero: defenderHero, equippedItems: [] },
    ]);

    const app = buildApp({
    economyRepository: createMemoryEconomyRepository(),
    ownershipRepository: createMemoryCharacterOwnershipRepository(),
    rewardsRepository: createMemoryRewardsRepository(),
      repository,
      heroRepository,
      arenaDefenseRepository: createMemoryArenaDefenseRepository(),
      partyPresetRepository: createMemoryPartyPresetRepository(),
      replayRepository: createMemoryReplayRepository(),
      matchRepository: createMemoryMatchRepository(),
      seasonRepository: createMemorySeasonRepository(),
      catalog,
      shopCatalog: {},
      ticketSecret: TICKET_SECRET,
      identityValidator: createDevIdentityValidator(),
    rateLimiter: createInMemoryRateLimiter({ maxRequests: 1000, windowMs: 60_000 }),
    });

    const saveDefense = await app.inject({
      method: 'PUT',
      url: '/me/defense',
      headers: { 'x-platform-ticket': 'dev:token-real-defensor'},
      payload: {
        mapId,
        units: [{ heroId: defenderHero.id, pos: { x: 5, y: 5 }, height: 0, aiArchetype: 'aggressive' }],
      },
    });
    expect(saveDefense.statusCode).toBe(200);

    // M36 2/N — `POST /battles` saiu; abrir a partida viva é o que exercita a mesma corrente
    // (catálogo real → montagem → `buildInitialState` → resposta HTTP). E ela exercita MAIS que
    // antes: a resposta precisa atravessar a redação, então um catálogo que carregasse torto
    // apareceria aqui de dois jeitos em vez de um.
    const abertura = await app.inject({
      method: 'POST',
      url: '/arena/matches',
      headers: { 'x-platform-ticket': 'dev:token-real-atacante' },
      payload: {
        attackerHeroIds: [attackerHero.id],
        defenderPlayerId: 'player-real-defensor',
        rulesVersion: RULES_VERSION,
      },
    });

    expect(abertura.statusCode, abertura.body).toBe(201);
    const body = abertura.json();
    expect(['victory', 'defeat', 'ongoing']).toContain(body.outcome);
    expect(body.visivel.units).toHaveLength(2);

    // O MEU herói resolveu stats de verdade a partir do catálogo real — é o que o teste sempre
    // mediu. O do defensor não traz stats nenhum, e é o que esta milestone acrescentou: o mesmo
    // catálogo real, do outro lado, fica no servidor.
    const meu = body.visivel.units.find((u: { unitId: string }) => u.unitId === attackerHero.id);
    const dele = body.visivel.units.find((u: { unitId: string }) => u.unitId === defenderHero.id);
    expect(meu.stats.spd).toBeGreaterThan(0);
    expect(meu.stats.hp).toBeGreaterThan(0);
    expect(dele.stats).toBeUndefined();
    // Do defensor sobra o que D47 deixou de pé — e o `hpMax` de D48, que é o que a barra lê.
    expect(dele.hp).toBeGreaterThan(0);
    expect(dele.hpMax).toBeGreaterThan(0);
  });
});
