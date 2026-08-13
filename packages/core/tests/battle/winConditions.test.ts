import { describe, expect, it } from 'vitest';
import { computeInitiativeOrder } from '../../src/battle/initiative.js';
import { applyCommandAndAdvance, buildInitialState } from '../../src/battle/simulate.js';
import type { BattleSetup, BattleState, BattleUnit, WinCondition } from '../../src/battle/types.js';
import { checkWinCondition } from '../../src/battle/winCondition.js';
import type { GridMap, Terrain } from '../../src/grid/types.js';
import type { SkillDef } from '../../src/skills/types.js';
import type { StatSheet } from '../../src/stats/types.js';

// §5.7 (M11, sub-sessão 1/N) — "Data-driven por mapa: rout, seize, survive N rounds,
// escort, defend." Até aqui só `rout` tinha resolução: toda batalha era obrigatoriamente
// "mate todo mundo". A spec nomeia as cinco e não define nenhuma — as leituras abaixo
// foram decididas com o usuário e estão registradas em DECISIONS.md.

const plain: Terrain = { id: 'plain', moveCost: { foot: 1, cavalry: 1, flying: 1, heavy: 1, aquatic: 2 }, defBonus: 0, evaBonus: 0, blocksSight: false };

function buildMap(): GridMap {
  const tiles = Array.from({ length: 5 }, () => Array.from({ length: 5 }, () => ({ terrain: 'plain', height: 0 as const })));
  return { width: 5, height: 5, tiles, terrains: { plain }, zocEnabled: false };
}

function statSheet(overrides: Partial<StatSheet> = {}): StatSheet {
  return {
    hp: 5000, atk: 1000, def: 300, spd: 100, chc: 0, chd: 1500,
    eff: 0, efr: 0, pen: 0, heal: 0, lifesteal: 0, focus: 0, vigor: 0,
    ...overrides,
  };
}

const strike: SkillDef = {
  id: 'skill-strike', name: 'Golpe', kind: 'duel', apCost: 0, cooldown: 0,
  multiplier: 1200, flat: 0, scalesWith: 'atk', effects: [], tags: ['physical'],
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

function buildState(units: readonly BattleUnit[], winCondition: WinCondition, overrides: Partial<BattleState> = {}): BattleState {
  return {
    map: buildMap(),
    units,
    initiativeOrder: computeInitiativeOrder(units.map((u) => ({ id: u.unitId, spd: u.stats.spd })), 42),
    round: 1,
    valor: 5,
    distanceMovedThisTurn: {},
    freeAssistUsedThisRound: [],
    permadeath: 'classic',
    winCondition,
    effectDefs: {},
    outcome: 'ongoing',
    seed: 42,
    ...overrides,
  };
}

function buildSetup(units: readonly BattleUnit[], winCondition: WinCondition): BattleSetup {
  return { map: buildMap(), units, permadeath: 'classic', winCondition, effectDefs: {}, initialValor: 5 };
}

// Inimigo que não sai do lugar e não alcança ninguém: existe só para o round poder fechar
// (`isRoundComplete` exige TODAS as unidades vivas, e uma unidade sem `aiArchetype` nunca
// age sozinha) sem interferir na condição sob teste.
function passiveEnemy(pos = { x: 4, y: 4 }): BattleUnit {
  return buildUnit({ unitId: 'inimigo', side: 'enemy', pos, aiArchetype: 'hold-position' });
}

describe('derrota universal — sem unidade viva do jogador', () => {
  it('vale para qualquer condição, não só rout', () => {
    const conditions: WinCondition[] = [
      { t: 'rout' },
      { t: 'seize', target: { x: 2, y: 0 } },
      { t: 'surviveRounds', n: 3 },
      { t: 'escort', unitId: 'vip', target: { x: 2, y: 0 } },
      { t: 'defend', rounds: 3, target: { x: 2, y: 0 } },
    ];
    for (const condition of conditions) {
      const units = [buildUnit({ unitId: 'vip', hp: 0 }), passiveEnemy()];
      expect(checkWinCondition(buildState(units, condition))).toBe('defeat');
    }
  });
});

describe('rout — §5.7 (comportamento de M3, não pode regredir)', () => {
  it('vitória quando o time inimigo é eliminado', () => {
    const units = [buildUnit(), passiveEnemy()];
    expect(checkWinCondition(buildState(units, { t: 'rout' }))).toBe('ongoing');
    const dead = [buildUnit(), { ...passiveEnemy(), hp: 0 }];
    expect(checkWinCondition(buildState(dead, { t: 'rout' }))).toBe('victory');
  });

  it('eliminar o inimigo NÃO vence um mapa cuja condição é outra', () => {
    // "Data-driven por mapa" lido ao pé da letra: a condição declarada é a única via de
    // vitória. Decisão registrada em DECISIONS.md.
    const units = [buildUnit(), { ...passiveEnemy(), hp: 0 }];
    expect(checkWinCondition(buildState(units, { t: 'seize', target: { x: 2, y: 0 } }))).toBe('ongoing');
    expect(checkWinCondition(buildState(units, { t: 'surviveRounds', n: 3 }))).toBe('ongoing');
  });
});

describe('seize — qualquer unidade viva do jogador sobre o tile alvo', () => {
  const target = { x: 2, y: 0 };

  it('ongoing enquanto ninguém está no tile', () => {
    const units = [buildUnit({ pos: { x: 0, y: 0 } }), passiveEnemy()];
    expect(checkWinCondition(buildState(units, { t: 'seize', target }))).toBe('ongoing');
  });

  it('vitória com qualquer unidade do jogador sobre o tile', () => {
    const units = [buildUnit({ unitId: 'qualquer-um', pos: target }), passiveEnemy()];
    expect(checkWinCondition(buildState(units, { t: 'seize', target }))).toBe('victory');
  });

  it('unidade MORTA sobre o tile não captura', () => {
    const units = [buildUnit({ unitId: 'morto', pos: target, hp: 0 }), buildUnit({ unitId: 'vivo' }), passiveEnemy()];
    expect(checkWinCondition(buildState(units, { t: 'seize', target }))).toBe('ongoing');
  });

  it('unidade INIMIGA sobre o tile não captura para o jogador', () => {
    const units = [buildUnit(), passiveEnemy(target)];
    expect(checkWinCondition(buildState(units, { t: 'seize', target }))).toBe('ongoing');
  });

  it('batalha completa termina por seize: mover até o tile encerra a partida', () => {
    const setup = buildSetup([buildUnit({ unitId: 'heroi', pos: { x: 0, y: 0 } }), passiveEnemy()], { t: 'seize', target });
    const state = buildInitialState(setup, 42);
    expect(state.outcome).toBe('ongoing');

    const result = applyCommandAndAdvance(state, {
      t: 'move',
      unitId: 'heroi',
      path: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }],
    });
    expect(result.applied).toBe(true);
    expect(result.state.outcome).toBe('victory');
  });
});

describe('surviveRounds — sobreviver N rounds de mapa', () => {
  it('ongoing durante os N rounds e vitória no round seguinte', () => {
    const units = [buildUnit(), passiveEnemy()];
    expect(checkWinCondition(buildState(units, { t: 'surviveRounds', n: 2 }, { round: 1 }))).toBe('ongoing');
    expect(checkWinCondition(buildState(units, { t: 'surviveRounds', n: 2 }, { round: 2 }))).toBe('ongoing');
    // O round vira 3 quando o round 2 fecha: os 2 rounds foram sobrevividos.
    expect(checkWinCondition(buildState(units, { t: 'surviveRounds', n: 2 }, { round: 3 }))).toBe('victory');
  });

  it('batalha completa termina por surviveRounds: dois `wait` fecham dois rounds', () => {
    const setup = buildSetup([buildUnit({ unitId: 'heroi' }), passiveEnemy()], { t: 'surviveRounds', n: 2 });
    let state = buildInitialState(setup, 42);
    expect(state.round).toBe(1);

    state = applyCommandAndAdvance(state, { t: 'wait', unitId: 'heroi' }).state;
    expect(state.outcome).toBe('ongoing');
    state = applyCommandAndAdvance(state, { t: 'wait', unitId: 'heroi' }).state;
    expect(state.outcome).toBe('victory');
  });
});

describe('escort — a unidade nomeada chega ao alvo, e morrer é derrota', () => {
  const target = { x: 2, y: 0 };
  const condition: WinCondition = { t: 'escort', unitId: 'vip', target };

  it('ongoing enquanto o VIP está vivo e longe do alvo', () => {
    const units = [buildUnit({ unitId: 'vip' }), buildUnit({ unitId: 'escolta' }), passiveEnemy()];
    expect(checkWinCondition(buildState(units, condition))).toBe('ongoing');
  });

  it('outra unidade sobre o alvo NÃO vence — só o VIP conta', () => {
    const units = [buildUnit({ unitId: 'vip' }), buildUnit({ unitId: 'escolta', pos: target }), passiveEnemy()];
    expect(checkWinCondition(buildState(units, condition))).toBe('ongoing');
  });

  it('vitória com o VIP sobre o alvo', () => {
    const units = [buildUnit({ unitId: 'vip', pos: target }), passiveEnemy()];
    expect(checkWinCondition(buildState(units, condition))).toBe('victory');
  });

  it('derrota imediata se o VIP morre, mesmo com o resto do time vivo', () => {
    const units = [buildUnit({ unitId: 'vip', hp: 0 }), buildUnit({ unitId: 'escolta' }), passiveEnemy()];
    expect(checkWinCondition(buildState(units, condition))).toBe('defeat');
  });

  it('derrota se o mapa nomeia um VIP que não existe (erro de conteúdo, não trava a partida)', () => {
    const units = [buildUnit({ unitId: 'escolta' }), passiveEnemy()];
    expect(checkWinCondition(buildState(units, condition))).toBe('defeat');
  });

  it('batalha completa termina por escort: o VIP mover até o alvo encerra a partida', () => {
    const setup = buildSetup([buildUnit({ unitId: 'vip', pos: { x: 0, y: 0 } }), passiveEnemy()], condition);
    const state = buildInitialState(setup, 42);
    const result = applyCommandAndAdvance(state, {
      t: 'move',
      unitId: 'vip',
      path: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }],
    });
    expect(result.applied).toBe(true);
    expect(result.state.outcome).toBe('victory');
  });
});

describe('defend — segurar N rounds E não deixar inimigo tomar o tile', () => {
  const target = { x: 2, y: 2 };
  const condition: WinCondition = { t: 'defend', rounds: 2, target };

  it('ongoing enquanto os rounds correm e o tile está livre', () => {
    const units = [buildUnit(), passiveEnemy()];
    expect(checkWinCondition(buildState(units, condition, { round: 1 }))).toBe('ongoing');
    expect(checkWinCondition(buildState(units, condition, { round: 2 }))).toBe('ongoing');
  });

  it('vitória quando os N rounds passam com o tile livre', () => {
    const units = [buildUnit(), passiveEnemy()];
    expect(checkWinCondition(buildState(units, condition, { round: 3 }))).toBe('victory');
  });

  it('derrota imediata se um inimigo vivo ocupa o tile — antes dos N rounds', () => {
    const units = [buildUnit(), passiveEnemy(target)];
    expect(checkWinCondition(buildState(units, condition, { round: 1 }))).toBe('defeat');
  });

  it('inimigo MORTO sobre o tile não toma nada', () => {
    const units = [buildUnit(), { ...passiveEnemy(target), hp: 0 }];
    expect(checkWinCondition(buildState(units, condition, { round: 1 }))).toBe('ongoing');
  });

  it('unidade do JOGADOR sobre o tile é o caso normal, não derrota', () => {
    const units = [buildUnit({ pos: target }), passiveEnemy()];
    expect(checkWinCondition(buildState(units, condition, { round: 1 }))).toBe('ongoing');
  });

  it('o inimigo tomar o tile vence sobre a contagem de rounds já cumprida', () => {
    const units = [buildUnit(), passiveEnemy(target)];
    expect(checkWinCondition(buildState(units, condition, { round: 9 }))).toBe('defeat');
  });

  it('batalha completa termina por defend: dois `wait` com o tile livre', () => {
    const setup = buildSetup([buildUnit({ unitId: 'heroi' }), passiveEnemy()], condition);
    let state = buildInitialState(setup, 42);
    state = applyCommandAndAdvance(state, { t: 'wait', unitId: 'heroi' }).state;
    expect(state.outcome).toBe('ongoing');
    state = applyCommandAndAdvance(state, { t: 'wait', unitId: 'heroi' }).state;
    expect(state.outcome).toBe('victory');
  });
});

describe('determinismo', () => {
  it('a mesma batalha rodada duas vezes termina igual em todas as condições', () => {
    const conditions: WinCondition[] = [
      { t: 'seize', target: { x: 2, y: 0 } },
      { t: 'surviveRounds', n: 2 },
      { t: 'escort', unitId: 'heroi', target: { x: 2, y: 0 } },
      { t: 'defend', rounds: 2, target: { x: 2, y: 2 } },
    ];
    for (const condition of conditions) {
      const play = (): BattleState => {
        let state = buildInitialState(buildSetup([buildUnit({ unitId: 'heroi' }), passiveEnemy()], condition), 42);
        for (let i = 0; i < 3 && state.outcome === 'ongoing'; i++) {
          state = applyCommandAndAdvance(state, { t: 'wait', unitId: 'heroi' }).state;
        }
        return state;
      };
      expect(JSON.stringify(play())).toBe(JSON.stringify(play()));
    }
  });
});
