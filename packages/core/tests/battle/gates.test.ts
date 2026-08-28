import { describe, expect, it } from 'vitest';
import { applyCommand } from '../../src/battle/commands.js';
import { computeInitiativeOrder } from '../../src/battle/initiative.js';
import { isGateOpen, openGateCoords } from '../../src/battle/gates.js';
import type { BattleState, BattleUnit } from '../../src/battle/types.js';
import type { GridMap, Terrain, Tile } from '../../src/grid/types.js';
import type { SkillDef } from '../../src/skills/types.js';
import type { StatSheet } from '../../src/stats/types.js';

// §5.1 `Tile.object === 'gate'` + M15 D3, com o requisito que o usuário acrescentou na
// aprovação do plano: o portão **abre por um lado e quebra pelo outro**. Quem o tile declara
// em `gate.opensFor` encerra o turno com `wait` ao lado dele e o abre; quem não é declarado
// bate nele, e o portão cai depois de `gate.durability` turnos-unidade.
//
// Por que `wait` e não uma ação nova: §5.4 lista quatro ações (`engage`, `mapSkill`, `rest`,
// `wait`) e o `wait` JÁ é condicional ao tile ("+1 AP se terminar sobre fort ou camp"). Por
// que durabilidade em turnos e não HP com fórmula de dano: quebrar um portão não passa por
// `computeDamage`, não rola RNG e não entra na matriz de `pnpm balance` — "3 turnos-unidade
// para arrombar" é um número que o autor de fase controla direto (ver DECISIONS.md, M15 1/N).

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

// Mapa 3x3 com um portão no centro; `gateAt` recebe a definição do portão do teste.
function buildMap(gate: Tile['gate']): GridMap {
  const tiles = Array.from({ length: 3 }, (_unused, y) =>
    Array.from({ length: 3 }, (_unused2, x): Tile =>
      x === 1 && y === 1 ? { terrain: 'plain', height: 0, object: 'gate', ...(gate ? { gate } : {}) } : { terrain: 'plain', height: 0 },
    ),
  );
  return { width: 3, height: 3, tiles, terrains: { plain }, zocEnabled: false };
}

function buildUnit(overrides: Partial<BattleUnit> = {}): BattleUnit {
  return {
    unitId: 'u1', heroId: 'h1', side: 'player',
    pos: { x: 1, y: 0 }, height: 0,
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

function buildState(units: readonly BattleUnit[], gate: Tile['gate'], overrides: Partial<BattleState> = {}): BattleState {
  return {
    map: buildMap(gate),
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

const GATE: { x: number; y: number } = { x: 1, y: 1 };

describe('portão — abrir pelo lado declarado (§5.4 `wait`, M15 D3)', () => {
  it('a unidade do lado que abre encerra o turno adjacente e o portão abre', () => {
    const state = buildState([buildUnit()], { opensFor: 'player', durability: 3 });
    const outcome = applyCommand(state, { t: 'wait', unitId: 'u1' });

    expect(outcome.applied).toBe(true);
    expect(isGateOpen(outcome.state, GATE)).toBe(true);
    expect(outcome.state.units[0]?.hasActedThisRound).toBe(true);
  });

  it('abrir é imediato e ignora a durabilidade: quem tem a chave não precisa arrombar', () => {
    const state = buildState([buildUnit()], { opensFor: 'player', durability: 99 });
    const outcome = applyCommand(state, { t: 'wait', unitId: 'u1' });
    expect(isGateOpen(outcome.state, GATE)).toBe(true);
  });

  it('`opensFor: "any"` abre para os dois lados', () => {
    const inimigo = buildUnit({ unitId: 'e1', side: 'enemy' });
    const state = buildState([inimigo], { opensFor: 'any', durability: 3 });
    expect(isGateOpen(applyCommand(state, { t: 'wait', unitId: 'e1' }).state, GATE)).toBe(true);
  });

  it('portão sem declaração no tile abre para qualquer um em um turno (o caso simples)', () => {
    const state = buildState([buildUnit()], undefined);
    expect(isGateOpen(applyCommand(state, { t: 'wait', unitId: 'u1' }).state, GATE)).toBe(true);
  });
});

describe('portão — quebrar pelo lado travado (requisito do usuário, M15 1/N)', () => {
  it('o lado travado não abre: bate no portão e a durabilidade cai de 1', () => {
    const inimigo = buildUnit({ unitId: 'e1', side: 'enemy' });
    const state = buildState([inimigo], { opensFor: 'player', durability: 3 });
    const outcome = applyCommand(state, { t: 'wait', unitId: 'e1' });

    expect(outcome.applied).toBe(true);
    expect(isGateOpen(outcome.state, GATE)).toBe(false);
    expect(outcome.state.gateState?.['1,1']?.hits).toBe(1);
  });

  it('acumula entre turnos e cai quando os golpes atingem a durabilidade', () => {
    const inimigo = buildUnit({ unitId: 'e1', side: 'enemy' });
    let state = buildState([inimigo], { opensFor: 'player', durability: 3 });

    for (let turno = 0; turno < 3; turno++) {
      state = applyCommand(state, { t: 'wait', unitId: 'e1' }).state;
      // Novo turno: o round vira e a unidade pode agir de novo.
      state = { ...state, units: state.units.map((u) => ({ ...u, hasActedThisRound: false })) };
      if (turno < 2) expect(isGateOpen(state, GATE)).toBe(false);
    }

    expect(isGateOpen(state, GATE)).toBe(true);
  });

  it('duas unidades diferentes somam os golpes no mesmo portão', () => {
    const a = buildUnit({ unitId: 'e1', side: 'enemy', pos: { x: 1, y: 0 } });
    const b = buildUnit({ unitId: 'e2', side: 'enemy', pos: { x: 0, y: 1 } });
    let state = buildState([a, b], { opensFor: 'player', durability: 2 });

    state = applyCommand(state, { t: 'wait', unitId: 'e1' }).state;
    expect(isGateOpen(state, GATE)).toBe(false);
    state = applyCommand(state, { t: 'wait', unitId: 'e2' }).state;
    expect(isGateOpen(state, GATE)).toBe(true);
  });

  it('`opensFor: "none"` é o portão trancado: nem o lado de dentro abre, só arromba', () => {
    // Existe porque a alternativa se mostrou degenerada em conteúdo (M15 2/N): com um lado
    // dono da chave, a IA de mapa daquele lado anda até o portão e o `wait` do mesmo turno o
    // abre — a fortaleza destrancava no round 1.
    for (const side of ['player', 'enemy'] as const) {
      const unidade = buildUnit({ unitId: `u-${side}`, side });
      const state = buildState([unidade], { opensFor: 'none', durability: 2 });
      const depoisDeUm = applyCommand(state, { t: 'wait', unitId: unidade.unitId }).state;

      expect(isGateOpen(depoisDeUm, GATE)).toBe(false);
      expect(depoisDeUm.gateState?.['1,1']?.hits).toBe(1);

      const proximoTurno = { ...depoisDeUm, units: depoisDeUm.units.map((u) => ({ ...u, hasActedThisRound: false })) };
      expect(isGateOpen(applyCommand(proximoTurno, { t: 'wait', unitId: unidade.unitId }).state, GATE)).toBe(true);
    }
  });

  it('um portão já aberto não volta a acumular golpes', () => {
    const inimigo = buildUnit({ unitId: 'e1', side: 'enemy' });
    let state = buildState([inimigo], { opensFor: 'any', durability: 3 });
    state = applyCommand(state, { t: 'wait', unitId: 'e1' }).state;
    state = { ...state, units: state.units.map((u) => ({ ...u, hasActedThisRound: false })) };
    state = applyCommand(state, { t: 'wait', unitId: 'e1' }).state;

    expect(isGateOpen(state, GATE)).toBe(true);
    expect(state.gateState?.['1,1']?.hits).toBe(0);
  });
});

describe('portão — o que NÃO muda', () => {
  it('adjacência é ortogonal: na diagonal não alcança (§5.1 — distância Manhattan)', () => {
    const state = buildState([buildUnit({ pos: { x: 0, y: 0 } })], { opensFor: 'any', durability: 1 });
    expect(isGateOpen(applyCommand(state, { t: 'wait', unitId: 'u1' }).state, GATE)).toBe(false);
  });

  it('mover para perto do portão sem encerrar o turno não o abre', () => {
    const state = buildState([buildUnit({ pos: { x: 0, y: 0 } })], { opensFor: 'any', durability: 1 });
    const outcome = applyCommand(state, { t: 'move', unitId: 'u1', path: [{ x: 0, y: 0 }, { x: 1, y: 0 }] });
    expect(outcome.applied).toBe(true);
    expect(isGateOpen(outcome.state, GATE)).toBe(false);
  });

  it('`wait` sobre fort continua dando +1 AP: a regra de M3 não mudou', () => {
    const fortMap = buildMap(undefined);
    const comFort: GridMap = {
      ...fortMap,
      tiles: fortMap.tiles.map((row, y) => row.map((tile, x) => (x === 0 && y === 0 ? { ...tile, object: 'fort' as const } : tile))),
    };
    const state = buildState([buildUnit({ pos: { x: 0, y: 0 } })], undefined, { map: comFort });
    const outcome = applyCommand(state, { t: 'wait', unitId: 'u1' });
    expect(outcome.state.units[0]?.ap).toBe(4);
  });

  it('`openGateCoords` devolve só os abertos, para o pathfinding e para o cliente desenharem o mesmo mapa', () => {
    const state = buildState([buildUnit()], { opensFor: 'player', durability: 3 });
    expect(openGateCoords(state)).toEqual([]);
    const aberto = applyCommand(state, { t: 'wait', unitId: 'u1' }).state;
    expect(openGateCoords(aberto)).toEqual([GATE]);
  });

  it('portão fechado bloqueia o movimento pelo comando `move`, aberto deixa passar', () => {
    const state = buildState([buildUnit({ pos: { x: 1, y: 0 } })], { opensFor: 'player', durability: 3 });
    const atravessar = { t: 'move' as const, unitId: 'u1', path: [{ x: 1, y: 0 }, GATE, { x: 1, y: 2 }] };

    expect(applyCommand(state, atravessar).applied).toBe(false);

    const aberto = applyCommand(state, { t: 'wait', unitId: 'u1' }).state;
    const proximoTurno = { ...aberto, units: aberto.units.map((u) => ({ ...u, hasActedThisRound: false })) };
    const passou = applyCommand(proximoTurno, atravessar);
    expect(passou.applied).toBe(true);
    expect(passou.state.units[0]?.pos).toEqual({ x: 1, y: 2 });
  });
});
