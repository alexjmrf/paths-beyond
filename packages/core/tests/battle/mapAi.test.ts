import { describe, expect, it } from 'vitest';
import { computeInitiativeOrder } from '../../src/battle/initiative.js';
import { GUARD_LEASH_TILES, decideMapAiCommand } from '../../src/battle/mapAi.js';
import type { BattleState, BattleUnit } from '../../src/battle/types.js';
import type { GridMap, Terrain } from '../../src/grid/types.js';
import { manhattanDistance } from '../../src/grid/types.js';
import type { StatSheet } from '../../src/stats/types.js';

const plain: Terrain = { id: 'plain', moveCost: { foot: 1, cavalry: 1, flying: 1, heavy: 1, aquatic: 2 }, defBonus: 0, evaBonus: 0, blocksSight: false };

function buildMap(size = 10): GridMap {
  const tiles = Array.from({ length: size }, () => Array.from({ length: size }, () => ({ terrain: 'plain', height: 0 as const })));
  return { width: size, height: size, tiles, terrains: { plain }, zocEnabled: false };
}

function statSheet(overrides: Partial<StatSheet> = {}): StatSheet {
  return {
    hp: 1000, atk: 500, def: 200, spd: 100, chc: 0, chd: 1500,
    eff: 0, efr: 0, pen: 0, heal: 0, lifesteal: 0, focus: 0, vigor: 0,
    ...overrides,
  };
}

function buildUnit(overrides: Partial<BattleUnit> = {}): BattleUnit {
  return {
    unitId: 'u1', heroId: 'h1', side: 'player',
    pos: { x: 0, y: 0 }, height: 0,
    hp: 1000, ap: 3, pp: 2, hasActedThisRound: false,
    effects: [], cooldowns: {},
    stats: statSheet(), unitType: 'infantry', weaponType: 'sword', duelRange: 1, assistRange: 3,
    moveType: 'foot', moveRange: 10,
    tacticsScript: [], reactionScript: [], knownSkills: {},
    ...overrides,
  };
}

function buildState(units: readonly BattleUnit[]): BattleState {
  return {
    map: buildMap(),
    units,
    initiativeOrder: computeInitiativeOrder(units.map((u) => ({ id: u.unitId, spd: u.stats.spd })), 42),
    round: 1,
    valor: 5,
    distanceMovedThisTurn: {},
    freeAssistUsedThisRound: [],
    permadeath: 'classic',
    winCondition: { t: 'rout' },
    effectDefs: {},
    outcome: 'ongoing',
    seed: 42,
  };
}

describe('decideMapAiCommand — aggressive (§9.1)', () => {
  it('engaja o inimigo de menor HP% quando mais de um está no duelRange', () => {
    const self = buildUnit({ unitId: 'self', side: 'player', pos: { x: 5, y: 5 } });
    const weakEnemy = buildUnit({ unitId: 'enemy-weak', side: 'enemy', pos: { x: 5, y: 6 }, hp: 200, stats: statSheet({ hp: 1000 }) });
    const strongEnemy = buildUnit({ unitId: 'enemy-strong', side: 'enemy', pos: { x: 6, y: 5 }, hp: 900, stats: statSheet({ hp: 1000 }) });
    const state = buildState([self, weakEnemy, strongEnemy]);

    const command = decideMapAiCommand({ state, unitId: 'self', archetype: 'aggressive' });
    expect(command).toEqual({ t: 'engage', unitId: 'self', targetId: 'enemy-weak' });
  });

  it('desempate por menor unitId quando HP% empata', () => {
    const self = buildUnit({ unitId: 'self', pos: { x: 5, y: 5 } });
    const enemyB = buildUnit({ unitId: 'enemy-b', side: 'enemy', pos: { x: 5, y: 6 }, hp: 500, stats: statSheet({ hp: 1000 }) });
    const enemyA = buildUnit({ unitId: 'enemy-a', side: 'enemy', pos: { x: 6, y: 5 }, hp: 500, stats: statSheet({ hp: 1000 }) });
    const state = buildState([self, enemyB, enemyA]);

    const command = decideMapAiCommand({ state, unitId: 'self', archetype: 'aggressive' });
    expect(command).toEqual({ t: 'engage', unitId: 'self', targetId: 'enemy-a' });
  });

  it('sem ninguém no duelRange, move pro tile alcançável mais próximo do inimigo mais próximo', () => {
    const self = buildUnit({ unitId: 'self', pos: { x: 0, y: 0 }, moveRange: 4 });
    const enemy = buildUnit({ unitId: 'enemy', side: 'enemy', pos: { x: 6, y: 0 } });
    const state = buildState([self, enemy]);

    const command = decideMapAiCommand({ state, unitId: 'self', archetype: 'aggressive' });
    expect(command.t).toBe('move');
    if (command.t !== 'move') throw new Error('unreachable');
    const dest = command.path[command.path.length - 1]!;
    expect(dest).toEqual({ x: 4, y: 0 });
  });

  it('sem nenhum inimigo vivo, espera', () => {
    const self = buildUnit({ unitId: 'self' });
    const state = buildState([self]);
    expect(decideMapAiCommand({ state, unitId: 'self', archetype: 'aggressive' })).toEqual({ t: 'wait', unitId: 'self' });
  });

  it('é determinística: mesma entrada produz o mesmo hash duas vezes', () => {
    const self = buildUnit({ unitId: 'self', pos: { x: 0, y: 0 }, moveRange: 4 });
    const enemy = buildUnit({ unitId: 'enemy', side: 'enemy', pos: { x: 6, y: 0 } });
    const state = buildState([self, enemy]);
    const input = { state, unitId: 'self', archetype: 'aggressive' as const };
    expect(JSON.stringify(decideMapAiCommand(input))).toBe(JSON.stringify(decideMapAiCommand(input)));
  });
});

describe('decideMapAiCommand — hold-position (§9.1)', () => {
  it('engaja se o inimigo já está no duelRange, sem se mover', () => {
    const self = buildUnit({ unitId: 'self', pos: { x: 5, y: 5 }, duelRange: 1 });
    const enemy = buildUnit({ unitId: 'enemy', side: 'enemy', pos: { x: 5, y: 6 } });
    const state = buildState([self, enemy]);
    expect(decideMapAiCommand({ state, unitId: 'self', archetype: 'hold-position' })).toEqual({
      t: 'engage', unitId: 'self', targetId: 'enemy',
    });
  });

  it('nunca emite move — espera mesmo com um inimigo se aproximando fora do duelRange', () => {
    const self = buildUnit({ unitId: 'self', pos: { x: 0, y: 0 }, duelRange: 1, moveRange: 10 });
    const enemy = buildUnit({ unitId: 'enemy', side: 'enemy', pos: { x: 3, y: 0 } });
    const state = buildState([self, enemy]);
    expect(decideMapAiCommand({ state, unitId: 'self', archetype: 'hold-position' })).toEqual({
      t: 'wait', unitId: 'self',
    });
  });
});

describe('decideMapAiCommand — guard-tile (§9.1)', () => {
  it('move no máximo GUARD_LEASH_TILES em vez do moveRange inteiro', () => {
    const self = buildUnit({ unitId: 'self', pos: { x: 0, y: 0 }, moveRange: 10, duelRange: 1 });
    const enemy = buildUnit({ unitId: 'enemy', side: 'enemy', pos: { x: 6, y: 0 } });
    const state = buildState([self, enemy]);

    const command = decideMapAiCommand({ state, unitId: 'self', archetype: 'guard-tile' });
    expect(command.t).toBe('move');
    if (command.t !== 'move') throw new Error('unreachable');
    const dest = command.path[command.path.length - 1]!;
    expect(manhattanDistance({ x: 0, y: 0 }, dest)).toBe(GUARD_LEASH_TILES);

    // Prova que o comportamento realmente difere de aggressive na mesma situação.
    const aggressiveCommand = decideMapAiCommand({ state, unitId: 'self', archetype: 'aggressive' });
    if (aggressiveCommand.t !== 'move') throw new Error('unreachable');
    const aggressiveDest = aggressiveCommand.path[aggressiveCommand.path.length - 1]!;
    expect(manhattanDistance({ x: 0, y: 0 }, aggressiveDest)).toBeGreaterThan(GUARD_LEASH_TILES);
  });

  it('engaja normalmente se o inimigo já está no duelRange, ignorando o leash', () => {
    const self = buildUnit({ unitId: 'self', pos: { x: 5, y: 5 }, duelRange: 1 });
    const enemy = buildUnit({ unitId: 'enemy', side: 'enemy', pos: { x: 5, y: 6 } });
    const state = buildState([self, enemy]);
    expect(decideMapAiCommand({ state, unitId: 'self', archetype: 'guard-tile' })).toEqual({
      t: 'engage', unitId: 'self', targetId: 'enemy',
    });
  });
});

describe('decideMapAiCommand — flank (§9.1)', () => {
  it('dentre vários inimigos no duelRange, prioriza o que já tem aliado adjacente (Cerco em formação)', () => {
    const self = buildUnit({ unitId: 'self', pos: { x: 5, y: 5 }, duelRange: 2 });
    const ally = buildUnit({ unitId: 'ally', side: 'player', pos: { x: 5, y: 6 } });
    const supported = buildUnit({ unitId: 'enemy-supported', side: 'enemy', pos: { x: 5, y: 7 }, hp: 900, stats: statSheet({ hp: 1000 }) }); // adjacente ao ally
    const lone = buildUnit({ unitId: 'enemy-lone', side: 'enemy', pos: { x: 6, y: 5 }, hp: 200, stats: statSheet({ hp: 1000 }) }); // menor HP%, mas sem suporte
    const state = buildState([self, ally, supported, lone]);

    const command = decideMapAiCommand({ state, unitId: 'self', archetype: 'flank' });
    expect(command).toEqual({ t: 'engage', unitId: 'self', targetId: 'enemy-supported' });
  });

  it('sem ninguém no duelRange, move em direção ao inimigo com suporte de aliado em vez do mais próximo', () => {
    const self = buildUnit({ unitId: 'self', pos: { x: 0, y: 0 }, duelRange: 1, moveRange: 10 });
    const nearLone = buildUnit({ unitId: 'enemy-near', side: 'enemy', pos: { x: 3, y: 0 } });
    const ally = buildUnit({ unitId: 'ally', side: 'player', pos: { x: 0, y: 4 } });
    const farSupported = buildUnit({ unitId: 'enemy-far-supported', side: 'enemy', pos: { x: 0, y: 5 } }); // adjacente ao ally
    const state = buildState([self, nearLone, ally, farSupported]);

    const command = decideMapAiCommand({ state, unitId: 'self', archetype: 'flank' });
    expect(command.t).toBe('move');
    if (command.t !== 'move') throw new Error('unreachable');
    const dest = command.path[command.path.length - 1]!;
    expect(manhattanDistance(dest, farSupported.pos)).toBeLessThan(manhattanDistance(dest, nearLone.pos));
    expect(manhattanDistance(dest, farSupported.pos)).toBeLessThan(manhattanDistance(self.pos, farSupported.pos));
  });
});

describe('decideMapAiCommand — support-nearest (§9.1)', () => {
  it('engaja normalmente se um inimigo já está no próprio duelRange', () => {
    const self = buildUnit({ unitId: 'self', pos: { x: 5, y: 5 }, duelRange: 1 });
    const enemy = buildUnit({ unitId: 'enemy', side: 'enemy', pos: { x: 5, y: 6 } });
    const state = buildState([self, enemy]);
    expect(decideMapAiCommand({ state, unitId: 'self', archetype: 'support-nearest' })).toEqual({
      t: 'engage', unitId: 'self', targetId: 'enemy',
    });
  });

  it('sem inimigo em alcance, move pra ficar dentro do assistRange do aliado mais perto de um inimigo', () => {
    const self = buildUnit({ unitId: 'self', pos: { x: 0, y: 0 }, duelRange: 1, moveRange: 10, assistRange: 3 });
    const frontAlly = buildUnit({ unitId: 'ally-front', side: 'player', pos: { x: 5, y: 0 } });
    const enemyNearFront = buildUnit({ unitId: 'enemy', side: 'enemy', pos: { x: 6, y: 0 } });
    const state = buildState([self, frontAlly, enemyNearFront]);

    const command = decideMapAiCommand({ state, unitId: 'self', archetype: 'support-nearest' });
    expect(command.t).toBe('move');
    if (command.t !== 'move') throw new Error('unreachable');
    const dest = command.path[command.path.length - 1]!;
    expect(manhattanDistance(dest, frontAlly.pos)).toBeLessThanOrEqual(3);
  });

  it('já dentro do assistRange do aliado, espera em vez de se aproximar mais', () => {
    const self = buildUnit({ unitId: 'self', pos: { x: 3, y: 0 }, duelRange: 1, moveRange: 10, assistRange: 3 });
    const frontAlly = buildUnit({ unitId: 'ally-front', side: 'player', pos: { x: 5, y: 0 } });
    const enemyFar = buildUnit({ unitId: 'enemy', side: 'enemy', pos: { x: 9, y: 0 } });
    const state = buildState([self, frontAlly, enemyFar]);

    expect(decideMapAiCommand({ state, unitId: 'self', archetype: 'support-nearest' })).toEqual({
      t: 'wait', unitId: 'self',
    });
  });
});
