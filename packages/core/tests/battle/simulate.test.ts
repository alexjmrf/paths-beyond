import { describe, expect, it } from 'vitest';
import { applyCommandAndAdvance, buildInitialState, simulate } from '../../src/battle/simulate.js';
import type { BattleSetup, BattleUnit, Replay } from '../../src/battle/types.js';
import type { GridMap, Terrain } from '../../src/grid/types.js';
import type { StatSheet } from '../../src/stats/types.js';
import type { SkillDef } from '../../src/skills/types.js';
import type { EffectDef } from '../../src/duel/types.js';

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

const spdBuffSkill: SkillDef = {
  id: 'skill-spd-buff', name: 'Ímpeto', kind: 'map', apCost: 1, cooldown: 0,
  multiplier: 0, flat: 0, scalesWith: 'atk',
  effects: [{ effectId: 'effect-spd-up', target: 'self', chance: 1000, duration: 'battle' }],
  tags: ['buff'],
};

const spdUpEffect: EffectDef = {
  id: 'effect-spd-up', name: 'Ímpeto', kind: 'buff', dispellable: true, maxStacks: 1,
  statMods: [{ stat: 'spd', flat: 500 }],
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
    knownSkills: { [strike.id]: strike, [spdBuffSkill.id]: spdBuffSkill },
    ...overrides,
  };
}

function buildSetup(units: readonly BattleUnit[], overrides: Partial<BattleSetup> = {}): BattleSetup {
  return {
    map: buildMap(),
    units,
    permadeath: 'classic',
    winCondition: { t: 'rout' },
    effectDefs: { [spdUpEffect.id]: spdUpEffect },
    initialValor: 5,
    ...overrides,
  };
}

describe('simulate — batalha completa via BattleCommand[] (critério de aceite do M3)', () => {
  it('joga uma batalha 1v1 do início ao fim e chega a `victory` quando o inimigo morre', () => {
    const attacker = buildUnit({ unitId: 'atk', side: 'player', pos: { x: 0, y: 0 } });
    const defender = buildUnit({ unitId: 'def', side: 'enemy', pos: { x: 1, y: 0 }, hp: 400, stats: statSheet({ hp: 400, def: 100 }) });
    const replay: Replay = {
      rulesVersion: '0.0.0',
      seed: 42,
      initialState: buildSetup([attacker, defender]),
      commands: [{ t: 'engage', unitId: 'atk', targetId: 'def' }],
    };
    const result = simulate(replay);
    expect(result.outcome).toBe('victory');
  });

  it('chega a `defeat` quando o time do jogador é eliminado', () => {
    const attacker = buildUnit({ unitId: 'atk', side: 'enemy', pos: { x: 0, y: 0 } });
    const defender = buildUnit({ unitId: 'def', side: 'player', pos: { x: 1, y: 0 }, hp: 400, stats: statSheet({ hp: 400, def: 100 }) });
    const replay: Replay = {
      rulesVersion: '0.0.0',
      seed: 42,
      initialState: buildSetup([attacker, defender]),
      commands: [{ t: 'engage', unitId: 'atk', targetId: 'def' }],
    };
    const result = simulate(replay);
    expect(result.outcome).toBe('defeat');
  });

  it('ignora comandos inválidos sem travar a simulação', () => {
    const attacker = buildUnit({ unitId: 'atk', side: 'player' });
    const defender = buildUnit({ unitId: 'def', side: 'enemy', pos: { x: 1, y: 0 } });
    const replay: Replay = {
      rulesVersion: '0.0.0',
      seed: 1,
      initialState: buildSetup([attacker, defender]),
      commands: [
        { t: 'engage', unitId: 'ghost', targetId: 'def' }, // unidade inexistente
        { t: 'wait', unitId: 'atk' },
      ],
    };
    expect(() => simulate(replay)).not.toThrow();
  });

  it('para de processar comandos assim que a batalha termina', () => {
    const attacker = buildUnit({ unitId: 'atk', side: 'player' });
    const defender = buildUnit({ unitId: 'def', side: 'enemy', pos: { x: 1, y: 0 }, hp: 1, stats: statSheet({ hp: 1, def: 0 }) });
    const replay: Replay = {
      rulesVersion: '0.0.0',
      seed: 7,
      initialState: buildSetup([attacker, defender]),
      commands: [
        { t: 'engage', unitId: 'atk', targetId: 'def' }, // já deve matar o defensor
        { t: 'wait', unitId: 'atk' }, // ignorado — atacante já agiu, e a batalha já acabou
      ],
    };
    const result = simulate(replay);
    expect(result.outcome).toBe('victory');
  });
});

describe('simulate — replay determinístico (§3.3: "mesmo replay 1000x, mesmo hash")', () => {
  it('roda o mesmo replay 1000 vezes e produz sempre o mesmo resultado (hash idêntico)', () => {
    const attacker = buildUnit({ unitId: 'atk', side: 'player' });
    const defender = buildUnit({ unitId: 'def', side: 'enemy', pos: { x: 1, y: 0 }, hp: 400, stats: statSheet({ hp: 400, def: 100 }) });
    const replay: Replay = {
      rulesVersion: '0.0.0',
      seed: 99,
      initialState: buildSetup([attacker, defender]),
      commands: [{ t: 'engage', unitId: 'atk', targetId: 'def' }],
    };

    const first = JSON.stringify(simulate(replay));
    for (let i = 0; i < 1000; i++) {
      expect(JSON.stringify(simulate(replay))).toBe(first);
    }
  });
});

describe('simulate — lista de iniciativa fixa (§5.3: buff de spd NÃO reordena)', () => {
  it('a ordem de iniciativa calculada no início da batalha permanece idêntica mesmo depois de um buff de +500 spd', () => {
    const fast = buildUnit({ unitId: 'fast', side: 'player', pos: { x: 0, y: 0 }, stats: statSheet({ spd: 300 }) });
    const slow = buildUnit({ unitId: 'slow', side: 'player', pos: { x: 0, y: 1 }, stats: statSheet({ spd: 10 }) });
    const enemy = buildUnit({ unitId: 'enemy', side: 'enemy', pos: { x: 4, y: 4 } });

    const replayWithoutBuff: Replay = {
      rulesVersion: '0.0.0',
      seed: 5,
      initialState: buildSetup([fast, slow, enemy]),
      commands: [],
    };
    const baselineOrder = simulate(replayWithoutBuff).initiativeOrder;
    expect(baselineOrder.map((e) => e.unitId)[0]).toBe('fast'); // fast realmente vem primeiro sem buff

    const replayWithBuff: Replay = {
      rulesVersion: '0.0.0',
      seed: 5,
      initialState: buildSetup([fast, slow, enemy]),
      // 'slow' usa a skill de mapa que dá +500 de spd a si mesma — bem mais que 'fast'.
      commands: [{ t: 'mapSkill', unitId: 'slow', skillId: spdBuffSkill.id, target: slow.pos }],
    };
    const resultWithBuff = simulate(replayWithBuff);

    // o buff realmente foi aplicado...
    const buffedSlow = resultWithBuff.finalUnits.find((u) => u.unitId === 'slow');
    expect(buffedSlow?.effects).toHaveLength(1);

    // ...mas a lista de iniciativa da batalha não mudou nem um pouco.
    expect(resultWithBuff.initiativeOrder).toEqual(baselineOrder);
  });
});

describe('buildInitialState — exposta para consumo interativo (M6: cliente aplica 1 comando por vez)', () => {
  it('produz o mesmo BattleState que `simulate` usaria internamente (mesma seed, mesmo setup)', () => {
    const attacker = buildUnit({ unitId: 'atk', side: 'player' });
    const defender = buildUnit({ unitId: 'def', side: 'enemy', pos: { x: 1, y: 0 } });
    const setup = buildSetup([attacker, defender]);

    const state = buildInitialState(setup, 42);
    expect(state.round).toBe(1);
    expect(state.outcome).toBe('ongoing');
    expect(state.initiativeOrder.map((e) => e.unitId).sort()).toEqual(['atk', 'def']);
  });
});

describe('applyCommandAndAdvance — aplica 1 comando + bookkeeping de round/vitória (base do loop interativo do cliente)', () => {
  it('aplica um comando válido e devolve o novo estado', () => {
    const attacker = buildUnit({ unitId: 'atk', side: 'player' });
    const defender = buildUnit({ unitId: 'def', side: 'enemy', pos: { x: 1, y: 0 } });
    const state = buildInitialState(buildSetup([attacker, defender]), 1);

    const result = applyCommandAndAdvance(state, { t: 'wait', unitId: 'atk' });
    expect(result.applied).toBe(true);
    expect(result.state.units.find((u) => u.unitId === 'atk')?.hasActedThisRound).toBe(true);
  });

  it('comando inválido não muda o estado e reporta applied:false', () => {
    const attacker = buildUnit({ unitId: 'atk', side: 'player' });
    const defender = buildUnit({ unitId: 'def', side: 'enemy', pos: { x: 1, y: 0 } });
    const state = buildInitialState(buildSetup([attacker, defender]), 1);

    const result = applyCommandAndAdvance(state, { t: 'wait', unitId: 'fantasma' });
    expect(result.applied).toBe(false);
    expect(result.state).toEqual(state);
  });

  it('fecha o round automaticamente quando todas as unidades vivas agiram', () => {
    const attacker = buildUnit({ unitId: 'atk', side: 'player' });
    const defender = buildUnit({ unitId: 'def', side: 'enemy', pos: { x: 1, y: 0 } });
    let state = buildInitialState(buildSetup([attacker, defender]), 1);

    state = applyCommandAndAdvance(state, { t: 'wait', unitId: 'atk' }).state;
    expect(state.round).toBe(1);
    state = applyCommandAndAdvance(state, { t: 'wait', unitId: 'def' }).state;
    expect(state.round).toBe(2); // as duas agiram -> round fechou e avançou
    expect(state.units.every((u) => !u.hasActedThisRound)).toBe(true);
  });

  it('marca outcome quando a condição de vitória é atingida', () => {
    const attacker = buildUnit({ unitId: 'atk', side: 'player' });
    const defender = buildUnit({
      unitId: 'def',
      side: 'enemy',
      pos: { x: 1, y: 0 },
      hp: 1,
      stats: statSheet({ hp: 1, def: 0 }),
    });
    const state = buildInitialState(buildSetup([attacker, defender]), 7);

    const result = applyCommandAndAdvance(state, { t: 'engage', unitId: 'atk', targetId: 'def' });
    expect(result.applied).toBe(true);
    expect(result.state.outcome).toBe('victory');
    expect(result.duelResult).toBeDefined();
  });

  it('não aplica mais comandos depois que a batalha já terminou', () => {
    const attacker = buildUnit({ unitId: 'atk', side: 'player' });
    const defender = buildUnit({
      unitId: 'def',
      side: 'enemy',
      pos: { x: 1, y: 0 },
      hp: 1,
      stats: statSheet({ hp: 1, def: 0 }),
    });
    let state = buildInitialState(buildSetup([attacker, defender]), 7);
    state = applyCommandAndAdvance(state, { t: 'engage', unitId: 'atk', targetId: 'def' }).state;
    expect(state.outcome).toBe('victory');

    const result = applyCommandAndAdvance(state, { t: 'wait', unitId: 'atk' });
    expect(result.applied).toBe(false);
  });
});
