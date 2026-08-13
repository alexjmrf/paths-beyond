import { describe, expect, it } from 'vitest';
import type { AssistCandidate } from '../../src/duel/assist.js';
import { LETHAL_SURVIVE_HP, LETHAL_SURVIVE_TAG } from '../../src/duel/lethal.js';
import { resolveDuel, type ResolveDuelInput } from '../../src/duel/resolveDuel.js';
import type { DuelEngagementContext, DuelParticipant, EffectDef } from '../../src/duel/types.js';
import type { ConditionContext, ConditionUnitView } from '../../src/tactics/types.js';
import type { SkillDef } from '../../src/skills/types.js';
import type { StatSheet } from '../../src/stats/types.js';

// §6.4 (M10, sub-sessão 8/N) — gatilho de morte. Duas variantes discriminadas pela tag
// `survive`: prevenir a morte (fica com 1 HP) ou fazer um efeito ao morrer (a skill acerta
// quem deu o golpe fatal). Fixtures com spd 100 dos dois lados (evasão 0, sem preempção):
// todo golpe acerta, então nenhuma asserção depende de rolagem de acerto.

function statSheet(overrides: Partial<StatSheet> = {}): StatSheet {
  return {
    hp: 30000, atk: 1000, def: 300, spd: 100, chc: 0, chd: 1500,
    eff: 0, efr: 0, pen: 0, heal: 0, lifesteal: 0, focus: 0, vigor: 0,
    ...overrides,
  };
}

const strike: SkillDef = {
  id: 'skill-strike', name: 'Golpe', kind: 'duel', apCost: 0, cooldown: 0,
  multiplier: 1200, flat: 0, scalesWith: 'atk', effects: [], tags: ['physical'],
};

// Variante "prevenir": sem componente de dano nenhum, só a tag.
const lastStand: SkillDef = {
  id: 'skill-ultimo-suspiro', name: 'Último Suspiro', kind: 'duel', apCost: 0, cooldown: 0,
  multiplier: 0, flat: 0, scalesWith: 'atk', effects: [],
  trigger: 'onLethal', lethalUses: 'perDuel', tags: [LETHAL_SURVIVE_TAG],
};

const lastStandPerBattle: SkillDef = { ...lastStand, id: 'skill-teimosia', name: 'Teimosia', lethalUses: 'perBattle' };

// Variante "efeito ao morrer": acerta quem deu o golpe fatal.
const deathBlast: SkillDef = {
  id: 'skill-explosao', name: 'Explosão Final', kind: 'duel', apCost: 0, cooldown: 0,
  multiplier: 1500, flat: 0, scalesWith: 'atk', effects: [],
  trigger: 'onLethal', lethalUses: 'perBattle', tags: ['physical'],
};

const curseId = 'effect-maldicao';
const deathCurse: SkillDef = {
  ...deathBlast,
  id: 'skill-maldicao', name: 'Maldição Final', multiplier: 0,
  effects: [{ effectId: curseId, target: 'target', chance: 1000, duration: 'battle' }],
};

const assistStrike: SkillDef = {
  id: 'skill-assistir-golpe', name: 'Apoio Ofensivo', kind: 'reaction',
  apCost: 0, ppCost: 1, cooldown: 0,
  multiplier: 1000, flat: 0, scalesWith: 'atk', effects: [],
  trigger: 'onAllyEngagedNearby', tags: ['physical'],
};

const effectDefs: Readonly<Record<string, EffectDef>> = {
  [curseId]: {
    id: curseId, name: 'Maldição', kind: 'debuff', dispellable: true, maxStacks: 1,
    statMods: [{ stat: 'atk', pct: -200 }],
  },
};

const engagement: DuelEngagementContext = {
  engagementDistance: 1,
  terrainAccuracyModifier: 0,
  heightAccuracyModifier: 0,
  defenderEvasionModifier: 0,
  battleRound: 1,
};

function participant(overrides: Partial<DuelParticipant> = {}): DuelParticipant {
  return {
    id: 'p1',
    stats: statSheet(),
    currentHp: 30000,
    ap: 5,
    pp: 2,
    unitType: 'infantry',
    weaponType: 'sword',
    duelRange: 1,
    tacticsScript: [{ enabled: true, skillId: strike.id, conditions: [] }],
    reactionScript: [],
    knownSkills: { [strike.id]: strike },
    cooldowns: {},
    activeEffects: [],
    positionalMultiplier: 1000,
    ...overrides,
  };
}

// Alvo prestes a morrer: qualquer golpe destas fixtures (~900 de dano) é letal.
function dying(overrides: Partial<DuelParticipant> = {}): DuelParticipant {
  return participant({ id: 'hero-b', currentHp: 100, ...overrides });
}

function withSkill(p: DuelParticipant, skill: SkillDef): DuelParticipant {
  return { ...p, knownSkills: { ...p.knownSkills, [skill.id]: skill } };
}

function baseInput(overrides: Partial<ResolveDuelInput> = {}): ResolveDuelInput {
  return {
    seed: 42,
    attacker: participant({ id: 'hero-a' }),
    defender: participant({ id: 'hero-b' }),
    effectDefs,
    engagement,
    ...overrides,
  };
}

function unitView(overrides: Partial<ConditionUnitView> = {}): ConditionUnitView {
  return {
    currentHpPct: 1000, ap: 2, pp: 2, unitType: 'infantry', weaponType: 'sword',
    activeBuffIds: [], activeDebuffIds: [], ...overrides,
  };
}

function assistant(skill: SkillDef): AssistCandidate {
  return {
    id: 'ally-1',
    reactionScript: [{ enabled: true, skillId: skill.id, conditions: [] }],
    skills: { [skill.id]: skill },
    economy: { pools: { ap: 2, pp: 2 }, apSpentThisDuel: 0, ppSpentThisTroca: 0 },
    context: {
      self: unitView(), target: unitView(), isSelfAttacker: false,
      hasPositionalBonus: false, trocaNumber: 1, battleRound: 1, alliesAdjacentCount: 0,
    },
    stats: statSheet(),
    unitType: 'infantry',
    weaponType: 'sword',
    activeEffects: [],
  };
}

describe('variante `survive` — prevenir a morte', () => {
  it('sem o gatilho, o golpe letal mata (controle)', () => {
    const result = resolveDuel(baseInput({ defender: dying() }));
    expect(result.finalHpDefender).toBe(0);
    expect(result.winnerId).toBe('hero-a');
    expect(result.trocas).toHaveLength(1);
    expect(result.lethalTriggers).toHaveLength(0);
  });

  it('com o gatilho, sobrevive ao golpe letal e o duelo continua', () => {
    const result = resolveDuel(baseInput({ defender: withSkill(dying(), lastStand) }));
    expect(result.lethalTriggers).toHaveLength(1);
    expect(result.lethalTriggers[0]).toMatchObject({
      unitId: 'hero-b',
      skillId: lastStand.id,
      survived: true,
      trocaNumber: 1,
      damageToKiller: null,
    });
    // Sobreviveu à troca 1 — o duelo chega à troca 2, que o controle acima nunca alcança.
    expect(result.trocas.length).toBeGreaterThan(1);
  });

  it('dispara UMA vez: o segundo golpe letal do mesmo duelo mata', () => {
    const result = resolveDuel(baseInput({ defender: withSkill(dying(), lastStand) }));
    expect(result.lethalTriggers).toHaveLength(1);
    expect(result.finalHpDefender).toBe(0);
    expect(result.winnerId).toBe('hero-a');
  });

  it('deixa exatamente 1 HP (§ decisão: o golpe é truncado, não anulado)', () => {
    // Assimetria ranged (§6.1): o defensor não age, então nada mais toca o atacante depois
    // que a assistência dele quase o mata — o HP final é o do gatilho, isolado.
    const result = resolveDuel(baseInput({
      attacker: withSkill(participant({ id: 'hero-a', currentHp: 100, duelRange: 3 }), lastStand),
      defender: participant({ id: 'hero-b', duelRange: 1 }),
      engagement: { ...engagement, engagementDistance: 3 },
      defenderAssistCandidates: [assistant(assistStrike)],
    }));
    expect(result.finalHpAttacker).toBe(LETHAL_SURVIVE_HP);
  });

  it('vale para morte por dano de ASSISTÊNCIA (janela anterior à troca 1)', () => {
    const almostDead = participant({ id: 'hero-a', currentHp: 100, duelRange: 3 });
    const input = (attacker: DuelParticipant): ResolveDuelInput => baseInput({
      attacker,
      defender: participant({ id: 'hero-b', duelRange: 1 }),
      engagement: { ...engagement, engagementDistance: 3 },
      defenderAssistCandidates: [assistant(assistStrike)],
    });
    const sem = resolveDuel(input(almostDead));
    const com = resolveDuel(input(withSkill(almostDead, lastStand)));
    expect(sem.finalHpAttacker).toBe(0);
    expect(com.finalHpAttacker).toBe(LETHAL_SURVIVE_HP);
    // Fora de qualquer troca: a janela de assistências não tem número de troca.
    expect(com.lethalTriggers[0]?.trocaNumber).toBeNull();
  });

  it('vale para morte por CONTRA-ATAQUE', () => {
    const counter: SkillDef = {
      id: 'skill-contra-ataque', name: 'Contra-ataque', kind: 'reaction',
      apCost: 0, ppCost: 1, cooldown: 0, multiplier: 1000, flat: 0, scalesWith: 'atk',
      effects: [], trigger: 'onAttacked', tags: ['physical'],
    };
    const defenderThatCounters = participant({
      id: 'hero-b',
      reactionScript: [{ enabled: true, skillId: counter.id, conditions: [] }],
      knownSkills: { [strike.id]: strike, [counter.id]: counter },
    });
    const attackerAlmostDead = participant({ id: 'hero-a', currentHp: 100 });

    const sem = resolveDuel(baseInput({ attacker: attackerAlmostDead, defender: defenderThatCounters }));
    const com = resolveDuel(baseInput({
      attacker: withSkill(attackerAlmostDead, lastStand),
      defender: defenderThatCounters,
    }));
    expect(sem.finalHpAttacker).toBe(0);
    expect(com.lethalTriggers[0]).toMatchObject({ unitId: 'hero-a', survived: true });
  });

  it('não dispara em dano não-letal', () => {
    const result = resolveDuel(baseInput({ defender: withSkill(participant({ id: 'hero-b' }), lastStand) }));
    expect(result.lethalTriggers).toHaveLength(0);
  });

  it('não dispara se a skill já foi usada nesta batalha (`perBattle`)', () => {
    const result = resolveDuel(baseInput({
      defender: { ...withSkill(dying(), lastStandPerBattle), lethalTriggersUsed: [lastStandPerBattle.id] },
    }));
    expect(result.lethalTriggers).toHaveLength(0);
    expect(result.finalHpDefender).toBe(0);
  });
});

describe('variante sem a tag — efeito ao morrer', () => {
  it('a morte acontece e o matador leva o dano da skill', () => {
    const sem = resolveDuel(baseInput({ defender: dying() }));
    const com = resolveDuel(baseInput({ defender: withSkill(dying(), deathBlast) }));

    expect(com.finalHpDefender).toBe(0); // não previne
    expect(com.winnerId).toBe('hero-a');
    expect(com.finalHpAttacker).toBeLessThan(sem.finalHpAttacker);
    expect(com.lethalTriggers[0]).toMatchObject({
      unitId: 'hero-b',
      skillId: deathBlast.id,
      survived: false,
      trocaNumber: 1,
    });
    expect(com.lethalTriggers[0]?.damageToKiller).toBeGreaterThan(0);
  });

  it('aplica os `skill.effects` no matador', () => {
    const result = resolveDuel(baseInput({ defender: withSkill(dying(), deathCurse) }));
    expect(result.lethalTriggers[0]?.effectsApplied).toEqual([curseId]);
    expect(result.finalActiveEffectsAttacker.map((e) => e.id)).toContain(curseId);
    // Sem componente de dano, `damageToKiller` é null — simétrico a `counterDamage`.
    expect(result.lethalTriggers[0]?.damageToKiller).toBeNull();
  });

  it('NÃO encadeia: matar o matador não dispara o gatilho DELE', () => {
    const result = resolveDuel(baseInput({
      attacker: withSkill(participant({ id: 'hero-a', currentHp: 100 }), lastStand),
      defender: withSkill(dying(), deathBlast),
    }));
    expect(result.finalHpDefender).toBe(0);
    expect(result.finalHpAttacker).toBe(0); // a explosão matou o atacante
    expect(result.lethalTriggers).toHaveLength(1);
    expect(result.lethalTriggers[0]?.skillId).toBe(deathBlast.id);
    expect(result.winnerId).toBeNull();
  });

  it('não dispara em morte por assistência — não há matador identificável', () => {
    const result = resolveDuel(baseInput({
      attacker: withSkill(participant({ id: 'hero-a', currentHp: 100, duelRange: 3 }), deathBlast),
      defender: participant({ id: 'hero-b', duelRange: 1 }),
      engagement: { ...engagement, engagementDistance: 3 },
      defenderAssistCandidates: [assistant(assistStrike)],
    }));
    expect(result.finalHpAttacker).toBe(0);
    expect(result.lethalTriggers).toHaveLength(0);
  });
});

describe('frequência declarada no dado (`lethalUses`)', () => {
  it('`perBattle` sai no resultado para a camada de batalha persistir', () => {
    const result = resolveDuel(baseInput({ defender: withSkill(dying(), lastStandPerBattle) }));
    expect(result.finalLethalTriggersUsedDefender).toEqual([lastStandPerBattle.id]);
  });

  it('`perDuel` NÃO sai — recarrega no duelo seguinte', () => {
    const result = resolveDuel(baseInput({ defender: withSkill(dying(), lastStand) }));
    expect(result.lethalTriggers).toHaveLength(1); // disparou de fato
    expect(result.finalLethalTriggersUsedDefender).toEqual([]);
  });

  it('preserva o que já vinha usado de duelos anteriores', () => {
    const result = resolveDuel(baseInput({
      defender: { ...withSkill(dying(), lastStandPerBattle), lethalTriggersUsed: [lastStandPerBattle.id] },
    }));
    expect(result.finalLethalTriggersUsedDefender).toEqual([lastStandPerBattle.id]);
  });

  it('o lado sem gatilho nenhum devolve lista vazia', () => {
    const result = resolveDuel(baseInput({ defender: dying() }));
    expect(result.finalLethalTriggersUsedAttacker).toEqual([]);
    expect(result.finalLethalTriggersUsedDefender).toEqual([]);
  });
});

describe('determinismo', () => {
  it('mesma seed → resultado idêntico (variante survive)', () => {
    const make = (): ResolveDuelInput => baseInput({ defender: withSkill(dying(), lastStand) });
    expect(JSON.stringify(resolveDuel(make()))).toBe(JSON.stringify(resolveDuel(make())));
  });

  it('mesma seed → resultado idêntico (variante de dano, que rola crítico e variância)', () => {
    const make = (): ResolveDuelInput => baseInput({ defender: withSkill(dying(), deathBlast) });
    expect(JSON.stringify(resolveDuel(make()))).toBe(JSON.stringify(resolveDuel(make())));
  });

  it('adicionar o gatilho não desloca as rolagens de quem não o tem', () => {
    // Streams de RNG são por (seed, troca, unitId, purpose): um purpose novo não pode
    // mudar o resultado de um duelo sem gatilho nenhum.
    const semGatilho = resolveDuel(baseInput({ defender: participant({ id: 'hero-b' }) }));
    expect(semGatilho.finalHpDefender).toBe(
      resolveDuel(baseInput({ defender: participant({ id: 'hero-b' }) })).finalHpDefender,
    );
  });
});
