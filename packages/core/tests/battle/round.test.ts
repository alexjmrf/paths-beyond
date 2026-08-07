import { describe, expect, it } from 'vitest';
import { checkWinCondition, isRoundComplete, endRound } from '../../src/battle/round.js';
import { computeInitiativeOrder } from '../../src/battle/initiative.js';
import type { BattleState, BattleUnit } from '../../src/battle/types.js';
import type { GridMap, Terrain } from '../../src/grid/types.js';
import type { StatSheet } from '../../src/stats/types.js';

const plain: Terrain = { id: 'plain', moveCost: { foot: 1, cavalry: 1, flying: 1, heavy: 1, aquatic: 2 }, defBonus: 0, evaBonus: 0, blocksSight: false };

function buildMap(): GridMap {
  const tiles = Array.from({ length: 3 }, () => Array.from({ length: 3 }, () => ({ terrain: 'plain', height: 0 as const })));
  return { width: 3, height: 3, tiles, terrains: { plain }, zocEnabled: false };
}

function statSheet(overrides: Partial<StatSheet> = {}): StatSheet {
  return {
    hp: 5000, atk: 1000, def: 300, spd: 100, chc: 0, chd: 1500,
    eff: 0, efr: 0, pen: 0, heal: 0, lifesteal: 0, focus: 0, vigor: 0,
    ...overrides,
  };
}

function buildUnit(overrides: Partial<BattleUnit> = {}): BattleUnit {
  return {
    unitId: 'u1', heroId: 'h1', side: 'player',
    pos: { x: 0, y: 0 }, height: 0,
    hp: 5000, ap: 3, pp: 2, hasActedThisRound: false,
    effects: [], cooldowns: {},
    stats: statSheet(), unitType: 'infantry', weaponType: 'sword', duelRange: 1, assistRange: 2,
    moveType: 'foot', moveRange: 4,
    tacticsScript: [], reactionScript: [], knownSkills: {},
    ...overrides,
  };
}

function buildState(units: readonly BattleUnit[], overrides: Partial<BattleState> = {}): BattleState {
  return {
    map: buildMap(),
    units,
    initiativeOrder: computeInitiativeOrder(units.map((u) => ({ id: u.unitId, spd: u.stats.spd })), 42),
    round: 1,
    valor: 5,
    distanceMovedThisTurn: {},
    permadeath: 'classic',
    winCondition: { t: 'rout' },
    effectDefs: {},
    outcome: 'ongoing',
    seed: 42,
    ...overrides,
  };
}

describe('isRoundComplete — §5.3', () => {
  it('falso enquanto alguma unidade viva não agiu', () => {
    const units = [buildUnit({ unitId: 'a', hasActedThisRound: true }), buildUnit({ unitId: 'b', hasActedThisRound: false })];
    expect(isRoundComplete(buildState(units))).toBe(false);
  });

  it('verdadeiro quando todas as unidades vivas agiram', () => {
    const units = [buildUnit({ unitId: 'a', hasActedThisRound: true }), buildUnit({ unitId: 'b', hasActedThisRound: true })];
    expect(isRoundComplete(buildState(units))).toBe(true);
  });

  it('ignora unidades mortas ao checar se o round terminou', () => {
    const units = [
      buildUnit({ unitId: 'a', hasActedThisRound: true }),
      buildUnit({ unitId: 'b', hasActedThisRound: false, hp: 0 }),
    ];
    expect(isRoundComplete(buildState(units))).toBe(true);
  });
});

describe('endRound — §5.3 ("hasActedThisRound reseta, cooldowns decrementam, efeitos tickam")', () => {
  it('reseta hasActedThisRound de todas as unidades vivas e incrementa o round', () => {
    const units = [buildUnit({ unitId: 'a', hasActedThisRound: true })];
    const state = buildState(units, { round: 3 });
    const result = endRound(state);
    expect(result.units[0]?.hasActedThisRound).toBe(false);
    expect(result.round).toBe(4);
  });

  it('decrementa cooldowns sem passar de zero', () => {
    const units = [buildUnit({ unitId: 'a', cooldowns: { 'skill-x': 2, 'skill-y': 0 } })];
    const result = endRound(buildState(units));
    expect(result.units[0]?.cooldowns).toEqual({ 'skill-x': 1, 'skill-y': 0 });
  });

  it('decrementa a duração numérica de efeitos ativos e remove os que expiraram', () => {
    const units = [
      buildUnit({
        unitId: 'a',
        effects: [
          { id: 'e1', duration: 1, stacks: 1, maxStacks: 1, dispellable: true },
          { id: 'e2', duration: 3, stacks: 1, maxStacks: 1, dispellable: true },
        ],
      }),
    ];
    const result = endRound(buildState(units));
    const effects = result.units[0]?.effects ?? [];
    expect(effects).toHaveLength(1);
    expect(effects[0]).toMatchObject({ id: 'e2', duration: 2 });
  });

  it('não tickam efeitos com duração "duel" ou "battle"', () => {
    const units = [
      buildUnit({
        unitId: 'a',
        effects: [
          { id: 'e1', duration: 'duel', stacks: 1, maxStacks: 1, dispellable: true },
          { id: 'e2', duration: 'battle', stacks: 1, maxStacks: 1, dispellable: true },
        ],
      }),
    ];
    const result = endRound(buildState(units));
    expect(result.units[0]?.effects).toHaveLength(2);
  });

  it('soma +1 de valor por round (§5.6)', () => {
    const result = endRound(buildState([buildUnit()], { valor: 5 }));
    expect(result.valor).toBe(6);
  });

  it('zera distanceMovedThisTurn para o próximo round', () => {
    const result = endRound(buildState([buildUnit()], { distanceMovedThisTurn: { a: 3 } }));
    expect(result.distanceMovedThisTurn).toEqual({});
  });
});

describe('checkWinCondition — §5.7 (só `rout` implementado em M3, ver DECISIONS.md)', () => {
  it('ongoing enquanto os dois lados têm sobreviventes', () => {
    const units = [buildUnit({ unitId: 'a', side: 'player' }), buildUnit({ unitId: 'b', side: 'enemy' })];
    expect(checkWinCondition(buildState(units))).toBe('ongoing');
  });

  it('victory quando todos os inimigos morrem', () => {
    const units = [buildUnit({ unitId: 'a', side: 'player' }), buildUnit({ unitId: 'b', side: 'enemy', hp: 0 })];
    expect(checkWinCondition(buildState(units))).toBe('victory');
  });

  it('defeat quando todas as unidades do jogador morrem', () => {
    const units = [buildUnit({ unitId: 'a', side: 'player', hp: 0 }), buildUnit({ unitId: 'b', side: 'enemy' })];
    expect(checkWinCondition(buildState(units))).toBe('defeat');
  });
});
