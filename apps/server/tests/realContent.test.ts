import { RULES_VERSION, type Hero } from '@paths-beyond/core';
import { loadCatalogFromDisk } from '@paths-beyond/content';
import { describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { createInMemoryRateLimiter } from '../src/battle/rateLimit.js';
import {
  createMemoryArenaDefenseRepository,
  createMemoryHeroRepository,
  createMemoryPlayerRepository,
  createMemoryReplayRepository,
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
describe('POST /battles — conteúdo real de packages/data (M9, sub-sessão 2)', () => {
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
      { id: 'player-real-atacante', token: 'token-real-atacante', displayName: 'Atacante', elo: 1200, arenaMarks: 0, ...DEFAULT_PVE_ACCOUNT },
      { id: 'player-real-defensor', token: 'token-real-defensor', displayName: 'Defensor', elo: 1200, arenaMarks: 0, ...DEFAULT_PVE_ACCOUNT },
    ]);
    const heroRepository = createMemoryHeroRepository([
      { ownerPlayerId: 'player-real-atacante', hero: attackerHero, equippedItems: [] },
      { ownerPlayerId: 'player-real-defensor', hero: defenderHero, equippedItems: [] },
    ]);

    const app = buildApp({
    economyRepository: createMemoryEconomyRepository(),
    ownershipRepository: createMemoryCharacterOwnershipRepository(),
      repository,
      heroRepository,
      arenaDefenseRepository: createMemoryArenaDefenseRepository(),
      replayRepository: createMemoryReplayRepository(),
      seasonRepository: createMemorySeasonRepository(),
      catalog,
      shopCatalog: {},
      ticketSecret: TICKET_SECRET,
    rateLimiter: createInMemoryRateLimiter({ maxRequests: 1000, windowMs: 60_000 }),
    });

    const saveDefense = await app.inject({
      method: 'PUT',
      url: '/me/defense',
      headers: { 'x-player-token': 'token-real-defensor' },
      payload: {
        mapId,
        units: [{ heroId: defenderHero.id, pos: { x: 5, y: 5 }, height: 0, aiArchetype: 'aggressive' }],
      },
    });
    expect(saveDefense.statusCode).toBe(200);

    const createBattle = await app.inject({
      method: 'POST',
      url: '/battles',
      headers: { 'x-player-token': 'token-real-atacante' },
      payload: {
        attackerHeroIds: [attackerHero.id],
        defenderPlayerId: 'player-real-defensor',
        commands: [],
        rulesVersion: RULES_VERSION,
        nonce: 'nonce-conteudo-real-1',
      },
    });

    expect(createBattle.statusCode).toBe(200);
    const body = createBattle.json();
    expect(['victory', 'defeat', 'ongoing']).toContain(body.result.outcome);
    expect(body.result.finalUnits).toHaveLength(2);
    for (const unit of body.result.finalUnits) {
      expect(unit.stats.spd).toBeGreaterThan(0);
      expect(unit.stats.hp).toBeGreaterThan(0);
    }
  });
});
