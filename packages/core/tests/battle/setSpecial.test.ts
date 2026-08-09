import { describe, expect, it } from 'vitest';
import { applyCommand } from '../../src/battle/commands.js';
import { computeInitiativeOrder } from '../../src/battle/initiative.js';
import { endRound } from '../../src/battle/round.js';
import type { BattleState, BattleUnit } from '../../src/battle/types.js';
import { SET_SPECIAL_RESERVA, SET_SPECIAL_SENTINELA } from '../../src/items/sets.js';
import type { GridMap, Terrain } from '../../src/grid/types.js';
import type { SkillDef } from '../../src/skills/types.js';
import type { StatSheet } from '../../src/stats/types.js';

// §7.4 (M10, sub-sessão 6/N) — os dois efeitos `special` de set que NÃO cabem dentro de
// resolveDuel, porque dependem do mapa: Reserva ("+1 AP máximo e `rest` recupera +2 AP" —
// aqui só a perna do `rest`; a do startingAp é testada em hero/combatProfile.test.ts) e
// Sentinela ("Assistir custa 0 PP uma vez por round de mapa"), que precisa de estado que
// sobrevive entre duelos do mesmo round.

const plain: Terrain = {
  id: 'plain',
  moveCost: { foot: 1, cavalry: 1, flying: 1, heavy: 1, aquatic: 2 },
  defBonus: 0,
  evaBonus: 0,
  blocksSight: false,
};

function buildMap(): GridMap {
  const tiles = Array.from({ length: 5 }, () =>
    Array.from({ length: 5 }, () => ({ terrain: 'plain', height: 0 as const })),
  );
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
  id: 'skill-strike', name: 'Golpe', kind: 'duel', apCost: 1, cooldown: 0,
  multiplier: 1200, flat: 0, scalesWith: 'atk', effects: [], tags: ['physical'],
};
const assistStrike: SkillDef = {
  id: 'skill-assist-strike', name: 'Apoio', kind: 'reaction', apCost: 0, ppCost: 1, cooldown: 0,
  multiplier: 900, flat: 0, scalesWith: 'atk', trigger: 'onAllyEngagedNearby', effects: [], tags: ['physical'],
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
    knownSkills: { [strike.id]: strike, [assistStrike.id]: assistStrike },
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

describe('§7.4 Reserva — `rest` recupera +2 AP', () => {
  it('sem o set, `rest` segue a regra base de §5.4 (+1 AP, +1 PP)', () => {
    const unit = buildUnit({ ap: 0, pp: 0 });
    const outcome = applyCommand(buildState([unit]), { t: 'rest', unitId: 'u1' });
    const after = outcome.state.units.find((u) => u.unitId === 'u1');
    expect(after?.ap).toBe(1);
    expect(after?.pp).toBe(1);
  });

  it('com o set, `rest` recupera 2 AP — e o PP continua em +1', () => {
    const unit = buildUnit({ ap: 0, pp: 0, setSpecialEffectIds: [SET_SPECIAL_RESERVA] });
    const outcome = applyCommand(buildState([unit]), { t: 'rest', unitId: 'u1' });
    const after = outcome.state.units.find((u) => u.unitId === 'u1');
    expect(after?.ap).toBe(2);
    expect(after?.pp).toBe(1);
  });

  it('o set não afrouxa a pré-condição de §5.4: andar mais que metade do moveRange ainda barra o `rest`', () => {
    const unit = buildUnit({ ap: 0, setSpecialEffectIds: [SET_SPECIAL_RESERVA] });
    const state = buildState([unit], { distanceMovedThisTurn: { u1: 3 } }); // moveRange 4, metade = 2
    const outcome = applyCommand(state, { t: 'rest', unitId: 'u1' });
    expect(outcome.applied).toBe(false);
    expect(outcome.state.units.find((u) => u.unitId === 'u1')?.ap).toBe(0);
  });

  it('o set não muda `wait` — só `rest` é citado em §7.4', () => {
    const unit = buildUnit({ ap: 0, setSpecialEffectIds: [SET_SPECIAL_RESERVA] });
    const outcome = applyCommand(buildState([unit]), { t: 'wait', unitId: 'u1' });
    expect(outcome.state.units.find((u) => u.unitId === 'u1')?.ap).toBe(0);
  });
});

describe('§7.4 Sentinela — assistir custa 0 PP uma vez por round de mapa', () => {
  // Dois atacantes do mesmo lado engajam o MESMO inimigo no mesmo round, então o
  // assistente tem duas janelas de assistência sem sair do lugar.
  function scenario(sentinela: boolean): BattleState {
    const first = buildUnit({ unitId: 'atk1', side: 'player', pos: { x: 0, y: 0 } });
    const second = buildUnit({ unitId: 'atk2', side: 'player', pos: { x: 1, y: 1 } });
    const enemy = buildUnit({
      unitId: 'def', side: 'enemy', pos: { x: 1, y: 0 },
      stats: statSheet({ def: 200, hp: 999999 }), hp: 999999,
    });
    const ally = buildUnit({
      unitId: 'ally', side: 'player',
      pos: { x: 2, y: 0 }, // Manhattan até o inimigo (1,0) = 1, dentro do assistRange = 2
      pp: 0, // sem PP: só uma assistência de custo zero pode acontecer
      reactionScript: [{ enabled: true, skillId: assistStrike.id, conditions: [] }],
      ...(sentinela ? { setSpecialEffectIds: [SET_SPECIAL_SENTINELA] } : {}),
    });
    return buildState([first, second, enemy, ally]);
  }

  it('sem o set, o assistente sem PP não assiste (controle)', () => {
    const outcome = applyCommand(scenario(false), { t: 'engage', unitId: 'atk1', targetId: 'def' });
    expect(outcome.duelResult?.attackerAssists).toHaveLength(0);
  });

  it('com o set, a primeira assistência do round acontece mesmo com PP zerado', () => {
    const outcome = applyCommand(scenario(true), { t: 'engage', unitId: 'atk1', targetId: 'def' });
    expect(outcome.duelResult?.attackerAssists).toHaveLength(1);
    expect(outcome.duelResult?.attackerAssists[0]?.assistantId).toBe('ally');
    expect(outcome.duelResult!.attackerAssists[0]!.damageDealt).toBeGreaterThan(0);
  });

  it('a assistência gratuita não debita PP', () => {
    const outcome = applyCommand(scenario(true), { t: 'engage', unitId: 'atk1', targetId: 'def' });
    expect(outcome.state.units.find((u) => u.unitId === 'ally')?.pp).toBe(0);
  });

  it('"uma vez por round": o segundo duelo do MESMO round não é mais gratuito', () => {
    const afterFirst = applyCommand(scenario(true), { t: 'engage', unitId: 'atk1', targetId: 'def' });
    expect(afterFirst.duelResult?.attackerAssists).toHaveLength(1);
    expect(afterFirst.state.freeAssistUsedThisRound).toContain('ally');

    const afterSecond = applyCommand(afterFirst.state, { t: 'engage', unitId: 'atk2', targetId: 'def' });
    expect(afterSecond.duelResult?.attackerAssists).toHaveLength(0);
  });

  it('o round novo devolve a assistência gratuita', () => {
    const afterFirst = applyCommand(scenario(true), { t: 'engage', unitId: 'atk1', targetId: 'def' });
    const nextRound = endRound(afterFirst.state);
    expect(nextRound.freeAssistUsedThisRound).toEqual([]);

    const afterSecond = applyCommand(nextRound, { t: 'engage', unitId: 'atk2', targetId: 'def' });
    expect(afterSecond.duelResult?.attackerAssists).toHaveLength(1);
  });

  it('com PP sobrando, o set gasta a janela gratuita antes do PP', () => {
    const base = scenario(true);
    const withPp = base.units.map((u) => (u.unitId === 'ally' ? { ...u, pp: 2 } : u));
    const outcome = applyCommand({ ...base, units: withPp }, { t: 'engage', unitId: 'atk1', targetId: 'def' });
    expect(outcome.duelResult?.attackerAssists).toHaveLength(1);
    expect(outcome.state.units.find((u) => u.unitId === 'ally')?.pp).toBe(2); // nada debitado
    expect(outcome.state.freeAssistUsedThisRound).toContain('ally');
  });

  it('marca só quem de fato usou a janela — um aliado sem o set não entra na lista', () => {
    const base = scenario(true);
    const outcome = applyCommand(base, { t: 'engage', unitId: 'atk1', targetId: 'def' });
    expect(outcome.state.freeAssistUsedThisRound).toEqual(['ally']);
  });

  it('determinismo: mesma seed, mesmo estado resultante', () => {
    const a = applyCommand(scenario(true), { t: 'engage', unitId: 'atk1', targetId: 'def' });
    const b = applyCommand(scenario(true), { t: 'engage', unitId: 'atk1', targetId: 'def' });
    expect(JSON.stringify(a.state)).toBe(JSON.stringify(b.state));
  });
});
