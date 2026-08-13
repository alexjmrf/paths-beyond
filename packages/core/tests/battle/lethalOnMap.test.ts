import { describe, expect, it } from 'vitest';
import { applyCommand } from '../../src/battle/commands.js';
import { computeInitiativeOrder } from '../../src/battle/initiative.js';
import { endRound } from '../../src/battle/round.js';
import type { BattleState, BattleUnit } from '../../src/battle/types.js';
import { LETHAL_SURVIVE_HP, LETHAL_SURVIVE_TAG } from '../../src/duel/lethal.js';
import type { EffectDef } from '../../src/duel/types.js';
import type { GridMap, Terrain } from '../../src/grid/types.js';
import type { SkillDef } from '../../src/skills/types.js';
import type { StatSheet } from '../../src/stats/types.js';

// §6.4/§6.9 (M10, sub-sessão 8/N) — o gatilho de morte fora do duelo. Só a variante
// `survive` com `lethalUses:'perBattle'` chega aqui: a variante de dano precisa de um
// matador (o veneno não é um), e `perDuel` não tem duelo a que se limitar no tick de round.

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

const poisonId = 'effect-veneno';
const effectDefs: Readonly<Record<string, EffectDef>> = {
  [poisonId]: {
    id: poisonId, name: 'Veneno', kind: 'debuff', dispellable: true, maxStacks: 1,
    statMods: [], periodicDamagePct: 500, // 50% do HP máximo por tick: letal em 2 rounds
  },
};

const lastStandPerBattle: SkillDef = {
  id: 'skill-teimosia', name: 'Teimosia', kind: 'duel', apCost: 0, cooldown: 0,
  multiplier: 0, flat: 0, scalesWith: 'atk', effects: [],
  trigger: 'onLethal', lethalUses: 'perBattle', tags: [LETHAL_SURVIVE_TAG],
};

const lastStandPerDuel: SkillDef = { ...lastStandPerBattle, id: 'skill-ultimo-suspiro', lethalUses: 'perDuel' };

const deathBlast: SkillDef = {
  id: 'skill-explosao', name: 'Explosão Final', kind: 'duel', apCost: 0, cooldown: 0,
  multiplier: 1500, flat: 0, scalesWith: 'atk', effects: [],
  trigger: 'onLethal', lethalUses: 'perBattle', tags: ['physical'],
};

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
    freeAssistUsedThisRound: [],
    permadeath: 'classic',
    winCondition: { t: 'rout' },
    effectDefs,
    outcome: 'ongoing',
    seed: 42,
    ...overrides,
  };
}

// Envenenada e a um tick da morte.
function poisoned(overrides: Partial<BattleUnit> = {}): BattleUnit {
  return buildUnit({
    hp: 100,
    effects: [{ id: poisonId, duration: 'battle', stacks: 1, maxStacks: 1, dispellable: true }],
    ...overrides,
  });
}

describe('tick de DoT letal — §6.9 + gatilho de morte', () => {
  it('sem o gatilho, o veneno mata (controle)', () => {
    const result = endRound(buildState([poisoned()]));
    expect(result.units[0]?.hp).toBe(0);
  });

  it('`survive` + `perBattle` sobrevive ao tick com 1 HP', () => {
    const unit = poisoned({ knownSkills: { [lastStandPerBattle.id]: lastStandPerBattle } });
    const result = endRound(buildState([unit]));
    expect(result.units[0]?.hp).toBe(LETHAL_SURVIVE_HP);
    expect(result.units[0]?.lethalTriggersUsed).toEqual([lastStandPerBattle.id]);
  });

  it('dispara uma vez só: o tick do round seguinte mata', () => {
    const unit = poisoned({ knownSkills: { [lastStandPerBattle.id]: lastStandPerBattle } });
    const result = endRound(endRound(buildState([unit])));
    expect(result.units[0]?.hp).toBe(0);
  });

  it('`perDuel` NÃO dispara fora de um duelo', () => {
    const unit = poisoned({ knownSkills: { [lastStandPerDuel.id]: lastStandPerDuel } });
    expect(endRound(buildState([unit])).units[0]?.hp).toBe(0);
  });

  it('a variante de dano NÃO dispara: o veneno não é um matador', () => {
    const unit = poisoned({ knownSkills: { [deathBlast.id]: deathBlast } });
    const result = endRound(buildState([unit]));
    expect(result.units[0]?.hp).toBe(0);
    expect(result.units[0]?.lethalTriggersUsed ?? []).toEqual([]);
  });

  it('não dispara em tick não-letal', () => {
    const unit = buildUnit({
      hp: 5000,
      effects: [{ id: poisonId, duration: 'battle', stacks: 1, maxStacks: 1, dispellable: true }],
      knownSkills: { [lastStandPerBattle.id]: lastStandPerBattle },
    });
    const result = endRound(buildState([unit]));
    expect(result.units[0]?.hp).toBeGreaterThan(0);
    expect(result.units[0]?.lethalTriggersUsed ?? []).toEqual([]);
  });
});

describe('persistência entre duelos — `lethalTriggersUsed` no BattleUnit', () => {
  const attacker = buildUnit({
    unitId: 'atacante', side: 'player', pos: { x: 0, y: 0 },
    tacticsScript: [{ enabled: true, skillId: strike.id, conditions: [] }],
    knownSkills: { [strike.id]: strike },
  });
  const defender = buildUnit({
    unitId: 'defensor', side: 'enemy', pos: { x: 1, y: 0 }, hp: 100,
    knownSkills: { [lastStandPerBattle.id]: lastStandPerBattle },
  });

  const engage = { t: 'engage', unitId: 'atacante', targetId: 'defensor' } as const;

  it('SAÍDA: o gatilho `perBattle` disparado no duelo volta para o mapa', () => {
    const outcome = applyCommand(buildState([attacker, defender]), engage);
    expect(outcome.applied).toBe(true);
    expect(outcome.duelResult?.lethalTriggers).toHaveLength(1);
    expect(outcome.state.units.find((u) => u.unitId === 'defensor')?.lethalTriggersUsed).toEqual([
      lastStandPerBattle.id,
    ]);
  });

  it('ENTRADA: o que já foi usado antes do duelo impede o gatilho de disparar', () => {
    const jaUsou = { ...defender, lethalTriggersUsed: [lastStandPerBattle.id] };
    const outcome = applyCommand(buildState([attacker, jaUsou]), engage);
    expect(outcome.duelResult?.lethalTriggers).toHaveLength(0);
    expect(outcome.state.units.find((u) => u.unitId === 'defensor')?.hp).toBe(0);
  });

  it('`perDuel` dispara no duelo mas NÃO persiste — recarrega no duelo seguinte', () => {
    const perDuelDefender = { ...defender, knownSkills: { [lastStandPerDuel.id]: lastStandPerDuel } };
    const outcome = applyCommand(buildState([attacker, perDuelDefender]), engage);
    expect(outcome.duelResult?.lethalTriggers).toHaveLength(1);
    expect(outcome.state.units.find((u) => u.unitId === 'defensor')?.lethalTriggersUsed ?? []).toEqual([]);
  });

  it('o tick de DoT e o duelo compartilham o mesmo estado de uso', () => {
    // Gasta o gatilho no tick de veneno; o duelo seguinte já o encontra usado.
    const envenenado = poisoned({
      unitId: 'defensor', side: 'enemy', pos: { x: 1, y: 0 },
      knownSkills: { [lastStandPerBattle.id]: lastStandPerBattle },
    });
    const afterTick = endRound(buildState([attacker, envenenado]));
    expect(afterTick.units.find((u) => u.unitId === 'defensor')?.hp).toBe(LETHAL_SURVIVE_HP);

    const outcome = applyCommand(afterTick, engage);
    expect(outcome.duelResult?.lethalTriggers).toHaveLength(0);
    expect(outcome.state.units.find((u) => u.unitId === 'defensor')?.hp).toBe(0);
  });
});
