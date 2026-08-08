import { describe, expect, it } from 'vitest';
import { applyCommand } from '../../src/battle/commands.js';
import { computeInitiativeOrder } from '../../src/battle/initiative.js';
import type { BattleState, BattleUnit } from '../../src/battle/types.js';
import type { GridMap, Terrain } from '../../src/grid/types.js';
import type { StatSheet } from '../../src/stats/types.js';
import type { SkillDef } from '../../src/skills/types.js';
import type { EffectDef } from '../../src/duel/types.js';

const plain: Terrain = { id: 'plain', moveCost: { foot: 1, cavalry: 1, flying: 1, heavy: 1, aquatic: 2 }, defBonus: 0, evaBonus: 0, blocksSight: false };
const fort: Terrain = { id: 'fort', moveCost: { foot: 1, cavalry: 1, flying: 1, heavy: 1, aquatic: 2 }, defBonus: 50, evaBonus: 0, blocksSight: false };

function buildMap(): GridMap {
  const tiles = Array.from({ length: 5 }, (_, y) =>
    Array.from({ length: 5 }, (_, x) => ({
      terrain: 'plain',
      height: 0 as const,
      ...(x === 4 && y === 4 ? { object: 'fort' as const } : {}),
    })),
  );
  return { width: 5, height: 5, tiles, terrains: { plain, fort }, zocEnabled: false };
}

function statSheet(overrides: Partial<StatSheet> = {}): StatSheet {
  return {
    hp: 5000, atk: 1000, def: 300, spd: 100, chc: 0, chd: 1500,
    eff: 0, efr: 0, pen: 0, heal: 0, lifesteal: 0, focus: 0, vigor: 0,
    ...overrides,
  };
}

const strike: SkillDef = {
  id: 'skill-strike', name: 'Golpe', kind: 'duel', apCost: 1, cooldown: 0,
  multiplier: 1200, flat: 0, scalesWith: 'atk', effects: [], tags: ['physical'],
};
const counter: SkillDef = {
  id: 'skill-counter', name: 'Contra-ataque', kind: 'reaction', apCost: 0, ppCost: 1, cooldown: 0,
  multiplier: 800, flat: 0, scalesWith: 'atk', trigger: 'onAttacked', effects: [], tags: ['physical'],
};
const assistStrike: SkillDef = {
  id: 'skill-assist-strike', name: 'Apoio', kind: 'reaction', apCost: 0, ppCost: 1, cooldown: 0,
  multiplier: 900, flat: 0, scalesWith: 'atk', trigger: 'onAllyEngagedNearby', effects: [], tags: ['physical'],
};
const selfBuffSkill: SkillDef = {
  id: 'skill-self-buff', name: 'Grito de Guerra', kind: 'map', apCost: 1, cooldown: 0,
  multiplier: 0, flat: 0, scalesWith: 'atk',
  effects: [{ effectId: 'effect-atk-up', target: 'self', chance: 1000, duration: 'battle' }],
  tags: ['buff'],
};

const atkUpEffect: EffectDef = {
  id: 'effect-atk-up', name: 'Fúria', kind: 'buff', dispellable: true, maxStacks: 1,
  statMods: [{ stat: 'atk', flat: 100 }],
};

// §8.3/§6.9 (M10) — skill de duelo que aplica um debuff ao acertar, usada para provar
// que applyEngage persiste o ActiveEffect de volta no BattleUnit.
const debuffStrike: SkillDef = {
  id: 'skill-debuff-strike', name: 'Golpe Corrosivo', kind: 'duel', apCost: 1, cooldown: 0,
  multiplier: 1200, flat: 0, scalesWith: 'atk',
  effects: [{ effectId: 'effect-def-down', target: 'target', chance: 1000, duration: 'battle' }],
  tags: ['physical'],
};

const defDownEffect: EffectDef = {
  id: 'effect-def-down', name: 'Armadura Corroída', kind: 'debuff', dispellable: true, maxStacks: 1,
  statMods: [{ stat: 'def', pct: -300 }],
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
    reactionScript: [{ enabled: true, skillId: counter.id, conditions: [] }],
    knownSkills: {
      [strike.id]: strike,
      [counter.id]: counter,
      [assistStrike.id]: assistStrike,
      [selfBuffSkill.id]: selfBuffSkill,
      [debuffStrike.id]: debuffStrike,
    },
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
    effectDefs: { [atkUpEffect.id]: atkUpEffect, [defDownEffect.id]: defDownEffect },
    outcome: 'ongoing',
    seed: 42,
    ...overrides,
  };
}

describe('applyCommand — move (§5.2, §5.4)', () => {
  it('move válido reposiciona a unidade e acumula a distância andada, sem encerrar o turno', () => {
    const unit = buildUnit();
    const state = buildState([unit]);
    const outcome = applyCommand(state, { t: 'move', unitId: 'u1', path: [{ x: 0, y: 0 }, { x: 1, y: 0 }] });
    expect(outcome.applied).toBe(true);
    const moved = outcome.state.units.find((u) => u.unitId === 'u1');
    expect(moved?.pos).toEqual({ x: 1, y: 0 });
    expect(moved?.hasActedThisRound).toBe(false);
    expect(outcome.state.distanceMovedThisTurn['u1']).toBe(1);
  });

  it('rejeita um caminho que excede o moveRange', () => {
    const unit = buildUnit({ moveRange: 1 });
    const state = buildState([unit]);
    const outcome = applyCommand(state, {
      t: 'move',
      unitId: 'u1',
      path: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }],
    });
    expect(outcome.applied).toBe(false);
  });

  it('rejeita move de unidade que já agiu neste round', () => {
    const unit = buildUnit({ hasActedThisRound: true });
    const state = buildState([unit]);
    const outcome = applyCommand(state, { t: 'move', unitId: 'u1', path: [{ x: 0, y: 0 }, { x: 1, y: 0 }] });
    expect(outcome.applied).toBe(false);
  });
});

describe('applyCommand — rest (§5.4)', () => {
  it('recupera +1 AP e +1 PP e encerra o turno quando não andou mais que metade do alcance', () => {
    const unit = buildUnit({ ap: 1, pp: 0, moveRange: 4 });
    const state = buildState([unit], { distanceMovedThisTurn: { u1: 2 } }); // metade de 4
    const outcome = applyCommand(state, { t: 'rest', unitId: 'u1' });
    expect(outcome.applied).toBe(true);
    const rested = outcome.state.units.find((u) => u.unitId === 'u1');
    expect(rested).toMatchObject({ ap: 2, pp: 1, hasActedThisRound: true });
  });

  it('rejeita rest se andou mais que metade do alcance', () => {
    const unit = buildUnit({ moveRange: 4 });
    const state = buildState([unit], { distanceMovedThisTurn: { u1: 3 } });
    const outcome = applyCommand(state, { t: 'rest', unitId: 'u1' });
    expect(outcome.applied).toBe(false);
  });
});

describe('applyCommand — wait (§5.4)', () => {
  it('encerra o turno sem bônus em terreno comum', () => {
    const unit = buildUnit({ ap: 2 });
    const state = buildState([unit]);
    const outcome = applyCommand(state, { t: 'wait', unitId: 'u1' });
    const waited = outcome.state.units.find((u) => u.unitId === 'u1');
    expect(waited).toMatchObject({ ap: 2, hasActedThisRound: true });
  });

  it('dá +1 AP se terminar sobre fort ou camp', () => {
    const unit = buildUnit({ ap: 2, pos: { x: 4, y: 4 } }); // fort no mapa de teste
    const state = buildState([unit]);
    const outcome = applyCommand(state, { t: 'wait', unitId: 'u1' });
    const waited = outcome.state.units.find((u) => u.unitId === 'u1');
    expect(waited?.ap).toBe(3);
  });
});

describe('applyCommand — mapSkill (self-only em M3, ver DECISIONS.md)', () => {
  it('gasta AP, encerra o turno e aplica o efeito em si mesma', () => {
    const unit = buildUnit({ ap: 2 });
    const state = buildState([unit]);
    const outcome = applyCommand(state, {
      t: 'mapSkill',
      unitId: 'u1',
      skillId: selfBuffSkill.id,
      target: unit.pos,
    });
    expect(outcome.applied).toBe(true);
    const buffed = outcome.state.units.find((u) => u.unitId === 'u1');
    expect(buffed?.ap).toBe(1);
    expect(buffed?.hasActedThisRound).toBe(true);
    expect(buffed?.effects).toHaveLength(1);
    expect(buffed?.effects[0]?.id).toBe(atkUpEffect.id);
    // M10 — duration agora vem da própria EffectApplication (era hardcoded 'battle' em
    // M3, ver DECISIONS.md); a fixture acima declara 'battle', então o valor bate, mas a
    // asserção prova que o campo REALMENTE flui, não que o default coincide por acaso.
    expect(buffed?.effects[0]?.duration).toBe('battle');
  });

  it('rejeita se a unidade não conhece a skill ou não tem AP suficiente', () => {
    const unit = buildUnit({ ap: 0 });
    const state = buildState([unit]);
    const outcome = applyCommand(state, { t: 'mapSkill', unitId: 'u1', skillId: selfBuffSkill.id, target: unit.pos });
    expect(outcome.applied).toBe(false);
  });
});

describe('applyCommand — useValor (mínimo, ver DECISIONS.md)', () => {
  it('gasta 1 ponto de valor quando há saldo', () => {
    const state = buildState([buildUnit()], { valor: 5 });
    const outcome = applyCommand(state, { t: 'useValor', skillId: 'valor-qualquer', target: { x: 0, y: 0 } });
    expect(outcome.applied).toBe(true);
    expect(outcome.state.valor).toBe(4);
  });

  it('rejeita sem saldo de valor', () => {
    const state = buildState([buildUnit()], { valor: 0 });
    const outcome = applyCommand(state, { t: 'useValor', skillId: 'valor-qualquer', target: { x: 0, y: 0 } });
    expect(outcome.applied).toBe(false);
  });
});

describe('applyCommand — engage (integra de verdade com resolveDuel de M2)', () => {
  it('resolve um duelo real e persiste HP/AP/PP de volta nas duas unidades', () => {
    const attacker = buildUnit({ unitId: 'atk', side: 'player', pos: { x: 0, y: 0 } });
    const defender = buildUnit({ unitId: 'def', side: 'enemy', pos: { x: 1, y: 0 }, stats: statSheet({ def: 200 }) });
    const state = buildState([attacker, defender]);

    const outcome = applyCommand(state, { t: 'engage', unitId: 'atk', targetId: 'def' });
    expect(outcome.applied).toBe(true);
    expect(outcome.duelResult).toBeDefined();

    const finalAttacker = outcome.state.units.find((u) => u.unitId === 'atk');
    const finalDefender = outcome.state.units.find((u) => u.unitId === 'def');
    expect(finalAttacker?.hasActedThisRound).toBe(true);
    // o defensor foi engajado, mas isso não consome o turno DELE no mapa (§5.4).
    expect(finalDefender?.hasActedThisRound).toBe(false);
    expect(finalDefender?.hp).toBeLessThanOrEqual(defender.hp);
  });

  it('rejeita engajar uma unidade do mesmo lado', () => {
    const a = buildUnit({ unitId: 'a', side: 'player', pos: { x: 0, y: 0 } });
    const b = buildUnit({ unitId: 'b', side: 'player', pos: { x: 1, y: 0 } });
    const outcome = applyCommand(buildState([a, b]), { t: 'engage', unitId: 'a', targetId: 'b' });
    expect(outcome.applied).toBe(false);
  });

  it('rejeita engajar um alvo fora do duelRange do atacante', () => {
    const attacker = buildUnit({ unitId: 'atk', side: 'player', pos: { x: 0, y: 0 }, duelRange: 1 });
    const defender = buildUnit({ unitId: 'def', side: 'enemy', pos: { x: 3, y: 0 } });
    const outcome = applyCommand(buildState([attacker, defender]), { t: 'engage', unitId: 'atk', targetId: 'def' });
    expect(outcome.applied).toBe(false);
  });

  it('assistência real: aliado dentro do assistRange participa do duelo sem gastar o próprio turno', () => {
    const attacker = buildUnit({ unitId: 'atk', side: 'player', pos: { x: 0, y: 0 } });
    const defender = buildUnit({ unitId: 'def', side: 'enemy', pos: { x: 1, y: 0 }, stats: statSheet({ def: 200, hp: 999999 }) });
    const ally = buildUnit({
      unitId: 'ally',
      side: 'player',
      pos: { x: 2, y: 0 }, // Manhattan até o defensor (1,0) = 1, dentro do assistRange=2
      reactionScript: [{ enabled: true, skillId: assistStrike.id, conditions: [] }],
    });
    const state = buildState([attacker, defender, ally]);

    const outcome = applyCommand(state, { t: 'engage', unitId: 'atk', targetId: 'def' });
    expect(outcome.duelResult?.attackerAssists.length).toBeGreaterThan(0);
    // M10 — a assistência agora causa dano de verdade a HP, não só decide quem assiste.
    const assistDamage = outcome.duelResult!.attackerAssists[0]!.damageDealt;
    expect(assistDamage).toBeGreaterThan(0);

    const allyAfter = outcome.state.units.find((u) => u.unitId === 'ally');
    expect(allyAfter?.hasActedThisRound).toBe(false);
    expect(allyAfter?.pp).toBeLessThan(ally.pp); // gastou PP assistindo
  });

  it('persiste no BattleUnit o efeito que skill.effects aplicou dentro do duelo (M10 — sem isto, o efeito evaporaria ao sincronizar com o mapa)', () => {
    const attacker = buildUnit({
      unitId: 'atk', side: 'player', pos: { x: 0, y: 0 },
      tacticsScript: [{ enabled: true, skillId: debuffStrike.id, conditions: [] }],
    });
    const defender = buildUnit({ unitId: 'def', side: 'enemy', pos: { x: 1, y: 0 }, stats: statSheet({ def: 200, hp: 999999 }) });
    const state = buildState([attacker, defender]);

    const outcome = applyCommand(state, { t: 'engage', unitId: 'atk', targetId: 'def' });
    const finalDefender = outcome.state.units.find((u) => u.unitId === 'def');
    expect(finalDefender?.effects).toHaveLength(1);
    expect(finalDefender?.effects[0]).toMatchObject({ id: defDownEffect.id, duration: 'battle' });
  });
});
