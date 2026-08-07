import { describe, expect, it } from 'vitest';
import { selectTacticsAction } from '../../src/tactics/selectTacticsAction.js';
import type { ConditionContext, ConditionUnitView, TacticsScript } from '../../src/tactics/types.js';
import type { SkillDef } from '../../src/skills/types.js';

function unit(overrides: Partial<ConditionUnitView> = {}): ConditionUnitView {
  return {
    currentHpPct: 1000,
    ap: 2,
    pp: 2,
    unitType: 'infantry',
    weaponType: 'sword',
    activeBuffIds: [],
    activeDebuffIds: [],
    ...overrides,
  };
}

function ctx(overrides: Partial<ConditionContext> = {}): ConditionContext {
  return {
    self: unit(),
    target: unit(),
    isSelfAttacker: true,
    hasPositionalBonus: false,
    trocaNumber: 1,
    battleRound: 1,
    alliesAdjacentCount: 0,
    ...overrides,
  };
}

const golpeForte: SkillDef = {
  id: 'skill-golpe-forte',
  name: 'Golpe Forte',
  kind: 'duel',
  apCost: 1,
  cooldown: 1,
  multiplier: 1500,
  flat: 0,
  scalesWith: 'atk',
  effects: [],
  tags: ['physical'],
};

const contraAtaque: SkillDef = {
  id: 'skill-contra-ataque',
  name: 'Contra-ataque',
  kind: 'reaction',
  apCost: 0,
  ppCost: 1,
  cooldown: 0,
  multiplier: 1000,
  flat: 0,
  scalesWith: 'atk',
  effects: [],
  trigger: 'onAttacked',
  tags: ['physical'],
};

const skills: Record<string, SkillDef> = {
  [golpeForte.id]: golpeForte,
  [contraAtaque.id]: contraAtaque,
};

describe('selectTacticsAction — algoritmo literal (§6.3)', () => {
  it('escolhe a primeira linha habilitada cujas conditions todas passam', () => {
    const script: TacticsScript = [
      { enabled: true, skillId: golpeForte.id, conditions: [{ t: 'targetHpBelow', pct: 500 }] },
    ];
    const result = selectTacticsAction({
      script,
      skills,
      cooldowns: {},
      apSpentThisDuel: 0,
      context: ctx({ target: unit({ currentHpPct: 300 }) }),
    });
    expect(result).toEqual({ kind: 'skill', skillId: golpeForte.id, lineIndex: 0 });
  });

  it('pula linha com skill em cooldown e cai para a próxima', () => {
    const script: TacticsScript = [
      { enabled: true, skillId: golpeForte.id, conditions: [] },
      { enabled: true, skillId: contraAtaque.id, conditions: [] },
    ];
    const result = selectTacticsAction({
      script,
      skills,
      cooldowns: { [golpeForte.id]: 2 },
      apSpentThisDuel: 0,
      context: ctx(),
    });
    expect(result).toEqual({ kind: 'skill', skillId: contraAtaque.id, lineIndex: 1 });
  });

  it('pula linha sem AP suficiente no pool', () => {
    const script: TacticsScript = [{ enabled: true, skillId: golpeForte.id, conditions: [] }];
    const result = selectTacticsAction({
      script,
      skills,
      cooldowns: {},
      apSpentThisDuel: 0,
      context: ctx({ self: unit({ ap: 0 }) }),
    });
    expect(result).toEqual({ kind: 'basicAttack' });
  });

  it('pula linha cujo gasto excederia o teto de 2 AP por duelo, mesmo com pool suficiente', () => {
    const script: TacticsScript = [{ enabled: true, skillId: golpeForte.id, conditions: [] }];
    const result = selectTacticsAction({
      script,
      skills,
      cooldowns: {},
      apSpentThisDuel: 2, // já gastou o teto nesta duelo
      context: ctx({ self: unit({ ap: 5 }) }), // pool de sobra, mas o teto do duelo bloqueia
    });
    expect(result).toEqual({ kind: 'basicAttack' });
  });

  it('pula linha de reação sem PP suficiente', () => {
    const script: TacticsScript = [{ enabled: true, skillId: contraAtaque.id, conditions: [] }];
    const result = selectTacticsAction({
      script,
      skills,
      cooldowns: {},
      apSpentThisDuel: 0,
      context: ctx({ self: unit({ pp: 0 }) }),
    });
    expect(result).toEqual({ kind: 'basicAttack' });
  });

  it('ignora linha desabilitada mesmo que as conditions passassem', () => {
    const script: TacticsScript = [
      { enabled: false, skillId: golpeForte.id, conditions: [] },
      { enabled: true, skillId: contraAtaque.id, conditions: [] },
    ];
    const result = selectTacticsAction({ script, skills, cooldowns: {}, apSpentThisDuel: 0, context: ctx() });
    expect(result).toEqual({ kind: 'skill', skillId: contraAtaque.id, lineIndex: 1 });
  });

  it('cai para ataque básico (0 AP) quando nenhuma linha passa', () => {
    const script: TacticsScript = [
      { enabled: true, skillId: golpeForte.id, conditions: [{ t: 'targetHpBelow', pct: 100 }] },
    ];
    const result = selectTacticsAction({
      script,
      skills,
      cooldowns: {},
      apSpentThisDuel: 0,
      context: ctx({ target: unit({ currentHpPct: 900 }) }),
    });
    expect(result).toEqual({ kind: 'basicAttack' });
  });

  it('cai para ataque básico com script vazio', () => {
    const result = selectTacticsAction({ script: [], skills, cooldowns: {}, apSpentThisDuel: 0, context: ctx() });
    expect(result).toEqual({ kind: 'basicAttack' });
  });

  it('respeita a ordem: a primeira linha que bate vence, não a "melhor"', () => {
    const script: TacticsScript = [
      { enabled: true, skillId: contraAtaque.id, conditions: [] },
      { enabled: true, skillId: golpeForte.id, conditions: [] },
    ];
    const result = selectTacticsAction({ script, skills, cooldowns: {}, apSpentThisDuel: 0, context: ctx() });
    expect(result).toEqual({ kind: 'skill', skillId: contraAtaque.id, lineIndex: 0 });
  });

  it('AND entre múltiplas conditions da mesma linha: todas precisam passar', () => {
    const script: TacticsScript = [
      {
        enabled: true,
        skillId: golpeForte.id,
        conditions: [{ t: 'targetHpBelow', pct: 500 }, { t: 'isAttacker' }],
      },
    ];
    const passingBoth = selectTacticsAction({
      script,
      skills,
      cooldowns: {},
      apSpentThisDuel: 0,
      context: ctx({ target: unit({ currentHpPct: 300 }), isSelfAttacker: true }),
    });
    expect(passingBoth).toEqual({ kind: 'skill', skillId: golpeForte.id, lineIndex: 0 });

    const failingOne = selectTacticsAction({
      script,
      skills,
      cooldowns: {},
      apSpentThisDuel: 0,
      context: ctx({ target: unit({ currentHpPct: 300 }), isSelfAttacker: false }),
    });
    expect(failingOne).toEqual({ kind: 'basicAttack' });
  });
});
