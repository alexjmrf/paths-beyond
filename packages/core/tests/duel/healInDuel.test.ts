import { describe, expect, it } from 'vitest';
import { ASSIST_DAMAGE_MULTIPLIER, type AssistCandidate } from '../../src/duel/assist.js';
import { HEAL_TAG, computeHeal } from '../../src/duel/heal.js';
import { resolveDuel, type ResolveDuelInput } from '../../src/duel/resolveDuel.js';
import type { DuelEngagementContext, DuelParticipant, EffectDef } from '../../src/duel/types.js';
import type { ConditionContext, ConditionUnitView } from '../../src/tactics/types.js';
import type { SkillDef } from '../../src/skills/types.js';
import type { StatSheet } from '../../src/stats/types.js';

// §6.5.3/§6.4 (M10, sub-sessão 7/N) — os três caminhos por onde cura chega a HP dentro de
// um duelo: assistência de cura (item nomeado no roadmap), skill de duelo com a tag `heal`
// (auto-cura — num 1v1 não existe aliado pra mirar) e reação com a tag `heal` ("Cura de
// emergência", §6.4). Fixtures com spd 100 dos dois lados (evasão 0, sem preempção): todo
// golpe acerta, então nenhuma asserção depende de rolagem de acerto.

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

// Auto-cura: skill de duelo com a tag. Num 1v1 não há aliado, então o alvo é o próprio ator.
const selfHeal: SkillDef = {
  id: 'skill-auto-cura', name: 'Fôlego', kind: 'duel', apCost: 0, cooldown: 0,
  multiplier: 1000, flat: 0, scalesWith: 'atk', effects: [], tags: [HEAL_TAG],
};

// §6.4 — "Cura de emergência" entre as reações que classes e talentos adicionam.
const healReaction: SkillDef = {
  id: 'skill-cura-emergencia', name: 'Cura de Emergência', kind: 'reaction',
  apCost: 0, ppCost: 1, cooldown: 0,
  multiplier: 800, flat: 0, scalesWith: 'atk', effects: [], trigger: 'onAttacked', tags: [HEAL_TAG],
};

const counterAttack: SkillDef = {
  id: 'skill-contra-ataque', name: 'Contra-ataque', kind: 'reaction',
  apCost: 0, ppCost: 1, cooldown: 0,
  multiplier: 800, flat: 0, scalesWith: 'atk', effects: [], trigger: 'onAttacked', tags: ['physical'],
};

const assistHeal: SkillDef = {
  id: 'skill-assistir-cura', name: 'Apoio Curativo', kind: 'reaction',
  apCost: 0, ppCost: 1, cooldown: 0,
  multiplier: 1000, flat: 0, scalesWith: 'atk', effects: [],
  trigger: 'onAllyEngagedNearby', tags: [HEAL_TAG],
};

const assistStrike: SkillDef = {
  id: 'skill-assistir-golpe', name: 'Apoio Ofensivo', kind: 'reaction',
  apCost: 0, ppCost: 1, cooldown: 0,
  multiplier: 1000, flat: 0, scalesWith: 'atk', effects: [],
  trigger: 'onAllyEngagedNearby', tags: ['physical'],
};

const effectDefs: Readonly<Record<string, EffectDef>> = {};

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

function unitView(overrides: Partial<ConditionUnitView> = {}): ConditionUnitView {
  return {
    currentHpPct: 1000, ap: 2, pp: 2, unitType: 'infantry', weaponType: 'sword',
    activeBuffIds: [], activeDebuffIds: [], ...overrides,
  };
}

function assistContext(): ConditionContext {
  return {
    self: unitView(), target: unitView(), isSelfAttacker: true,
    hasPositionalBonus: false, trocaNumber: 1, battleRound: 1, alliesAdjacentCount: 0,
  };
}

function assistant(skill: SkillDef, overrides: Partial<AssistCandidate> = {}): AssistCandidate {
  return {
    id: 'ally-1',
    reactionScript: [{ enabled: true, skillId: skill.id, conditions: [] }],
    skills: { [skill.id]: skill },
    economy: { pools: { ap: 2, pp: 2 }, apSpentThisDuel: 0, ppSpentThisTroca: 0 },
    context: assistContext(),
    stats: statSheet(),
    unitType: 'infantry',
    weaponType: 'sword',
    activeEffects: [],
    ...overrides,
  };
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

describe('assistência de cura — §6.5.3 ("cura/buff em efeito integral")', () => {
  // Atacante ferido, pra a cura ter espaço e ser observável no HP final.
  const woundedAttacker = participant({ id: 'hero-a', currentHp: 10000 });

  it('cura o ALIADO duelista, não o inimigo do duelo', () => {
    const semAssistencia = resolveDuel(baseInput({ attacker: woundedAttacker }));
    const comAssistencia = resolveDuel(
      baseInput({ attacker: woundedAttacker, attackerAssistCandidates: [assistant(assistHeal)] }),
    );
    expect(comAssistencia.finalHpAttacker).toBeGreaterThan(semAssistencia.finalHpAttacker);
    // O inimigo não é tocado pela cura — só pelo que aconteceu nas trocas.
    expect(comAssistencia.finalHpDefender).toBe(semAssistencia.finalHpDefender);
  });

  it('NÃO sofre o corte de 50% que o dano de assistência leva (§6.5.3)', () => {
    const result = resolveDuel(
      baseInput({ attacker: woundedAttacker, attackerAssistCandidates: [assistant(assistHeal)] }),
    );
    const esperado = computeHeal({
      healerStat: statSheet().atk,
      skill: { multiplier: assistHeal.multiplier, flat: assistHeal.flat },
      healerHeal: statSheet().heal,
    });
    expect(result.attackerAssists[0]?.healDone).toBe(esperado);
    // A prova de que é "integral": o valor NÃO é o que sairia com o multiplicador de 50%.
    expect(result.attackerAssists[0]?.healDone).not.toBe(Math.trunc((esperado * ASSIST_DAMAGE_MULTIPLIER) / 1000));
  });

  it('uma assistência de cura não causa dano nenhum', () => {
    const result = resolveDuel(
      baseInput({ attacker: woundedAttacker, attackerAssistCandidates: [assistant(assistHeal)] }),
    );
    expect(result.attackerAssists[0]?.damageDealt).toBe(0);
  });

  it('uma assistência ofensiva continua com healDone 0 (nada regrediu)', () => {
    const result = resolveDuel(baseInput({ attackerAssistCandidates: [assistant(assistStrike)] }));
    expect(result.attackerAssists[0]?.damageDealt).toBeGreaterThan(0);
    expect(result.attackerAssists[0]?.healDone).toBe(0);
  });

  it('cura do lado do defensor cura o defensor', () => {
    const woundedDefender = participant({ id: 'hero-b', currentHp: 10000 });
    const sem = resolveDuel(baseInput({ defender: woundedDefender }));
    const com = resolveDuel(
      baseInput({ defender: woundedDefender, defenderAssistCandidates: [assistant(assistHeal)] }),
    );
    expect(com.finalHpDefender).toBeGreaterThan(sem.finalHpDefender);
  });

  it('cura nunca passa do HP máximo', () => {
    const quaseCheio = participant({ id: 'hero-a', currentHp: 29990 });
    const result = resolveDuel(
      baseInput({
        attacker: quaseCheio,
        defender: participant({ id: 'hero-b', tacticsScript: [] }), // defensor não revida
        attackerAssistCandidates: [assistant(assistHeal)],
      }),
    );
    expect(result.finalHpAttacker).toBeLessThanOrEqual(statSheet().hp);
  });

  it('determinismo: mesma seed, mesmo resultado', () => {
    const make = (): ResolveDuelInput =>
      baseInput({ attacker: woundedAttacker, attackerAssistCandidates: [assistant(assistHeal)] });
    expect(JSON.stringify(resolveDuel(make()))).toBe(JSON.stringify(resolveDuel(make())));
  });
});

describe('skill de duelo com a tag `heal` — auto-cura', () => {
  const healer = participant({
    id: 'hero-a',
    currentHp: 10000,
    tacticsScript: [{ enabled: true, skillId: selfHeal.id, conditions: [] }],
    knownSkills: { [selfHeal.id]: selfHeal },
  });

  it('cura o próprio ator e não causa dano no oponente', () => {
    const result = resolveDuel(baseInput({
      attacker: healer,
      defender: participant({ id: 'hero-b', tacticsScript: [] }), // não revida: isola o efeito
    }));
    const acao = result.trocas[0]?.actions.find((a) => a.actorId === 'hero-a');
    expect(acao?.heal).toBeGreaterThan(0);
    expect(acao?.damage).toBe(0);
    expect(result.finalHpDefender).toBe(30000);
    expect(result.finalHpAttacker).toBeGreaterThan(10000);
  });

  it('o valor curado bate exatamente com computeHeal', () => {
    const result = resolveDuel(baseInput({
      attacker: healer,
      defender: participant({ id: 'hero-b', tacticsScript: [] }),
    }));
    const acao = result.trocas[0]?.actions.find((a) => a.actorId === 'hero-a');
    expect(acao?.heal).toBe(
      computeHeal({ healerStat: statSheet().atk, skill: { multiplier: selfHeal.multiplier, flat: selfHeal.flat }, healerHeal: 0 }),
    );
  });

  it('o stat `heal` do curador aumenta a cura', () => {
    const buffado = { ...healer, stats: statSheet({ heal: 500 }) };
    const normal = resolveDuel(baseInput({ attacker: healer, defender: participant({ id: 'hero-b', tacticsScript: [] }) }));
    const comHeal = resolveDuel(baseInput({ attacker: buffado, defender: participant({ id: 'hero-b', tacticsScript: [] }) }));
    const acaoNormal = normal.trocas[0]?.actions.find((a) => a.actorId === 'hero-a');
    const acaoComHeal = comHeal.trocas[0]?.actions.find((a) => a.actorId === 'hero-a');
    expect(acaoComHeal!.heal).toBeGreaterThan(acaoNormal!.heal);
  });

  it('uma skill de dano normal continua com heal 0 (nada regrediu)', () => {
    const result = resolveDuel(baseInput());
    const acao = result.trocas[0]?.actions.find((a) => a.actorId === 'hero-a');
    expect(acao?.heal).toBe(0);
    expect(acao?.damage).toBeGreaterThan(0);
  });
});

describe('reação com a tag `heal` — "Cura de emergência" (§6.4)', () => {
  const healingDefender = participant({
    id: 'hero-b',
    currentHp: 10000,
    reactionScript: [{ enabled: true, skillId: healReaction.id, conditions: [] }],
    knownSkills: { [strike.id]: strike, [healReaction.id]: healReaction },
  });

  it('cura o reagente em vez de contra-atacar', () => {
    const result = resolveDuel(baseInput({ defender: healingDefender }));
    const reacao = result.trocas[0]?.actions.find((a) => a.reaction !== null)?.reaction;
    expect(reacao?.skillId).toBe(healReaction.id);
    expect(reacao?.healDone).toBeGreaterThan(0);
    expect(reacao?.counterDamage).toBeNull();
  });

  it('o atacante não leva contra-dano de uma reação de cura', () => {
    const comCura = resolveDuel(baseInput({ defender: healingDefender }));
    const comContra = resolveDuel(baseInput({
      defender: { ...healingDefender, reactionScript: [{ enabled: true, skillId: counterAttack.id, conditions: [] }], knownSkills: { [strike.id]: strike, [counterAttack.id]: counterAttack } },
    }));
    expect(comCura.finalHpAttacker).toBeGreaterThan(comContra.finalHpAttacker);
  });

  it('gasta o PP da reação normalmente', () => {
    const result = resolveDuel(baseInput({ defender: healingDefender }));
    expect(result.finalPpDefender).toBeLessThan(healingDefender.pp);
  });

  it('uma reação de dano continua com healDone null (nada regrediu)', () => {
    const result = resolveDuel(baseInput({
      defender: participant({
        id: 'hero-b',
        reactionScript: [{ enabled: true, skillId: counterAttack.id, conditions: [] }],
        knownSkills: { [strike.id]: strike, [counterAttack.id]: counterAttack },
      }),
    }));
    const reacao = result.trocas[0]?.actions.find((a) => a.reaction !== null)?.reaction;
    expect(reacao?.counterDamage).toBeGreaterThan(0);
    expect(reacao?.healDone).toBeNull();
  });

  it('determinismo: mesma seed, mesmo resultado', () => {
    const a = resolveDuel(baseInput({ defender: healingDefender }));
    const b = resolveDuel(baseInput({ defender: healingDefender }));
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});
