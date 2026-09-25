import { describe, expect, it } from 'vitest';
import { resolveAiTurnsLogged } from '../../src/battle/aiTurn.js';
import { applyCommand } from '../../src/battle/commands.js';
import { advanceWithoutAi, applyCommandAndAdvance, buildInitialState } from '../../src/battle/simulate.js';
import type { BattleCommand, BattleSetup, BattleState, BattleUnit, MapAiArchetype } from '../../src/battle/types.js';
import { hashState } from '../../src/determinism/hash.js';
import type { GridMap, Terrain } from '../../src/grid/types.js';
import type { SkillDef } from '../../src/skills/types.js';
import type { StatSheet } from '../../src/stats/types.js';

// M36, sub-sessão 1/N — "avançar" e "a IA" deixam de ser a mesma função.
//
// **Por que isto existe.** D47 põe a batalha VIVA no servidor: o cliente manda um comando por
// rota, o servidor aplica, resolve o turno da IA como um passo com log e devolve só o visível.
// Para isso o servidor precisa das duas metades separadas — aplicar o comando do jogador e
// fechar o round é uma coisa, deixar a IA jogar é outra, e elas viajam de volta em momentos
// diferentes. Até aqui `applyCommandAndAdvance` fazia as duas numa chamada só (`simulate.ts`),
// e não havia como pedir a primeira sem a segunda.
//
// **Nenhuma regra muda, e este arquivo existe para provar isso.** A asserção central não é
// sobre o que `advanceWithoutAi` faz sozinho: é que `advanceWithoutAi` seguido de
// `resolveAiTurnsLogged` é EXATAMENTE `applyCommandAndAdvance`, campo a campo e por hash de
// estado. `RULES_VERSION` não sobe; se este arquivo precisar de um valor congelado novo para
// passar, a refatoração deixou de ser refatoração.

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

// Mesmo truque de `aiTurnLog.test.ts`: `buildInitialState` já drena a IA, então o estado nasce
// sem arquétipo e ele é declarado depois — é o jeito de ter uma unidade de IA PENDENTE na mão,
// que é a única situação em que a diferença entre as duas funções aparece.
function comIaPendente(pos: { x: number; y: number }, archetype: MapAiArchetype = 'aggressive'): BattleState {
  const humano = buildUnit({ unitId: 'atk', side: 'player', hp: 4000, stats: statSheet({ hp: 4000, def: 0 }) });
  const ia = buildUnit({ unitId: 'def', side: 'enemy', pos });
  const base = buildInitialState(buildSetup([humano, ia]), 1);
  return { ...base, units: base.units.map((u) => (u.unitId === 'def' ? { ...u, aiArchetype: archetype } : u)) };
}

describe('M36 1/N — `advanceWithoutAi` avança o comando do jogador e PARA antes da IA', () => {
  it('a IA pendente não age: a peça fica exatamente onde estava', () => {
    const state = comIaPendente({ x: 4, y: 4 });
    const antes = state.units.find((u) => u.unitId === 'def')!;

    const avancado = advanceWithoutAi(state, { t: 'wait', unitId: 'atk' });

    expect(avancado.applied).toBe(true);
    const depois = avancado.state.units.find((u) => u.unitId === 'def')!;
    expect(depois.pos).toEqual(antes.pos);
    expect(depois.hasActedThisRound).toBe(false);
  });

  it('e a mesma entrada por `applyCommandAndAdvance` MOVE a peça — o teste não é vacuamente verdadeiro', () => {
    const state = comIaPendente({ x: 4, y: 4 });
    const antes = state.units.find((u) => u.unitId === 'def')!;

    const completo = applyCommandAndAdvance(state, { t: 'wait', unitId: 'atk' });

    expect(completo.aiSteps.length).toBeGreaterThan(0);
    expect(completo.state.units.find((u) => u.unitId === 'def')!.pos).not.toEqual(antes.pos);
  });

  it('avança de verdade: fecha o round quando todo mundo agiu, e não é só `applyCommand`', () => {
    // Duas unidades humanas, nenhuma IA: depois do segundo `wait` o round precisa virar.
    const a = buildUnit({ unitId: 'a', side: 'player' });
    const b = buildUnit({ unitId: 'b', side: 'enemy', pos: { x: 4, y: 4 } });
    const inicial = buildInitialState(buildSetup([a, b]), 1);

    const primeiro = advanceWithoutAi(inicial, { t: 'wait', unitId: inicial.initiativeOrder[0]!.unitId });
    const segundo = advanceWithoutAi(primeiro.state, { t: 'wait', unitId: inicial.initiativeOrder[1]!.unitId });

    expect(segundo.state.round).toBe(inicial.round + 1);
    expect(segundo.state.units.every((u) => !u.hasActedThisRound)).toBe(true);

    // `applyCommand` cru NÃO faria isso — é o que distingue "avançar" de "aplicar".
    const cru = applyCommand(primeiro.state, { t: 'wait', unitId: inicial.initiativeOrder[1]!.unitId });
    expect(cru.state.round).toBe(inicial.round);
  });

  it('marca o desfecho quando a condição de vitória cai, sem depender da IA para isso', () => {
    // Inimigo com 1 de HP e sem arquétipo: o engate mata, `rout` fecha a batalha.
    const humano = buildUnit({ unitId: 'atk', side: 'player', stats: statSheet({ atk: 5000 }) });
    const fragil = buildUnit({
      unitId: 'def',
      side: 'enemy',
      pos: { x: 1, y: 0 },
      hp: 1,
      stats: statSheet({ hp: 1, def: 0 }),
    });
    const inicial = buildInitialState(buildSetup([humano, fragil]), 1);

    const avancado = advanceWithoutAi(inicial, { t: 'engage', unitId: 'atk', targetId: 'def' });

    expect(avancado.applied).toBe(true);
    expect(avancado.duelResult).toBeDefined();
    expect(avancado.state.outcome).toBe('victory');
  });

  it('recusa comando inválido com o mesmo motivo que `applyCommandAndAdvance`, e não mexe no estado', () => {
    const state = comIaPendente({ x: 4, y: 4 });
    const invalido: BattleCommand = { t: 'engage', unitId: 'atk', targetId: 'def' }; // longe demais

    const avancado = advanceWithoutAi(state, invalido);
    const completo = applyCommandAndAdvance(state, invalido);

    expect(avancado.applied).toBe(false);
    expect(avancado.reason).toBe(completo.reason);
    expect(avancado.state).toBe(state);
  });

  it('recusa com a batalha terminada, como `applyCommandAndAdvance`', () => {
    const state = { ...comIaPendente({ x: 4, y: 4 }), outcome: 'victory' as const };

    const avancado = advanceWithoutAi(state, { t: 'wait', unitId: 'atk' });
    const completo = applyCommandAndAdvance(state, { t: 'wait', unitId: 'atk' });

    expect(avancado.applied).toBe(false);
    expect(avancado.reason).toBe(completo.reason);
    expect(avancado.state).toBe(state);
  });

  it('é puro: avançar não muta o `BattleState` recebido', () => {
    const state = comIaPendente({ x: 3, y: 0 });
    const congelado = structuredClone(state);
    advanceWithoutAi(state, { t: 'wait', unitId: 'atk' });
    expect(state).toEqual(congelado);
  });
});

describe('M36 1/N — a refatoração não muda regra nenhuma', () => {
  // A bateria: comandos de tipos diferentes contra uma IA pendente, cada um a partir de um
  // estado montado do zero. Uma lista, não um caso — a igualdade tem de valer para todo
  // comando que o servidor vai aceitar, e não só para o que era conveniente escrever.
  const bateria: readonly { readonly nome: string; readonly ia: { x: number; y: number }; readonly command: BattleCommand }[] =
    [
      { nome: 'wait com a IA longe', ia: { x: 4, y: 4 }, command: { t: 'wait', unitId: 'atk' } },
      { nome: 'wait com a IA colada (ela engaja em seguida)', ia: { x: 1, y: 0 }, command: { t: 'wait', unitId: 'atk' } },
      { nome: 'rest', ia: { x: 4, y: 4 }, command: { t: 'rest', unitId: 'atk' } },
      {
        nome: 'move',
        ia: { x: 4, y: 4 },
        command: {
          t: 'move',
          unitId: 'atk',
          path: [
            { x: 0, y: 0 },
            { x: 1, y: 0 },
            { x: 2, y: 0 },
          ],
        },
      },
      { nome: 'engage', ia: { x: 1, y: 0 }, command: { t: 'engage', unitId: 'atk', targetId: 'def' } },
      { nome: 'comando recusado', ia: { x: 4, y: 4 }, command: { t: 'engage', unitId: 'atk', targetId: 'def' } },
    ];

  for (const caso of bateria) {
    it(`advanceWithoutAi + resolveAiTurnsLogged === applyCommandAndAdvance (${caso.nome})`, () => {
      const state = comIaPendente(caso.ia);

      const completo = applyCommandAndAdvance(state, caso.command);

      const avancado = advanceWithoutAi(state, caso.command);
      const ia = avancado.applied ? resolveAiTurnsLogged(avancado.state) : { state: avancado.state, steps: [] };

      expect(avancado.applied).toBe(completo.applied);
      expect(avancado.reason).toBe(completo.reason);
      expect(avancado.duelResult).toEqual(completo.duelResult);
      expect(ia.steps).toEqual(completo.aiSteps);
      expect(ia.state).toEqual(completo.state);
      // Por hash, não só por igualdade estrutural: é a mesma moeda com que o determinismo do
      // projeto é medido em `crossRuntime.test.ts`.
      expect(hashState(ia.state)).toBe(hashState(completo.state));
    });
  }

  it('uma batalha INTEIRA jogada pelo caminho partido termina no mesmo hash da jogada pelo caminho de hoje', () => {
    const comandos: readonly BattleCommand[] = [
      {
        t: 'move',
        unitId: 'atk',
        path: [
          { x: 0, y: 0 },
          { x: 1, y: 0 },
        ],
      },
      { t: 'wait', unitId: 'atk' },
      { t: 'rest', unitId: 'atk' },
      { t: 'wait', unitId: 'atk' },
    ];

    let deHoje = comIaPendente({ x: 3, y: 0 });
    for (const command of comandos) {
      if (deHoje.outcome !== 'ongoing') break;
      deHoje = applyCommandAndAdvance(deHoje, command).state;
    }

    let partido = comIaPendente({ x: 3, y: 0 });
    for (const command of comandos) {
      if (partido.outcome !== 'ongoing') break;
      const avancado = advanceWithoutAi(partido, command);
      partido = avancado.applied ? resolveAiTurnsLogged(avancado.state).state : avancado.state;
    }

    expect(hashState(partido)).toBe(hashState(deHoje));
  });
});
