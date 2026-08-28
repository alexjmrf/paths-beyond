import { describe, expect, it } from 'vitest';
import { resolveAiTurns, resolveAiTurnsLogged } from '../../src/battle/aiTurn.js';
import { applyCommand } from '../../src/battle/commands.js';
import { applyCommandAndAdvance, buildInitialState, buildInitialStateLogged, simulate } from '../../src/battle/simulate.js';
import type { BattleSetup, BattleState, BattleUnit, MapAiArchetype } from '../../src/battle/types.js';
import type { Coord, GridMap, Terrain } from '../../src/grid/types.js';
import { RULES_VERSION } from '../../src/rulesVersion.js';
import type { SkillDef } from '../../src/skills/types.js';
import type { StatSheet } from '../../src/stats/types.js';

// M16, sub-sessão 4/N — o relato do turno da IA.
//
// Até esta fatia `resolveAiTurns` drenava o turno inteiro por dentro e devolvia só o estado
// final: o cliente via os inimigos TELEPORTAREM, porque os comandos que a IA aplicou — os
// caminhos andados e os duelos que ela abriu — eram descartados no caminho. `aiSteps` é o
// relato desses comandos, e nada além disso: nenhuma regra muda, nenhum estado muda,
// `RULES_VERSION` não sobe. As duas alternativas que dispensariam esta adição foram medidas e
// recusadas (ver DECISIONS.md, M16 4/N): diffar dois estados no cliente faria a animação
// INFERIR o caminho em vez de relatá-lo, e reexecutar o laço da IA no cliente duplicaria lá a
// lógica que M7 6/N centralizou aqui justamente para cliente e servidor não divergirem.

const plain: Terrain = {
  id: 'plain',
  moveCost: { foot: 1, cavalry: 1, flying: 1, heavy: 1, aquatic: 2 },
  defBonus: 0,
  evaBonus: 0,
  blocksSight: false,
};

function buildMap(): GridMap {
  const tiles = Array.from({ length: 5 }, () => Array.from({ length: 5 }, () => ({ terrain: 'plain', height: 0 as const })));
  return { width: 5, height: 5, tiles, terrains: { plain }, zocEnabled: false };
}

function statSheet(overrides: Partial<StatSheet> = {}): StatSheet {
  return {
    hp: 5000,
    atk: 1000,
    def: 300,
    spd: 100,
    chc: 100,
    chd: 1500,
    eff: 0,
    efr: 0,
    pen: 0,
    heal: 0,
    lifesteal: 0,
    focus: 0,
    vigor: 0,
    ...overrides,
  };
}

const strike: SkillDef = {
  id: 'skill-strike',
  name: 'Golpe',
  kind: 'duel',
  apCost: 1,
  cooldown: 0,
  multiplier: 1500,
  flat: 100,
  scalesWith: 'atk',
  effects: [],
  tags: ['physical'],
};

function buildUnit(overrides: Partial<BattleUnit> = {}): BattleUnit {
  return {
    unitId: 'u1',
    heroId: 'h1',
    side: 'player',
    pos: { x: 0, y: 0 },
    height: 0,
    hp: 5000,
    ap: 3,
    pp: 2,
    hasActedThisRound: false,
    effects: [],
    cooldowns: {},
    stats: statSheet(),
    unitType: 'infantry',
    weaponType: 'sword',
    duelRange: 1,
    assistRange: 2,
    moveType: 'foot',
    moveRange: 4,
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

// `buildInitialState` DRENA a IA na hora, então um estado montado já com arquétipo vem com o
// turno resolvido e não sobra nada para observar. Aqui o estado nasce SEM IA (sem `aiArchetype`
// nada é resolvido sozinho — provado em `aiTurn.test.ts`) e o arquétipo é declarado depois: é o
// jeito de ter uma unidade de IA pendente na mão.
function comIaPendente(pos: Coord, archetype: MapAiArchetype, humanPos: Coord = { x: 0, y: 0 }): BattleState {
  const human = buildUnit({
    unitId: 'atk',
    side: 'player',
    pos: humanPos,
    hp: 4000,
    stats: statSheet({ hp: 4000, def: 0 }),
  });
  const ai = buildUnit({ unitId: 'def', side: 'enemy', pos });
  const base = buildInitialState(buildSetup([human, ai]), 1);
  return { ...base, units: base.units.map((u) => (u.unitId === 'def' ? { ...u, aiArchetype: archetype } : u)) };
}

describe('M16, sub-sessão 4/N — `resolveAiTurnsLogged` relata o que a IA fez', () => {
  it('o relato não muda uma regra (D4): `resolveAiTurns` devolve exatamente o estado de `resolveAiTurnsLogged`', () => {
    const state = comIaPendente({ x: 4, y: 4 }, 'aggressive');
    expect(resolveAiTurns(state)).toEqual(resolveAiTurnsLogged(state).state);
  });

  it('um `move` da IA vem com o caminho INTEIRO, e o `stateBefore` põe a peça na origem dele', () => {
    const { steps } = resolveAiTurnsLogged(comIaPendente({ x: 4, y: 4 }, 'aggressive'));
    const passo = steps.find((s) => s.command.t === 'move');
    expect(passo).toBeDefined();

    const command = passo!.command;
    if (command.t !== 'move') throw new Error('esperava um move');
    expect(command.path.length).toBeGreaterThan(1);
    expect(passo!.stateBefore.units.find((u) => u.unitId === 'def')?.pos).toEqual(command.path[0]);

    // Cada tile do caminho é vizinho ortogonal do anterior: é o caminho ANDADO, e não a reta
    // entre origem e destino que um diff de dois estados só teria como supor. É a razão de o
    // relato existir — a animação dobra as esquinas que a IA dobrou.
    for (let i = 1; i < command.path.length; i++) {
      const a = command.path[i - 1]!;
      const b = command.path[i]!;
      expect(Math.abs(b.x - a.x) + Math.abs(b.y - a.y)).toBe(1);
    }
  });

  it('um `engage` da IA vem com o `duelResult` — o cliente não tem outra fonte para o que houve no duelo', () => {
    const { steps } = resolveAiTurnsLogged(comIaPendente({ x: 1, y: 0 }, 'aggressive'));
    const passo = steps.find((s) => s.command.t === 'engage');
    expect(passo).toBeDefined();
    expect(passo!.duelResult).toBeDefined();
    expect(passo!.duelResult!.attackerId).toBe('def');
    expect(passo!.duelResult!.defenderId).toBe('atk');
    expect(passo!.duelResult!.trocas.length).toBeGreaterThan(0);
  });

  it('uma IA que anda E ENGAJA no mesmo turno produz dois passos, nessa ordem', () => {
    const { steps } = resolveAiTurnsLogged(comIaPendente({ x: 3, y: 0 }, 'aggressive'));
    expect(steps.map((s) => s.command.t)).toEqual(['move', 'engage']);

    // O `stateBefore` do engate já traz a peça no destino do movimento: os passos encadeiam, e
    // é isso que permite animá-los em sequência sem o cliente reaplicar comando nenhum.
    const move = steps[0]!.command;
    if (move.t !== 'move') throw new Error('esperava um move');
    expect(steps[1]!.stateBefore.units.find((u) => u.unitId === 'def')?.pos).toEqual(move.path[move.path.length - 1]);
  });

  it('todo comando relatado é um comando que o motor ACEITOU — o log não inventa jogada', () => {
    const { steps } = resolveAiTurnsLogged(comIaPendente({ x: 3, y: 0 }, 'aggressive'));
    expect(steps.length).toBeGreaterThan(0);
    for (const passo of steps) {
      expect(applyCommand(passo.stateBefore, passo.command).applied).toBe(true);
    }
  });

  it('sem unidade de IA pendente, `steps` é uma lista VAZIA e não `undefined`', () => {
    const human = buildUnit({ unitId: 'atk', side: 'player' });
    const outro = buildUnit({ unitId: 'atk2', side: 'player', pos: { x: 1, y: 0 } });
    const state = buildInitialState(buildSetup([human, outro]), 1);
    expect(resolveAiTurnsLogged(state).steps).toEqual([]);
  });

  it('é determinístico: a mesma entrada produz o mesmo relato duas vezes', () => {
    const state = comIaPendente({ x: 3, y: 0 }, 'aggressive');
    const a = JSON.stringify(resolveAiTurnsLogged(state).steps);
    const b = JSON.stringify(resolveAiTurnsLogged(state).steps);
    expect(a).toBe(b);
  });

  it('é puro: relatar não muta o `BattleState` recebido', () => {
    const state = comIaPendente({ x: 3, y: 0 }, 'aggressive');
    const frozen = structuredClone(state);
    resolveAiTurnsLogged(state);
    expect(state).toEqual(frozen);
  });
});

describe('M16, sub-sessão 4/N — `applyCommandAndAdvance` expõe `aiSteps`', () => {
  function cenario(): BattleState {
    const human = buildUnit({ unitId: 'atk', side: 'player', pos: { x: 0, y: 0 } });
    const ai = buildUnit({ unitId: 'def', side: 'enemy', pos: { x: 4, y: 4 }, aiArchetype: 'aggressive' });
    return buildInitialState(buildSetup([human, ai]), 1);
  }

  it('o turno de IA que vem depois do comando do jogador chega ao chamador como relato', () => {
    // O primeiro turno da IA já foi drenado por `buildInitialState`; o `wait` do humano fecha o
    // round, e o turno de IA do round seguinte é justamente o que o cliente precisa animar.
    const result = applyCommandAndAdvance(cenario(), { t: 'wait', unitId: 'atk' });

    expect(result.applied).toBe(true);
    expect(result.aiSteps.length).toBeGreaterThan(0);
    expect(result.aiSteps.every((s) => 'unitId' in s.command && s.command.unitId === 'def')).toBe(true);
  });

  it('comando recusado não relata turno de IA nenhum', () => {
    const result = applyCommandAndAdvance(cenario(), { t: 'wait', unitId: 'nao-existe' });
    expect(result.applied).toBe(false);
    expect(result.aiSteps).toEqual([]);
  });

  it('batalha já terminada não relata turno de IA nenhum', () => {
    const result = applyCommandAndAdvance({ ...cenario(), outcome: 'victory' }, { t: 'wait', unitId: 'atk' });
    expect(result.applied).toBe(false);
    expect(result.aiSteps).toEqual([]);
  });

  it('`simulate` continua dando o mesmo resultado: o relato é aditivo, não é uma decisão nova', () => {
    const human = buildUnit({ unitId: 'atk', side: 'player', pos: { x: 0, y: 0 } });
    const ai = buildUnit({ unitId: 'def', side: 'enemy', pos: { x: 4, y: 4 }, aiArchetype: 'aggressive' });
    const setup = buildSetup([human, ai]);
    const commands = [
      { t: 'wait' as const, unitId: 'atk' },
      { t: 'wait' as const, unitId: 'atk' },
    ];

    const a = simulate({ rulesVersion: RULES_VERSION, seed: 1, initialState: setup, commands });
    const b = simulate({ rulesVersion: RULES_VERSION, seed: 1, initialState: setup, commands });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    // A IA perseguiu e matou o humano nos dois rounds: `simulate` passa pelo mesmo laço de IA
    // que agora relata, e o desfecho é o que sempre foi.
    expect(a.outcome).toBe('defeat');
  });
});

describe('M16 4/N + P1.1 — `buildInitialStateLogged` relata o turno de IA do começo da batalha', () => {
  // O turno que `buildInitialState` drena ANTES do primeiro comando era o único da batalha sem
  // relato. Não é lacuna de animação (não há "antes" que o jogador tenha visto), mas é lacuna de
  // MEDIÇÃO: no torneio do `tools/balance` os dois lados são IA, então a batalha inteira acontece
  // aí dentro — sem este relato, nada fora do core consegue observar um duelo do torneio.

  it('o relato não muda uma regra: `buildInitialState` devolve exatamente o estado da variante com relato', () => {
    const human = buildUnit({ unitId: 'atk', side: 'player', pos: { x: 1, y: 0 } });
    const ai = buildUnit({ unitId: 'def', side: 'enemy', pos: { x: 0, y: 0 }, aiArchetype: 'aggressive' });
    const setup = buildSetup([human, ai]);

    expect(buildInitialState(setup, 7)).toEqual(buildInitialStateLogged(setup, 7).state);
  });

  it('relata o `engage` que a IA abre antes do primeiro comando, com o `duelResult` junto', () => {
    const human = buildUnit({ unitId: 'atk', side: 'player', pos: { x: 1, y: 0 }, hp: 4000, stats: statSheet({ hp: 4000, def: 0 }) });
    const ai = buildUnit({ unitId: 'def', side: 'enemy', pos: { x: 0, y: 0 }, aiArchetype: 'aggressive' });
    const { steps } = buildInitialStateLogged(buildSetup([human, ai]), 1);

    const engate = steps.find((s) => s.command.t === 'engage');
    expect(engate).toBeDefined();
    expect(engate!.duelResult).toBeDefined();
    // É por aqui que o torneio conta assistência: os dois campos existem no `DuelResult`.
    expect(Array.isArray(engate!.duelResult!.attackerAssists)).toBe(true);
    expect(Array.isArray(engate!.duelResult!.defenderAssists)).toBe(true);
  });

  it('sem nenhuma unidade de IA, o relato é uma lista vazia', () => {
    const a = buildUnit({ unitId: 'atk', side: 'player' });
    const b = buildUnit({ unitId: 'atk2', side: 'player', pos: { x: 1, y: 0 } });
    expect(buildInitialStateLogged(buildSetup([a, b]), 1).steps).toEqual([]);
  });

  it('é determinístico: a mesma seed produz o mesmo relato duas vezes', () => {
    const human = buildUnit({ unitId: 'atk', side: 'player', pos: { x: 1, y: 0 } });
    const ai = buildUnit({ unitId: 'def', side: 'enemy', pos: { x: 0, y: 0 }, aiArchetype: 'aggressive' });
    const setup = buildSetup([human, ai]);

    expect(JSON.stringify(buildInitialStateLogged(setup, 3).steps)).toBe(
      JSON.stringify(buildInitialStateLogged(setup, 3).steps),
    );
  });
});
