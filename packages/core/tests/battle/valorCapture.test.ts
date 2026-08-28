import { describe, expect, it } from 'vitest';
import { applyCommand } from '../../src/battle/commands.js';
import { computeInitiativeOrder } from '../../src/battle/initiative.js';
import { endRound } from '../../src/battle/round.js';
import type { BattleState, BattleUnit } from '../../src/battle/types.js';
import type { GridMap, Terrain, Tile } from '../../src/grid/types.js';
import type { SkillDef } from '../../src/skills/types.js';
import type { StatSheet } from '../../src/stats/types.js';

// §5.6 — "Começa em 5, +1 por round, **+2 ao capturar objetivo**". As duas primeiras metades
// existem desde M3 (`initialValor`, `endRound`); a terceira nunca teve ponto de aplicação —
// a spec nomeia "objetivo" e não o define em lugar nenhum.
//
// Leitura decidida com o usuário (M15 1/N, ver DECISIONS.md): objetivo é um TILE DE CONTROLE,
// isto é `Tile.object` `fort` ou `camp` — os mesmos que §5.4 já trata como tile valioso
// (+1 AP no `wait`). Capturar = uma unidade VIVA DO JOGADOR encerrar o turno sobre ele, uma
// vez por tile por batalha. As duas restrições não são decoração:
//   - só o jogador, porque §5.6 define Valor como o recurso do exército DELE;
//   - uma vez por tile, senão entrar-e-sair do mesmo fort seria uma bomba de Valor infinita.

const plain: Terrain = {
  id: 'plain', moveCost: { foot: 1, cavalry: 1, flying: 1, heavy: 1, aquatic: 2 },
  defBonus: 0, evaBonus: 0, blocksSight: false,
};

const strike: SkillDef = {
  id: 'skill-strike', name: 'Golpe', kind: 'duel', apCost: 1, cooldown: 0,
  multiplier: 1200, flat: 0, scalesWith: 'atk', effects: [], tags: ['physical'],
};

function statSheet(overrides: Partial<StatSheet> = {}): StatSheet {
  return {
    hp: 5000, atk: 1000, def: 300, spd: 100, chc: 0, chd: 1500,
    eff: 0, efr: 0, pen: 0, heal: 0, lifesteal: 0, focus: 0, vigor: 0,
    ...overrides,
  };
}

// 4x4: fort em (0,0), camp em (3,3), o resto planície limpa.
function buildMap(): GridMap {
  const tiles = Array.from({ length: 4 }, (_unused, y) =>
    Array.from({ length: 4 }, (_unused2, x): Tile => {
      if (x === 0 && y === 0) return { terrain: 'plain', height: 0, object: 'fort' };
      if (x === 3 && y === 3) return { terrain: 'plain', height: 0, object: 'camp' };
      return { terrain: 'plain', height: 0 };
    }),
  );
  return { width: 4, height: 4, tiles, terrains: { plain }, zocEnabled: false };
}

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

function buildState(units: readonly BattleUnit[], overrides: Partial<BattleState> = {}): BattleState {
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
    ...overrides,
  };
}

// Devolve o estado com todas as unidades prontas para agir de novo, sem passar por endRound
// (que somaria o +1 de round e embaralharia a asserção sobre o +2).
function novoTurno(state: BattleState): BattleState {
  return { ...state, units: state.units.map((u) => ({ ...u, hasActedThisRound: false })), distanceMovedThisTurn: {} };
}

describe('§5.6 — +2 Valor ao capturar objetivo', () => {
  it('encerrar o turno sobre um `fort` rende +2 Valor', () => {
    const state = buildState([buildUnit({ pos: { x: 0, y: 0 } })]);
    const outcome = applyCommand(state, { t: 'wait', unitId: 'u1' });

    expect(outcome.applied).toBe(true);
    expect(outcome.state.valor).toBe(7);
  });

  it('`camp` também é objetivo', () => {
    const state = buildState([buildUnit({ pos: { x: 3, y: 3 } })]);
    expect(applyCommand(state, { t: 'wait', unitId: 'u1' }).state.valor).toBe(7);
  });

  it('capturar dois objetivos diferentes rende +2 cada', () => {
    const a = buildUnit({ unitId: 'u1', pos: { x: 0, y: 0 } });
    const b = buildUnit({ unitId: 'u2', pos: { x: 3, y: 3 } });
    let state = buildState([a, b]);

    state = applyCommand(state, { t: 'wait', unitId: 'u1' }).state;
    state = applyCommand(state, { t: 'wait', unitId: 'u2' }).state;

    expect(state.valor).toBe(9);
  });

  it('o mesmo tile só paga uma vez por batalha, mesmo em rounds diferentes', () => {
    let state = buildState([buildUnit({ pos: { x: 0, y: 0 } })]);
    state = applyCommand(state, { t: 'wait', unitId: 'u1' }).state;
    expect(state.valor).toBe(7);

    state = novoTurno(state);
    state = applyCommand(state, { t: 'wait', unitId: 'u1' }).state;
    expect(state.valor).toBe(7);
  });

  it('o mesmo tile só paga uma vez mesmo trocando de unidade em cima dele', () => {
    const a = buildUnit({ unitId: 'u1', pos: { x: 0, y: 0 } });
    const b = buildUnit({ unitId: 'u2', pos: { x: 1, y: 0 } });
    let state = buildState([a, b]);

    state = applyCommand(state, { t: 'wait', unitId: 'u1' }).state;
    expect(state.valor).toBe(7);

    // u1 sai, u2 entra no mesmo fort e encerra o turno lá.
    state = novoTurno(state);
    state = applyCommand(state, { t: 'move', unitId: 'u1', path: [{ x: 0, y: 0 }, { x: 0, y: 1 }] }).state;
    state = applyCommand(state, { t: 'move', unitId: 'u2', path: [{ x: 1, y: 0 }, { x: 0, y: 0 }] }).state;
    state = applyCommand(state, { t: 'wait', unitId: 'u2' }).state;

    expect(state.valor).toBe(7);
  });

  it('inimigo sobre objetivo não gera Valor: o recurso é do exército do jogador (§5.6)', () => {
    const state = buildState([buildUnit({ unitId: 'e1', side: 'enemy', pos: { x: 0, y: 0 } })]);
    expect(applyCommand(state, { t: 'wait', unitId: 'e1' }).state.valor).toBe(5);
  });

  it('pisar no objetivo sem encerrar o turno não captura — captura é ficar, não passar', () => {
    const state = buildState([buildUnit({ pos: { x: 1, y: 0 } })]);
    const outcome = applyCommand(state, { t: 'move', unitId: 'u1', path: [{ x: 1, y: 0 }, { x: 0, y: 0 }] });

    expect(outcome.applied).toBe(true);
    expect(outcome.state.valor).toBe(5);
  });

  it('mover e ENTÃO encerrar o turno no objetivo captura', () => {
    let state = buildState([buildUnit({ pos: { x: 1, y: 0 } })]);
    state = applyCommand(state, { t: 'move', unitId: 'u1', path: [{ x: 1, y: 0 }, { x: 0, y: 0 }] }).state;
    state = applyCommand(state, { t: 'wait', unitId: 'u1' }).state;

    expect(state.valor).toBe(7);
  });

  it('`rest` também encerra o turno, então também captura', () => {
    const state = buildState([buildUnit({ pos: { x: 0, y: 0 } })]);
    expect(applyCommand(state, { t: 'rest', unitId: 'u1' }).state.valor).toBe(7);
  });

  it('tile sem objeto não é objetivo', () => {
    const state = buildState([buildUnit({ pos: { x: 2, y: 2 } })]);
    expect(applyCommand(state, { t: 'wait', unitId: 'u1' }).state.valor).toBe(5);
  });

  it('o +2 é somado ao +1 por round de §5.6, não no lugar dele', () => {
    let state = buildState([buildUnit({ pos: { x: 0, y: 0 } })]);
    state = applyCommand(state, { t: 'wait', unitId: 'u1' }).state;
    state = endRound(state);

    expect(state.valor).toBe(8);
  });

  it('a captura fica registrada no estado, para o cliente poder desenhá-la', () => {
    const state = buildState([buildUnit({ pos: { x: 0, y: 0 } })]);
    const outcome = applyCommand(state, { t: 'wait', unitId: 'u1' });
    expect(outcome.state.capturedObjectives).toEqual(['0,0']);
  });
});
