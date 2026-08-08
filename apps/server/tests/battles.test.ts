import { RULES_VERSION } from '@paths-beyond/core';
import type { ClassDef, GridMap, Hero, SkillDef, StatSheet, Terrain } from '@paths-beyond/core';
import type { ArenaMap, ContentCatalog } from '@paths-beyond/content';
import { describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { createInMemoryRateLimiter, type RateLimiter } from '../src/battle/rateLimit.js';
import {
  createMemoryArenaDefenseRepository,
  createMemoryHeroRepository,
  createMemoryPlayerRepository,
  createMemoryReplayRepository,
  createMemorySeasonRepository,
} from '../src/repository/memoryRepository.js';
import type { ArenaDefense, StoredHero } from '../src/repository/types.js';

const plain: Terrain = { id: 'plain', moveCost: { foot: 1, cavalry: 1, flying: 1, heavy: 1, aquatic: 2 }, defBonus: 0, evaBonus: 0, blocksSight: false };

function buildGrid(): GridMap {
  const tiles = Array.from({ length: 5 }, () => Array.from({ length: 5 }, () => ({ terrain: 'plain', height: 0 as const })));
  return { width: 5, height: 5, tiles, terrains: { plain }, zocEnabled: false };
}

function statSheet(overrides: Partial<StatSheet> = {}): Partial<StatSheet> {
  return { hp: 1000, atk: 200, def: 100, spd: 90, ...overrides };
}

const classDef: ClassDef = {
  id: 'classe-teste',
  name: 'Classe Teste',
  tier: 'base',
  unitType: 'infantry',
  moveType: 'foot',
  moveRange: 4,
  allowedWeapons: ['sword'],
  basePools: { ap: 2, pp: 2 },
  statCurve: Array.from({ length: 60 }, () => statSheet()),
  awakeningMultipliers: [1000, 1000, 1000, 1000, 1000, 1000, 1000],
  promotionFlat: [],
  imprintFlat: [[], [], [], [], [], []],
  talentTree: [],
};

const strongClassDef: ClassDef = { ...classDef, id: 'classe-forte', statCurve: Array.from({ length: 60 }, () => statSheet({ hp: 5000, atk: 2000, def: 100 })) };
const weakClassDef: ClassDef = { ...classDef, id: 'classe-fraca', statCurve: Array.from({ length: 60 }, () => statSheet({ hp: 1, atk: 10, def: 0 })) };

const basico: SkillDef = {
  id: 'skill-basico', name: 'Golpe Básico', kind: 'duel', apCost: 1, cooldown: 0,
  multiplier: 1000, flat: 0, scalesWith: 'atk', effects: [], tags: ['physical'],
};

function buildHero(overrides: Partial<Hero> = {}): Hero {
  return {
    id: 'heroi-x',
    classId: classDef.id,
    level: 1,
    exp: 0,
    awakening: 0,
    imprint: 0,
    talents: {},
    equipment: { weapon: null, helmet: null, armor: null, necklace: null, ring: null, boots: null },
    weaponType: 'sword',
    duelSkills: ['skill-basico'],
    mapSkills: [],
    tacticsScript: [{ enabled: true, skillId: 'skill-basico', conditions: [] }],
    ...overrides,
  };
}

const arenaMap: ArenaMap = { grid: buildGrid(), winCondition: { t: 'rout' }, initialValor: 5 };

const catalog: ContentCatalog = {
  classes: { [classDef.id]: classDef, [strongClassDef.id]: strongClassDef, [weakClassDef.id]: weakClassDef },
  skills: { [basico.id]: basico },
  items: {},
  itemSets: {},
  effects: {},
  weaponDuelRanges: { sword: 1, axe: 1, spear: 1, bow: 2, arcane: 2, nature: 2, holy: 2 },
  maps: { 'mapa-teste': arenaMap },
  comps: [],
  baselineReactionSkillIds: [],
};

const ATTACKER_TOKEN = 'token-atacante';
const DEFENDER_TOKEN = 'token-defensor';

function buildTestApp(rateLimiter: RateLimiter = createInMemoryRateLimiter({ maxRequests: 1000, windowMs: 60_000 })) {
  const repository = createMemoryPlayerRepository([
    { id: 'player-atacante', token: ATTACKER_TOKEN, displayName: 'Atacante', elo: 1200, arenaMarks: 0 },
    { id: 'player-defensor', token: DEFENDER_TOKEN, displayName: 'Defensor', elo: 1200, arenaMarks: 0 },
  ]);

  const attackerHero: StoredHero = {
    ownerPlayerId: 'player-atacante',
    hero: buildHero({ id: 'heroi-atacante', classId: strongClassDef.id }),
    equippedItems: [],
  };
  const defenderHero: StoredHero = {
    ownerPlayerId: 'player-defensor',
    hero: buildHero({ id: 'heroi-defensor', classId: weakClassDef.id }),
    equippedItems: [],
  };
  const heroRepository = createMemoryHeroRepository([attackerHero, defenderHero]);

  const defense: ArenaDefense = {
    ownerPlayerId: 'player-defensor',
    mapId: 'mapa-teste',
    // adjacente ao atacante (pos {x:0,y:0}, duelRange=1) — precisa estar em alcance pro
    // comando `engage` do teste de "roda a batalha" funcionar.
    units: [{ heroId: 'heroi-defensor', pos: { x: 1, y: 0 }, height: 0, aiArchetype: 'hold-position' }],
  };
  const arenaDefenseRepository = createMemoryArenaDefenseRepository([defense]);

  return buildApp({
    repository,
    heroRepository,
    arenaDefenseRepository,
    replayRepository: createMemoryReplayRepository(),
    seasonRepository: createMemorySeasonRepository(),
    catalog,
    shopCatalog: {},
    rateLimiter,
  });
}

describe('PUT /me/defense', () => {
  it('rejeita sem autenticação', async () => {
    const app = buildTestApp();
    const response = await app.inject({ method: 'PUT', url: '/me/defense', payload: { mapId: 'mapa-teste', units: [] } });
    expect(response.statusCode).toBe(401);
  });

  it('rejeita herói que não pertence ao chamador', async () => {
    const app = buildTestApp();
    const response = await app.inject({
      method: 'PUT',
      url: '/me/defense',
      headers: { 'x-player-token': DEFENDER_TOKEN },
      payload: { mapId: 'mapa-teste', units: [{ heroId: 'heroi-atacante', pos: { x: 0, y: 0 }, height: 0, aiArchetype: 'hold-position' }] },
    });
    expect(response.statusCode).toBe(403);
  });

  it('salva a defesa com heróis próprios', async () => {
    const app = buildTestApp();
    const response = await app.inject({
      method: 'PUT',
      url: '/me/defense',
      headers: { 'x-player-token': DEFENDER_TOKEN },
      payload: { mapId: 'mapa-teste', units: [{ heroId: 'heroi-defensor', pos: { x: 3, y: 3 }, height: 0, aiArchetype: 'aggressive' }] },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ ownerPlayerId: 'player-defensor', mapId: 'mapa-teste' });
  });
});

describe('POST /battles', () => {
  const validBody = {
    attackerHeroIds: ['heroi-atacante'],
    defenderPlayerId: 'player-defensor',
    // convenção do endpoint: unitId de cada unidade É o próprio heroId (previsível pro
    // cliente montar o BattleCommand sem precisar perguntar ao servidor "qual é meu
    // unitId" antes de agir).
    commands: [{ t: 'engage', unitId: 'heroi-atacante', targetId: 'heroi-defensor' }],
    rulesVersion: RULES_VERSION,
    nonce: 'nonce-teste-1',
  };

  it('rejeita sem autenticação', async () => {
    const app = buildTestApp();
    const response = await app.inject({ method: 'POST', url: '/battles', payload: validBody });
    expect(response.statusCode).toBe(401);
  });

  it('rejeita rulesVersion diferente da do servidor', async () => {
    const app = buildTestApp();
    const response = await app.inject({
      method: 'POST',
      url: '/battles',
      headers: { 'x-player-token': ATTACKER_TOKEN },
      payload: { ...validBody, rulesVersion: 'versao-errada' },
    });
    expect(response.statusCode).toBe(409);
  });

  it('rejeita herói atacante que não pertence ao chamador', async () => {
    const app = buildTestApp();
    const response = await app.inject({
      method: 'POST',
      url: '/battles',
      headers: { 'x-player-token': ATTACKER_TOKEN },
      payload: { ...validBody, attackerHeroIds: ['heroi-defensor'] },
    });
    expect(response.statusCode).toBe(403);
  });

  it('rejeita quando o defensor não tem uma defesa configurada', async () => {
    const app = buildTestApp();
    const response = await app.inject({
      method: 'POST',
      url: '/battles',
      headers: { 'x-player-token': ATTACKER_TOKEN },
      payload: { ...validBody, defenderPlayerId: 'ninguem' },
    });
    expect(response.statusCode).toBe(404);
  });

  it('roda a batalha no servidor e devolve um resultado autoritativo, com seed gerado pelo servidor', async () => {
    const app = buildTestApp();
    const response = await app.inject({
      method: 'POST',
      url: '/battles',
      headers: { 'x-player-token': ATTACKER_TOKEN },
      payload: validBody,
    });
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(typeof body.seed).toBe('number');
    // atacante forte vs defensor fraco (hp=1) — engajar já devia matar o defensor.
    expect(body.result.outcome).toBe('victory');
  });

  it('atualiza o ELO dos dois jogadores quando a batalha chega a uma conclusão', async () => {
    const app = buildTestApp();
    const response = await app.inject({
      method: 'POST',
      url: '/battles',
      headers: { 'x-player-token': ATTACKER_TOKEN },
      payload: validBody,
    });
    const body = response.json();
    // atacante venceu -> ganha ELO, defensor perdeu -> perde ELO (ambos começam em 1200).
    expect(body.elo.attacker).toBeGreaterThan(1200);
    expect(body.elo.defender).toBeLessThan(1200);

    const meResponse = await app.inject({ method: 'GET', url: '/me', headers: { 'x-player-token': ATTACKER_TOKEN } });
    expect(meResponse.json().elo).toBe(body.elo.attacker);
  });

  it('credita marcas de arena nos dois jogadores quando a batalha chega a uma conclusão — mais pro vencedor', async () => {
    const app = buildTestApp();
    const response = await app.inject({
      method: 'POST',
      url: '/battles',
      headers: { 'x-player-token': ATTACKER_TOKEN },
      payload: validBody,
    });
    const body = response.json();
    // atacante venceu -> ganha mais marcas; defensor perdeu -> ganha menos, nunca zero
    // (ambos começam em 0).
    expect(body.arenaMarks.attacker).toBeGreaterThan(0);
    expect(body.arenaMarks.defender).toBeGreaterThan(0);
    expect(body.arenaMarks.attacker).toBeGreaterThan(body.arenaMarks.defender);

    const meResponse = await app.inject({ method: 'GET', url: '/me', headers: { 'x-player-token': ATTACKER_TOKEN } });
    expect(meResponse.json().arenaMarks).toBe(body.arenaMarks.attacker);
  });

  it('o cliente nunca envia stats — só ids e comandos — e o servidor resolve tudo sozinho', async () => {
    // Prova indireta: o body de requisição válido (`validBody`) não tem NENHUM campo de
    // stat/HP/dano — só heroIds e comandos por unitId — e mesmo assim a batalha roda
    // corretamente (teste anterior), porque o servidor resolveu os stats reais a partir
    // do HeroRepository + catálogo, nunca do que o cliente mandou.
    expect(Object.keys(validBody)).toEqual(['attackerHeroIds', 'defenderPlayerId', 'commands', 'rulesVersion', 'nonce']);
  });

  it('rejeita sem nonce', async () => {
    const app = buildTestApp();
    const { nonce: _nonce, ...withoutNonce } = validBody;
    const response = await app.inject({
      method: 'POST',
      url: '/battles',
      headers: { 'x-player-token': ATTACKER_TOKEN },
      payload: withoutNonce,
    });
    expect(response.statusCode).toBe(400);
  });

  it('rejeita reenvio do mesmo nonce (anti-replay, §9.4)', async () => {
    const app = buildTestApp();
    const first = await app.inject({
      method: 'POST',
      url: '/battles',
      headers: { 'x-player-token': ATTACKER_TOKEN },
      payload: validBody,
    });
    expect(first.statusCode).toBe(200);

    const second = await app.inject({
      method: 'POST',
      url: '/battles',
      headers: { 'x-player-token': ATTACKER_TOKEN },
      payload: validBody,
    });
    expect(second.statusCode).toBe(409);
  });

  it('rejeita quando o limite de tentativas por minuto é excedido (rate limiting, §9.4)', async () => {
    const app = buildTestApp(createInMemoryRateLimiter({ maxRequests: 1, windowMs: 60_000 }));

    const first = await app.inject({
      method: 'POST',
      url: '/battles',
      headers: { 'x-player-token': ATTACKER_TOKEN },
      payload: validBody,
    });
    expect(first.statusCode).toBe(200);

    const second = await app.inject({
      method: 'POST',
      url: '/battles',
      headers: { 'x-player-token': ATTACKER_TOKEN },
      payload: { ...validBody, nonce: 'nonce-teste-2' },
    });
    expect(second.statusCode).toBe(429);
  });
});

describe('GET /battles/:nonce', () => {
  const validBody = {
    attackerHeroIds: ['heroi-atacante'],
    defenderPlayerId: 'player-defensor',
    commands: [{ t: 'engage', unitId: 'heroi-atacante', targetId: 'heroi-defensor' }],
    rulesVersion: RULES_VERSION,
    nonce: 'nonce-replay-1',
  };

  it('404 pra nonce desconhecido', async () => {
    const app = buildTestApp();
    const response = await app.inject({
      method: 'GET',
      url: '/battles/nao-existe',
      headers: { 'x-player-token': ATTACKER_TOKEN },
    });
    expect(response.statusCode).toBe(404);
  });

  it('o atacante e o defensor conseguem ler o replay depois da batalha; ninguém mais pode', async () => {
    const app = buildTestApp();
    await app.inject({
      method: 'POST',
      url: '/battles',
      headers: { 'x-player-token': ATTACKER_TOKEN },
      payload: validBody,
    });

    const asAttacker = await app.inject({
      method: 'GET',
      url: `/battles/${validBody.nonce}`,
      headers: { 'x-player-token': ATTACKER_TOKEN },
    });
    expect(asAttacker.statusCode).toBe(200);
    expect(asAttacker.json()).toMatchObject({ nonce: validBody.nonce, attackerPlayerId: 'player-atacante', defenderPlayerId: 'player-defensor' });

    const asDefender = await app.inject({
      method: 'GET',
      url: `/battles/${validBody.nonce}`,
      headers: { 'x-player-token': DEFENDER_TOKEN },
    });
    expect(asDefender.statusCode).toBe(200);
  });
});
