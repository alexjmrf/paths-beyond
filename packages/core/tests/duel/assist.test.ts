import { describe, expect, it } from 'vitest';
import { ASSIST_DAMAGE_MULTIPLIER, resolveAssists, type AssistCandidate } from '../../src/duel/assist.js';
import type { DuelEconomyState } from '../../src/duel/economy.js';
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

const skills: Record<string, SkillDef> = { [assistSkill.id]: assistSkill };

function candidate(id: string, overrides: Partial<AssistCandidate> = {}): AssistCandidate {
  return {
    id,
    reactionScript: [{ enabled: true, skillId: assistSkill.id, conditions: [] }],
    skills,
    economy: economy(),
    context: ctx(),
    ...overrides,
  };
}

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
