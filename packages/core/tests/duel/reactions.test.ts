import { describe, expect, it } from 'vitest';
import { selectReaction } from '../../src/duel/reactions.js';
import type { DuelEconomyState } from '../../src/duel/economy.js';
import type { ReactionLine } from '../../src/duel/types.js';
import type { ConditionContext, ConditionUnitView } from '../../src/tactics/types.js';
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
    isSelfAttacker: false,
    hasPositionalBonus: false,
    trocaNumber: 1,
    battleRound: 1,
    alliesAdjacentCount: 0,
    ...overrides,
  };
}

function economy(overrides: Partial<DuelEconomyState> = {}): DuelEconomyState {
  return { pools: { ap: 2, pp: 2 }, apSpentThisDuel: 0, ppSpentThisTroca: 0, ...overrides };
}

const counterAttack: SkillDef = {
  id: 'skill-counter-attack',
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

const defend: SkillDef = {
  id: 'skill-defend',
  name: 'Defender',
  kind: 'reaction',
  apCost: 0,
  ppCost: 1,
  cooldown: 0,
  multiplier: 0,
  flat: 0,
  scalesWith: 'atk',
  effects: [],
  trigger: 'onAttacked',
  tags: [],
};

const cureEmergencia: SkillDef = {
  id: 'skill-cura-emergencia',
  name: 'Cura de Emergência',
  kind: 'reaction',
  apCost: 0,
  ppCost: 1,
  cooldown: 2,
  multiplier: 0,
  flat: 300,
  scalesWith: 'hp',
  effects: [],
  trigger: 'onLethal',
  tags: ['heal'],
};

const skills: Record<string, SkillDef> = {
  [counterAttack.id]: counterAttack,
  [defend.id]: defend,
  [cureEmergencia.id]: cureEmergencia,
};

describe('selectReaction — generaliza o algoritmo de §6.3 para reações (§6.4/§6.5)', () => {
  it('dispara a primeira linha habilitada cujo trigger bate e as conditions passam', () => {
    const script: ReactionLine[] = [{ enabled: true, skillId: counterAttack.id, conditions: [] }];
    const result = selectReaction({
      reactionScript: script,
      skills,
      trigger: 'onAttacked',
      economy: economy(),
      context: ctx(),
    });
    expect(result).toEqual({ kind: 'reaction', skillId: counterAttack.id, lineIndex: 0 });
  });

  it('contra-atacar sem PP não dispara (critério de aceite nomeado do M2)', () => {
    const script: ReactionLine[] = [{ enabled: true, skillId: counterAttack.id, conditions: [] }];
    const result = selectReaction({
      reactionScript: script,
      skills,
      trigger: 'onAttacked',
      economy: economy({ pools: { ap: 2, pp: 0 } }),
      context: ctx(),
    });
    expect(result).toEqual({ kind: 'none' });
  });

  it('pula linha cujo trigger da skill não bate com o trigger atual', () => {
    const script: ReactionLine[] = [
      { enabled: true, skillId: cureEmergencia.id, conditions: [] }, // onLethal
      { enabled: true, skillId: counterAttack.id, conditions: [] }, // onAttacked
    ];
    const result = selectReaction({
      reactionScript: script,
      skills,
      trigger: 'onAttacked',
      economy: economy(),
      context: ctx(),
    });
    expect(result).toEqual({ kind: 'reaction', skillId: counterAttack.id, lineIndex: 1 });
  });

  it('ignora linha desabilitada', () => {
    const script: ReactionLine[] = [
      { enabled: false, skillId: counterAttack.id, conditions: [] },
      { enabled: true, skillId: defend.id, conditions: [] },
    ];
    const result = selectReaction({
      reactionScript: script,
      skills,
      trigger: 'onAttacked',
      economy: economy(),
      context: ctx(),
    });
    expect(result).toEqual({ kind: 'reaction', skillId: defend.id, lineIndex: 1 });
  });

  it('respeita o teto de 1 PP por troca mesmo com pool de sobra', () => {
    const script: ReactionLine[] = [{ enabled: true, skillId: counterAttack.id, conditions: [] }];
    const result = selectReaction({
      reactionScript: script,
      skills,
      trigger: 'onAttacked',
      economy: economy({ pools: { ap: 2, pp: 5 }, ppSpentThisTroca: 1 }),
      context: ctx(),
    });
    expect(result).toEqual({ kind: 'none' });
  });

  it('avalia conditions com AND, igual às linhas de tactics', () => {
    const script: ReactionLine[] = [
      {
        enabled: true,
        skillId: counterAttack.id,
        conditions: [{ t: 'selfHpBelow', pct: 500 }],
      },
    ];
    const blocked = selectReaction({
      reactionScript: script,
      skills,
      trigger: 'onAttacked',
      economy: economy(),
      context: ctx({ self: unit({ currentHpPct: 900 }) }),
    });
    expect(blocked).toEqual({ kind: 'none' });

    const allowed = selectReaction({
      reactionScript: script,
      skills,
      trigger: 'onAttacked',
      economy: economy(),
      context: ctx({ self: unit({ currentHpPct: 300 }) }),
    });
    expect(allowed).toEqual({ kind: 'reaction', skillId: counterAttack.id, lineIndex: 0 });
  });

  it('retorna none quando nenhuma linha bate', () => {
    const result = selectReaction({
      reactionScript: [],
      skills,
      trigger: 'onAttacked',
      economy: economy(),
      context: ctx(),
    });
    expect(result).toEqual({ kind: 'none' });
  });
});
