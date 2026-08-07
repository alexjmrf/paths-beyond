import { describe, expect, it } from 'vitest';
import { evaluateCondition } from '../../src/tactics/evaluateCondition.js';
import type { Condition, ConditionContext, ConditionUnitView } from '../../src/tactics/types.js';

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

describe('evaluateCondition — cada variante de Condition (§6.3)', () => {
  it('targetHpBelow', () => {
    const c: Condition = { t: 'targetHpBelow', pct: 500 };
    expect(evaluateCondition(c, ctx({ target: unit({ currentHpPct: 400 }) }))).toBe(true);
    expect(evaluateCondition(c, ctx({ target: unit({ currentHpPct: 600 }) }))).toBe(false);
  });

  it('targetHpAbove', () => {
    const c: Condition = { t: 'targetHpAbove', pct: 500 };
    expect(evaluateCondition(c, ctx({ target: unit({ currentHpPct: 600 }) }))).toBe(true);
    expect(evaluateCondition(c, ctx({ target: unit({ currentHpPct: 400 }) }))).toBe(false);
  });

  it('targetHasDebuff', () => {
    const c: Condition = { t: 'targetHasDebuff', debuffId: 'poison' };
    expect(evaluateCondition(c, ctx({ target: unit({ activeDebuffIds: ['poison'] }) }))).toBe(true);
    expect(evaluateCondition(c, ctx({ target: unit({ activeDebuffIds: ['burn'] }) }))).toBe(false);
  });

  it('targetHasBuff', () => {
    const c: Condition = { t: 'targetHasBuff', buffId: 'shield' };
    expect(evaluateCondition(c, ctx({ target: unit({ activeBuffIds: ['shield'] }) }))).toBe(true);
    expect(evaluateCondition(c, ctx({ target: unit({ activeBuffIds: [] }) }))).toBe(false);
  });

  it('targetIsType', () => {
    const c: Condition = { t: 'targetIsType', type: 'flying' };
    expect(evaluateCondition(c, ctx({ target: unit({ unitType: 'flying' }) }))).toBe(true);
    expect(evaluateCondition(c, ctx({ target: unit({ unitType: 'infantry' }) }))).toBe(false);
  });

  it('targetWeaponIs', () => {
    const c: Condition = { t: 'targetWeaponIs', weapon: 'bow' };
    expect(evaluateCondition(c, ctx({ target: unit({ weaponType: 'bow' }) }))).toBe(true);
    expect(evaluateCondition(c, ctx({ target: unit({ weaponType: 'sword' }) }))).toBe(false);
  });

  it('targetPpBelow', () => {
    const c: Condition = { t: 'targetPpBelow', n: 1 };
    expect(evaluateCondition(c, ctx({ target: unit({ pp: 0 }) }))).toBe(true);
    expect(evaluateCondition(c, ctx({ target: unit({ pp: 1 }) }))).toBe(false);
  });

  it('selfHpBelow', () => {
    const c: Condition = { t: 'selfHpBelow', pct: 300 };
    expect(evaluateCondition(c, ctx({ self: unit({ currentHpPct: 200 }) }))).toBe(true);
    expect(evaluateCondition(c, ctx({ self: unit({ currentHpPct: 400 }) }))).toBe(false);
  });

  it('selfBuffAbsent', () => {
    const c: Condition = { t: 'selfBuffAbsent', buffId: 'shield' };
    expect(evaluateCondition(c, ctx({ self: unit({ activeBuffIds: [] }) }))).toBe(true);
    expect(evaluateCondition(c, ctx({ self: unit({ activeBuffIds: ['shield'] }) }))).toBe(false);
  });

  it('apAtLeast', () => {
    const c: Condition = { t: 'apAtLeast', n: 2 };
    expect(evaluateCondition(c, ctx({ self: unit({ ap: 2 }) }))).toBe(true);
    expect(evaluateCondition(c, ctx({ self: unit({ ap: 1 }) }))).toBe(false);
  });

  it('ppAtLeast', () => {
    const c: Condition = { t: 'ppAtLeast', n: 1 };
    expect(evaluateCondition(c, ctx({ self: unit({ pp: 1 }) }))).toBe(true);
    expect(evaluateCondition(c, ctx({ self: unit({ pp: 0 }) }))).toBe(false);
  });

  it('isAttacker', () => {
    const c: Condition = { t: 'isAttacker' };
    expect(evaluateCondition(c, ctx({ isSelfAttacker: true }))).toBe(true);
    expect(evaluateCondition(c, ctx({ isSelfAttacker: false }))).toBe(false);
  });

  it('isDefender', () => {
    const c: Condition = { t: 'isDefender' };
    expect(evaluateCondition(c, ctx({ isSelfAttacker: false }))).toBe(true);
    expect(evaluateCondition(c, ctx({ isSelfAttacker: true }))).toBe(false);
  });

  it('hasPositionalBonus', () => {
    const c: Condition = { t: 'hasPositionalBonus' };
    expect(evaluateCondition(c, ctx({ hasPositionalBonus: true }))).toBe(true);
    expect(evaluateCondition(c, ctx({ hasPositionalBonus: false }))).toBe(false);
  });

  it('trocaAtLeast', () => {
    const c: Condition = { t: 'trocaAtLeast', n: 2 };
    expect(evaluateCondition(c, ctx({ trocaNumber: 2 }))).toBe(true);
    expect(evaluateCondition(c, ctx({ trocaNumber: 1 }))).toBe(false);
  });

  it('battleRoundAtLeast', () => {
    const c: Condition = { t: 'battleRoundAtLeast', n: 3 };
    expect(evaluateCondition(c, ctx({ battleRound: 3 }))).toBe(true);
    expect(evaluateCondition(c, ctx({ battleRound: 2 }))).toBe(false);
  });

  it('alliesAdjacentAtLeast', () => {
    const c: Condition = { t: 'alliesAdjacentAtLeast', n: 2 };
    expect(evaluateCondition(c, ctx({ alliesAdjacentCount: 2 }))).toBe(true);
    expect(evaluateCondition(c, ctx({ alliesAdjacentCount: 1 }))).toBe(false);
  });

  it('not — inverte o resultado da condição interna, recursivamente', () => {
    const inner: Condition = { t: 'selfHpBelow', pct: 300 };
    const c: Condition = { t: 'not', c: inner };
    expect(evaluateCondition(c, ctx({ self: unit({ currentHpPct: 200 }) }))).toBe(false);
    expect(evaluateCondition(c, ctx({ self: unit({ currentHpPct: 400 }) }))).toBe(true);

    const doubleNot: Condition = { t: 'not', c };
    expect(evaluateCondition(doubleNot, ctx({ self: unit({ currentHpPct: 200 }) }))).toBe(true);
  });
});
