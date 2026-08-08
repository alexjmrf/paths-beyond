import { describe, expect, it } from 'vitest';
import { ASSIST_DAMAGE_MULTIPLIER, applyAssistDamage, resolveAssists, type AssistCandidate } from '../../src/duel/assist.js';
import { computeDamage, isCriticalHit, rollDamageVariance } from '../../src/duel/damage.js';
import { combinedTypeDamageMultiplier } from '../../src/duel/triangle.js';
import type { DuelEconomyState } from '../../src/duel/economy.js';
import type { EffectDef } from '../../src/duel/types.js';
import { fpMul } from '../../src/math/fixed.js';
import { rngFor } from '../../src/rng/rngFor.js';
import { nextUint32 } from '../../src/rng/xoshiro128.js';
import type { ConditionContext, ConditionUnitView } from '../../src/tactics/types.js';
import type { SkillDef } from '../../src/skills/types.js';
import type { StatSheet } from '../../src/stats/types.js';

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

function economy(overrides: Partial<DuelEconomyState> = {}): DuelEconomyState {
  return { pools: { ap: 2, pp: 2 }, apSpentThisDuel: 0, ppSpentThisTroca: 0, ...overrides };
}

const assistSkill: SkillDef = {
  id: 'skill-assist-strike',
  name: 'Golpe de Apoio',
  kind: 'reaction',
  apCost: 0,
  ppCost: 1,
  cooldown: 0,
  multiplier: 1000,
  flat: 0,
  scalesWith: 'atk',
  effects: [],
  trigger: 'onAllyEngagedNearby',
  tags: ['physical'],
};

// §6.5.3 (M10) — assistência sem componente de dano (heal/buff): contribui 0 dano.
const assistHealSkill: SkillDef = {
  id: 'skill-assist-heal',
  name: 'Apoio de Cura',
  kind: 'reaction',
  apCost: 0,
  ppCost: 1,
  cooldown: 0,
  multiplier: 0,
  flat: 0,
  scalesWith: 'atk',
  effects: [],
  trigger: 'onAllyEngagedNearby',
  tags: ['heal'],
};

const skills: Record<string, SkillDef> = { [assistSkill.id]: assistSkill, [assistHealSkill.id]: assistHealSkill };

function statSheet(overrides: Partial<StatSheet> = {}): StatSheet {
  return {
    hp: 5000, atk: 1000, def: 300, spd: 100, chc: 0, chd: 1500,
    eff: 0, efr: 0, pen: 0, heal: 0, lifesteal: 0, focus: 0, vigor: 0,
    ...overrides,
  };
}

function candidate(id: string, overrides: Partial<AssistCandidate> = {}): AssistCandidate {
  return {
    id,
    reactionScript: [{ enabled: true, skillId: assistSkill.id, conditions: [] }],
    skills,
    economy: economy(),
    context: ctx(),
    stats: statSheet(),
    unitType: 'infantry',
    weaponType: 'sword',
    activeEffects: [],
    ...overrides,
  };
}

interface AssistTargetForTest {
  readonly stats: StatSheet;
  readonly unitType: 'infantry';
  readonly weaponType: 'sword';
  readonly activeEffects: readonly [];
}

function target(overrides: Partial<StatSheet> = {}): AssistTargetForTest {
  return { stats: statSheet(overrides), unitType: 'infantry', weaponType: 'sword', activeEffects: [] };
}

const noEffectDefs: Readonly<Record<string, EffectDef>> = {};

describe('resolveAssists — §6.5', () => {
  it('nenhum candidato assiste quando a lista está vazia', () => {
    expect(resolveAssists([])).toEqual([]);
  });

  it('um candidato elegível assiste, gastando a reação onAllyEngagedNearby', () => {
    const result = resolveAssists([candidate('ally-1')]);
    expect(result).toEqual([{ assistantId: 'ally-1', skillId: assistSkill.id }]);
  });

  it('candidato sem PP não assiste', () => {
    const result = resolveAssists([candidate('ally-1', { economy: economy({ pools: { ap: 2, pp: 0 } }) })]);
    expect(result).toEqual([]);
  });

  it('teto de 2 assistências por lado, por duelo (critério de aceite nomeado do M2)', () => {
    const result = resolveAssists([candidate('ally-1'), candidate('ally-2'), candidate('ally-3')]);
    expect(result).toHaveLength(2);
    expect(result.map((r) => r.assistantId)).toEqual(['ally-1', 'ally-2']);
  });

  it('prioridade segue a ordem da lista recebida (já ordenada por iniciativa por quem chama)', () => {
    const result = resolveAssists([candidate('ally-2'), candidate('ally-1')]);
    expect(result.map((r) => r.assistantId)).toEqual(['ally-2', 'ally-1']);
  });

  it('candidato cujas conditions não passam é pulado sem consumir vaga do teto', () => {
    const blocked = candidate('ally-1', {
      reactionScript: [
        { enabled: true, skillId: assistSkill.id, conditions: [{ t: 'targetHpBelow', pct: 100 }] },
      ],
    });
    const eligible = candidate('ally-2');
    const result = resolveAssists([blocked, eligible]);
    expect(result).toEqual([{ assistantId: 'ally-2', skillId: assistSkill.id }]);
  });

  it('ASSIST_DAMAGE_MULTIPLIER é 50% (§6.5.3: dano de assistência é reduzido pela metade)', () => {
    expect(ASSIST_DAMAGE_MULTIPLIER).toBe(500);
  });
});

describe('applyAssistDamage — §6.5.3 (M10: dano de assistência aplicado a HP de verdade)', () => {
  it('assistência ofensiva causa dano positivo contra o alvo', () => {
    const results = resolveAssists([candidate('ally-1')]);
    const outcome = applyAssistDamage({
      seed: 42,
      sideLabel: 'attacker-assist',
      results,
      candidates: [candidate('ally-1')],
      target: target(),
      effectDefs: noEffectDefs,
    });
    expect(outcome.totalDamage).toBeGreaterThan(0);
    expect(outcome.results).toEqual([{ assistantId: 'ally-1', skillId: assistSkill.id, damageDealt: outcome.totalDamage }]);
  });

  it('assistência sem componente de dano (heal/buff) contribui 0 dano', () => {
    const healCandidate = candidate('ally-1', {
      reactionScript: [{ enabled: true, skillId: assistHealSkill.id, conditions: [] }],
    });
    const results = resolveAssists([healCandidate]);
    const outcome = applyAssistDamage({
      seed: 42,
      sideLabel: 'attacker-assist',
      results,
      candidates: [healCandidate],
      target: target(),
      effectDefs: noEffectDefs,
    });
    expect(outcome.totalDamage).toBe(0);
    expect(outcome.results).toEqual([{ assistantId: 'ally-1', skillId: assistHealSkill.id, damageDealt: 0 }]);
  });

  it('soma o dano de até 2 assistentes', () => {
    const results = resolveAssists([candidate('ally-1'), candidate('ally-2')]);
    const outcome = applyAssistDamage({
      seed: 42,
      sideLabel: 'attacker-assist',
      results,
      candidates: [candidate('ally-1'), candidate('ally-2')],
      target: target(),
      effectDefs: noEffectDefs,
    });
    expect(outcome.results).toHaveLength(2);
    const sum = outcome.results.reduce((total, r) => total + r.damageDealt, 0);
    expect(outcome.totalDamage).toBe(sum);
    expect(sum).toBeGreaterThan(outcome.results[0]!.damageDealt); // os dois contribuem
  });

  it('bate exatamente com computeDamage × ASSIST_DAMAGE_MULTIPLIER, usando a mesma convenção de rng (round=0, purpose sideLabel:crit/damage-variance)', () => {
    const results = resolveAssists([candidate('ally-1')]);
    const outcome = applyAssistDamage({
      seed: 42,
      sideLabel: 'attacker-assist',
      results,
      candidates: [candidate('ally-1')],
      target: target(),
      effectDefs: noEffectDefs,
    });

    const critRoll = nextUint32(rngFor(42, 0, 'ally-1', 'attacker-assist:crit')).value % 1000;
    const isCrit = isCriticalHit(critRoll, 0); // chc=0 do candidato de teste
    const varianceRoll = rollDamageVariance(nextUint32(rngFor(42, 0, 'ally-1', 'attacker-assist:damage-variance')).value);
    const triangle = combinedTypeDamageMultiplier({
      attackerWeapon: 'sword',
      defenderWeapon: 'sword',
      defenderUnitType: 'infantry',
      skillTags: assistSkill.tags,
    });
    const rawDamage = computeDamage({
      attackerAtk: 1000,
      attackerDef: 300,
      attackerHp: 5000,
      defenderDef: 300,
      skill: { multiplier: assistSkill.multiplier, flat: assistSkill.flat, scalesWith: assistSkill.scalesWith },
      attackerPen: 0,
      typeDamageMultiplier: triangle,
      positionalMultiplier: 1000,
      isCriticalHit: isCrit,
      criticalDamageMultiplier: 1500,
      damageDealtPctSum: 0,
      damageTakenReductionPctSum: 0,
      varianceRoll,
    });
    const expectedDamage = Math.max(1, fpMul(rawDamage, ASSIST_DAMAGE_MULTIPLIER));

    expect(outcome.totalDamage).toBe(expectedDamage);
    expect(expectedDamage).toBeLessThan(rawDamage); // prova que a redução de 50% de fato aconteceu
  });

  it('nunca aplica dano a um assistente sem candidato correspondente (id não encontrado) — entrada preservada com damageDealt 0', () => {
    const outcome = applyAssistDamage({
      seed: 42,
      sideLabel: 'attacker-assist',
      results: [{ assistantId: 'fantasma', skillId: assistSkill.id }],
      candidates: [],
      target: target(),
      effectDefs: noEffectDefs,
    });
    expect(outcome.totalDamage).toBe(0);
    expect(outcome.results).toEqual([{ assistantId: 'fantasma', skillId: assistSkill.id, damageDealt: 0 }]);
  });

  it('determinístico: mesma seed produz o mesmo dano', () => {
    const results = resolveAssists([candidate('ally-1')]);
    const a = applyAssistDamage({
      seed: 7,
      sideLabel: 'attacker-assist',
      results,
      candidates: [candidate('ally-1')],
      target: target(),
      effectDefs: noEffectDefs,
    });
    const b = applyAssistDamage({
      seed: 7,
      sideLabel: 'attacker-assist',
      results,
      candidates: [candidate('ally-1')],
      target: target(),
      effectDefs: noEffectDefs,
    });
    expect(a).toEqual(b);
  });
});
