import { describe, expect, it } from 'vitest';
import { resolveAiTurns } from '../../src/battle/aiTurn.js';
import { applyCommandAndAdvance, buildInitialState } from '../../src/battle/simulate.js';
import type { BattleSetup, BattleUnit } from '../../src/battle/types.js';
import type { GridMap, Terrain } from '../../src/grid/types.js';
import type { StatSheet } from '../../src/stats/types.js';
import type { SkillDef } from '../../src/skills/types.js';

const plain: Terrain = { id: 'plain', moveCost: { foot: 1, cavalry: 1, flying: 1, heavy: 1, aquatic: 2 }, defBonus: 0, evaBonus: 0, blocksSight: false };

function buildMap(): GridMap {
  const tiles = Array.from({ length: 5 }, () => Array.from({ length: 5 }, () => ({ terrain: 'plain', height: 0 as const })));
  return { width: 5, height: 5, tiles, terrains: { plain }, zocEnabled: false };
}

function statSheet(overrides: Partial<StatSheet> = {}): StatSheet {
  return {
    hp: 5000, atk: 1000, def: 300, spd: 100, chc: 100, chd: 1500,
    eff: 0, efr: 0, pen: 0, heal: 0, lifesteal: 0, focus: 0, vigor: 0,
    ...overrides,
  };
}

const strike: SkillDef = {
  id: 'skill-strike', name: 'Golpe', kind: 'duel', apCost: 1, cooldown: 0,
  multiplier: 1500, flat: 100, scalesWith: 'atk', effects: [], tags: ['physical'],
};

function buildUnit(overrides: Partial<BattleUnit> = {}): BattleUnit {
  return {
    unitId: 'u1', heroId: 'h1', side: 'player',
    pos: { x: 0, y: 0 }, height: 0,
    hp: 5000, ap: 3, pp: 2, hasActedThisRound: false,
    effects: [], cooldowns: {},
    stats: statSheet(), unitType: 'infantry', weaponType: 'sword', duelRange: 1, assistRange: 2,
    moveType: 'foot', moveRange: 4,
    tacticsScript: [{ enabled: true, skillId: strike.id, conditions: [] }],
    reactionScript: [],
    knownSkills: { [strike.id]: strike },
    ...overrides,
  };
}

function buildSetup(units: readonly BattleUnit[]): BattleSetup {
  return {
    map: buildMap(),
    units,
    permadeath: 'classic',
    winCondition: { t: 'rout' },
    effectDefs: {},
    initialValor: 5,
  };
}

describe('resolveAiTurns / wiring em buildInitialState+applyCommandAndAdvance (M7, sub-sessão 6)', () => {
  it('unidade com aiArchetype fora de alcance já age sozinha (wait) logo em buildInitialState, sem nenhum comando explícito', () => {
    const human = buildUnit({ unitId: 'atk', side: 'player', pos: { x: 0, y: 0 } });
    const ai = buildUnit({ unitId: 'def', side: 'enemy', pos: { x: 4, y: 4 }, aiArchetype: 'hold-position' });
    const state = buildInitialState(buildSetup([human, ai]), 1);

    expect(state.units.find((u) => u.unitId === 'def')?.hasActedThisRound).toBe(true);
    expect(state.units.find((u) => u.unitId === 'atk')?.hasActedThisRound).toBe(false);
  });

  it('IA engaja e resolve o duelo sozinha quando o alvo já está em alcance no início da batalha', () => {
    const human = buildUnit({ unitId: 'atk', side: 'player', pos: { x: 1, y: 0 }, hp: 400, stats: statSheet({ hp: 400, def: 0 }) });
    const ai = buildUnit({ unitId: 'def', side: 'enemy', pos: { x: 0, y: 0 }, aiArchetype: 'aggressive' });
    const state = buildInitialState(buildSetup([human, ai]), 1);

    // A IA já devia ter engajado 'atk' (adjacente, dentro do duelRange=1) sem nenhum comando.
    const attackedHuman = state.units.find((u) => u.unitId === 'atk');
    expect(attackedHuman?.hp).toBeLessThan(400);
  });

  it('quando nenhuma unidade tem aiArchetype, o comportamento é idêntico ao de antes (nada é resolvido sozinho)', () => {
    const attacker = buildUnit({ unitId: 'atk', side: 'player' });
    const defender = buildUnit({ unitId: 'def', side: 'enemy', pos: { x: 1, y: 0 } });
    const state = buildInitialState(buildSetup([attacker, defender]), 1);

    expect(state.units.every((u) => !u.hasActedThisRound)).toBe(true);
  });

  it('a IA não avança pra o próximo round sozinha enquanto restar unidade humana pendente no round atual', () => {
    const humanA = buildUnit({ unitId: 'h1', side: 'player', pos: { x: 0, y: 0 } });
    const humanB = buildUnit({ unitId: 'h2', side: 'player', pos: { x: 0, y: 1 } });
    const ai = buildUnit({ unitId: 'ai1', side: 'enemy', pos: { x: 4, y: 4 }, aiArchetype: 'hold-position' });
    let state = buildInitialState(buildSetup([humanA, humanB, ai]), 1);

    // a IA já resolveu (fora de alcance, sem alvo -> wait), mas o round não fechou:
    // ainda restam dois humanos pendentes.
    expect(state.units.find((u) => u.unitId === 'ai1')?.hasActedThisRound).toBe(true);
    expect(state.round).toBe(1);

    state = applyCommandAndAdvance(state, { t: 'wait', unitId: 'h1' }).state;
    expect(state.round).toBe(1); // ainda falta h2

    state = applyCommandAndAdvance(state, { t: 'wait', unitId: 'h2' }).state;
    expect(state.round).toBe(2); // agora sim, todo mundo agiu -> round fechou
  });

  it('resolveAiTurns direto: para imediatamente se o outcome já não é "ongoing"', () => {
    const human = buildUnit({ unitId: 'atk', side: 'player' });
    const ai = buildUnit({ unitId: 'def', side: 'enemy', pos: { x: 1, y: 0 }, aiArchetype: 'aggressive' });
    const state = buildInitialState(buildSetup([human, ai]), 1);
    const finished = { ...state, outcome: 'victory' as const };

    const result = resolveAiTurns(finished);
    expect(result).toEqual(finished);
  });

  it('é determinística: mesma entrada produz o mesmo hash duas vezes', () => {
    const human = buildUnit({ unitId: 'atk', side: 'player', pos: { x: 1, y: 0 } });
    const ai = buildUnit({ unitId: 'def', side: 'enemy', pos: { x: 0, y: 0 }, aiArchetype: 'aggressive' });
    const state = buildInitialState(buildSetup([human, ai]), 1);

    const a = JSON.stringify(resolveAiTurns(state));
    const b = JSON.stringify(resolveAiTurns(state));
    expect(a).toBe(b);
  });

  it('é pura: não muta o BattleState recebido', () => {
    const human = buildUnit({ unitId: 'atk', side: 'player', pos: { x: 1, y: 0 } });
    const ai = buildUnit({ unitId: 'def', side: 'enemy', pos: { x: 0, y: 0 }, aiArchetype: 'aggressive' });
    const state = buildInitialState(buildSetup([human, ai]), 1);
    const frozen = structuredClone(state);

    resolveAiTurns(state);
    expect(state).toEqual(frozen);
  });
});
