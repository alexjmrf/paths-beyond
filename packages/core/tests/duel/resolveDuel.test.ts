import { describe, expect, it } from 'vitest';
import { resolveDuel, type ResolveDuelInput } from '../../src/duel/resolveDuel.js';
import type { DuelEngagementContext, DuelParticipant, EffectDef } from '../../src/duel/types.js';
import type { SkillDef } from '../../src/skills/types.js';
import type { StatSheet } from '../../src/stats/types.js';

function statSheet(overrides: Partial<StatSheet> = {}): StatSheet {
  return {
    hp: 5000,
    atk: 1000,
    def: 300,
    spd: 100,
    chc: 0,
    chd: 1500,
    eff: 0,
    efr: 0,
    pen: 0,
    heal: 0,
    lifesteal: 0,
    focus: 0,
    vigor: 0,
    ...overrides,
  };
}

const strike: SkillDef = {
  id: 'skill-strike',
  name: 'Golpe',
  kind: 'duel',
  apCost: 1,
  cooldown: 0,
  multiplier: 1200,
  flat: 0,
  scalesWith: 'atk',
  effects: [],
  tags: ['physical'],
};

const counterAttack: SkillDef = {
  id: 'skill-counter-attack',
  name: 'Contra-ataque',
  kind: 'reaction',
  apCost: 0,
  ppCost: 1,
  cooldown: 0,
  multiplier: 800,
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

// §8.3/§6.9 (M10) — skill que aplica um debuff de def ao acertar.
const debuffStrike: SkillDef = {
  id: 'skill-debuff-strike',
  name: 'Golpe Corrosivo',
  kind: 'duel',
  apCost: 1,
  cooldown: 0,
  multiplier: 1200,
  flat: 0,
  scalesWith: 'atk',
  effects: [{ effectId: 'effect-def-down', target: 'target', chance: 1000, duration: 'battle' }],
  tags: ['physical'],
};

// Contra-ataque que TAMBÉM declara effects — usado para provar que reação não os aplica.
const counterWithEffects: SkillDef = {
  id: 'skill-counter-with-effects',
  name: 'Contra-ataque Envenenado',
  kind: 'reaction',
  apCost: 0,
  ppCost: 1,
  cooldown: 0,
  multiplier: 800,
  flat: 0,
  scalesWith: 'atk',
  effects: [{ effectId: 'effect-def-down', target: 'target', chance: 1000, duration: 'battle' }],
  trigger: 'onAttacked',
  tags: ['physical'],
};

// Skill pura de buff (sem dano) — dispara sem exigir rolagem de acerto.
const selfBuffSkill: SkillDef = {
  id: 'skill-self-buff',
  name: 'Fúria Interior',
  kind: 'duel',
  apCost: 1,
  cooldown: 0,
  multiplier: 0,
  flat: 0,
  scalesWith: 'atk',
  effects: [{ effectId: 'effect-atk-up', target: 'self', chance: 1000, duration: 'battle' }],
  tags: [],
};

const neverAppliesSkill: SkillDef = {
  id: 'skill-never-applies',
  name: 'Golpe Instável',
  kind: 'duel',
  apCost: 1,
  cooldown: 0,
  multiplier: 1200,
  flat: 0,
  scalesWith: 'atk',
  effects: [{ effectId: 'effect-def-down', target: 'target', chance: 0, duration: 'battle' }],
  tags: ['physical'],
};

const defDownEffect: EffectDef = {
  id: 'effect-def-down',
  name: 'Armadura Corroída',
  kind: 'debuff',
  dispellable: true,
  maxStacks: 3,
  statMods: [{ stat: 'def', pct: -500 }],
};

const atkUpEffect: EffectDef = {
  id: 'effect-atk-up',
  name: 'Fúria Interior',
  kind: 'buff',
  dispellable: true,
  maxStacks: 3,
  statMods: [{ stat: 'atk', flat: 200 }],
};

function participant(overrides: Partial<DuelParticipant> = {}): DuelParticipant {
  return {
    id: 'p1',
    stats: statSheet(),
    currentHp: 5000,
    ap: 5,
    pp: 2,
    unitType: 'infantry',
    weaponType: 'sword',
    duelRange: 1,
    tacticsScript: [{ enabled: true, skillId: strike.id, conditions: [] }],
    reactionScript: [{ enabled: true, skillId: counterAttack.id, conditions: [] }],
    knownSkills: { [strike.id]: strike, [counterAttack.id]: counterAttack, [defend.id]: defend },
    cooldowns: {},
    activeEffects: [],
    positionalMultiplier: 1000,
    ...overrides,
  };
}

const engagement: DuelEngagementContext = {
  engagementDistance: 1,
  terrainAccuracyModifier: 0,
  heightAccuracyModifier: 0,
  defenderEvasionModifier: 0,
  battleRound: 1,
};

const effectDefs: Readonly<Record<string, EffectDef>> = {};

function baseInput(overrides: Partial<ResolveDuelInput> = {}): ResolveDuelInput {
  return {
    seed: 42,
    attacker: participant({ id: 'hero-a' }),
    defender: participant({ id: 'hero-b', stats: statSheet({ def: 200 }) }),
    effectDefs,
    engagement,
    ...overrides,
  };
}

describe('resolveDuel — determinismo (mesma seed → hash idêntico)', () => {
  it('duas execuções com a mesma seed produzem exatamente o mesmo resultado', () => {
    const a = resolveDuel(baseInput());
    const b = resolveDuel(baseInput());
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('seeds diferentes tendem a produzir resultados diferentes (rolagens de hit/crit/variância mudam)', () => {
    const a = resolveDuel(baseInput({ seed: 1 }));
    const b = resolveDuel(baseInput({ seed: 2 }));
    expect(JSON.stringify(a)).not.toBe(JSON.stringify(b));
  });
});

describe('resolveDuel — estrutura básica', () => {
  it('nunca excede MAX_TROCAS = 3', () => {
    const result = resolveDuel(baseInput());
    expect(result.trocas.length).toBeLessThanOrEqual(3);
  });

  it('cada troca tem uma ação por lado (quando ambos podem agir e estão vivos)', () => {
    // HP alto o bastante para não morrer nas primeiras trocas com esses stats.
    const result = resolveDuel(
      baseInput({
        attacker: participant({ id: 'hero-a', currentHp: 999999, stats: statSheet({ hp: 999999 }) }),
        defender: participant({ id: 'hero-b', currentHp: 999999, stats: statSheet({ hp: 999999, def: 200 }) }),
      }),
    );
    expect(result.trocas).toHaveLength(3);
    for (const troca of result.trocas) {
      expect(troca.actions).toHaveLength(2);
    }
  });

  it('registra a linha do script tático que disparou em cada ação', () => {
    const result = resolveDuel(
      baseInput({
        attacker: participant({ id: 'hero-a', currentHp: 999999, stats: statSheet({ hp: 999999 }) }),
        defender: participant({ id: 'hero-b', currentHp: 999999, stats: statSheet({ hp: 999999, def: 200 }) }),
      }),
    );
    const firstAction = result.trocas[0]?.actions[0];
    expect(firstAction?.decision).toBe('skill');
    expect(firstAction?.skillId).toBe(strike.id);
    expect(firstAction?.tacticsLineIndex).toBe(0);
  });
});

describe('resolveDuel — teto de 2 AP por duelo (§6.2)', () => {
  it('depois de gastar o teto de 2 AP, a unidade cai para ataque básico mesmo com pool sobrando', () => {
    const result = resolveDuel(
      baseInput({
        attacker: participant({ id: 'hero-a', ap: 10, currentHp: 999999, stats: statSheet({ hp: 999999 }) }),
        defender: participant({ id: 'hero-b', ap: 10, currentHp: 999999, stats: statSheet({ hp: 999999, def: 200 }) }),
      }),
    );
    const attackerActions = result.trocas.map((t) => t.actions.find((a) => a.actorId === 'hero-a'));
    // skill-strike custa 1 AP; troca 1 e 2 pagam (total 2, no teto); troca 3 estoura o teto -> básico.
    expect(attackerActions[0]?.skillId).toBe(strike.id);
    expect(attackerActions[1]?.skillId).toBe(strike.id);
    expect(attackerActions[2]?.skillId).toBe('core:basic-attack');
  });
});

describe('resolveDuel — assimetria ranged (§6.1)', () => {
  it('defensor fora de alcance não age em nenhuma troca', () => {
    const result = resolveDuel(
      baseInput({
        attacker: participant({ id: 'hero-a', duelRange: 3, currentHp: 999999, stats: statSheet({ hp: 999999 }) }),
        defender: participant({ id: 'hero-b', duelRange: 1, currentHp: 999999, stats: statSheet({ hp: 999999, def: 200 }) }),
        engagement: { ...engagement, engagementDistance: 3 },
      }),
    );
    const defenderActions = result.trocas.map((t) => t.actions.find((a) => a.actorId === 'hero-b'));
    for (const action of defenderActions) {
      expect(action?.decision).toBe('none');
    }
  });
});

describe('resolveDuel — ordem via preempção de spd (§6.7.2)', () => {
  it('defensor bem mais rápido preempta só na troca 1; da troca 2 em diante o atacante volta a agir primeiro', () => {
    const result = resolveDuel(
      baseInput({
        attacker: participant({ id: 'hero-a', currentHp: 999999, stats: statSheet({ hp: 999999, spd: 100 }) }),
        defender: participant({
          id: 'hero-b',
          currentHp: 999999,
          stats: statSheet({ hp: 999999, def: 200, spd: 200 }), // 200 >= 100*1.15=115
        }),
      }),
    );
    expect(result.trocas[0]?.firstMoverId).toBe('hero-b');
    expect(result.trocas[1]?.firstMoverId).toBe('hero-a');
    expect(result.trocas[2]?.firstMoverId).toBe('hero-a');
  });

  it('sem vantagem suficiente de spd, o atacante age primeiro desde a troca 1', () => {
    const result = resolveDuel(
      baseInput({
        attacker: participant({ id: 'hero-a', currentHp: 999999, stats: statSheet({ hp: 999999, spd: 100 }) }),
        defender: participant({ id: 'hero-b', currentHp: 999999, stats: statSheet({ hp: 999999, def: 200, spd: 110 }) }),
      }),
    );
    expect(result.trocas[0]?.firstMoverId).toBe('hero-a');
  });
});

describe('resolveDuel — contra-ataque sem PP (§6.2, §6.4)', () => {
  it('defensor sem PP nunca reage, mesmo tendo a linha de contra-ataque no script', () => {
    const result = resolveDuel(
      baseInput({
        attacker: participant({ id: 'hero-a', currentHp: 999999, stats: statSheet({ hp: 999999 }) }),
        defender: participant({
          id: 'hero-b',
          pp: 0,
          currentHp: 999999,
          stats: statSheet({ hp: 999999, def: 200 }),
        }),
      }),
    );
    for (const troca of result.trocas) {
      const attackerAction = troca.actions.find((a) => a.actorId === 'hero-a');
      expect(attackerAction?.reaction).toBeNull();
    }
  });

  it('defensor com PP reage ao ataque (contra-ataque dispara)', () => {
    const result = resolveDuel(
      baseInput({
        attacker: participant({ id: 'hero-a', currentHp: 999999, stats: statSheet({ hp: 999999 }) }),
        defender: participant({
          id: 'hero-b',
          pp: 2,
          currentHp: 999999,
          stats: statSheet({ hp: 999999, def: 200 }),
        }),
      }),
    );
    const reacted = result.trocas.some(
      (t) => t.actions.find((a) => a.actorId === 'hero-a')?.reaction?.skillId === counterAttack.id,
    );
    expect(reacted).toBe(true);
  });
});

describe('resolveDuel — ppLockedForTroca1 (§5.5, M3: Flanco trava PP do defensor só na troca 1)', () => {
  it('defensor travado não reage na troca 1, mas volta a reagir normalmente na troca 2', () => {
    const result = resolveDuel(
      baseInput({
        attacker: participant({ id: 'hero-a', currentHp: 999999, stats: statSheet({ hp: 999999 }) }),
        defender: participant({
          id: 'hero-b',
          pp: 2,
          currentHp: 999999,
          stats: statSheet({ hp: 999999, def: 200 }),
        }),
        ppLockedForTroca1: ['hero-b'],
      }),
    );
    const troca1AttackerAction = result.trocas[0]?.actions.find((a) => a.actorId === 'hero-a');
    expect(troca1AttackerAction?.reaction).toBeNull();

    const reagiuDepois = result.trocas.slice(1).some(
      (t) => t.actions.find((a) => a.actorId === 'hero-a')?.reaction?.skillId === counterAttack.id,
    );
    expect(reagiuDepois).toBe(true);
  });

  it('sem ppLockedForTroca1, o comportamento é idêntico ao de M2 (campo aditivo/opcional)', () => {
    const withoutLock = resolveDuel(
      baseInput({
        attacker: participant({ id: 'hero-a', currentHp: 999999, stats: statSheet({ hp: 999999 }) }),
        defender: participant({ id: 'hero-b', pp: 2, currentHp: 999999, stats: statSheet({ hp: 999999, def: 200 }) }),
      }),
    );
    const withEmptyLock = resolveDuel(
      baseInput({
        attacker: participant({ id: 'hero-a', currentHp: 999999, stats: statSheet({ hp: 999999 }) }),
        defender: participant({ id: 'hero-b', pp: 2, currentHp: 999999, stats: statSheet({ hp: 999999, def: 200 }) }),
        ppLockedForTroca1: [],
      }),
    );
    expect(JSON.stringify(withoutLock)).toBe(JSON.stringify(withEmptyLock));
  });
});

const noOpSkill: SkillDef = {
  id: 'skill-no-op',
  name: 'Nada',
  kind: 'duel',
  apCost: 0,
  cooldown: 0,
  multiplier: 0,
  flat: 0,
  scalesWith: 'atk',
  effects: [],
  tags: [],
};

function assistCandidate(id: string, overrides: Partial<import('../../src/duel/assist.js').AssistCandidate> = {}) {
  return {
    id,
    reactionScript: [{ enabled: true, skillId: counterAttack.id, conditions: [] }],
    skills: { [counterAttack.id]: { ...counterAttack, trigger: 'onAllyEngagedNearby' as const } },
    economy: { pools: { ap: 2, pp: 2 }, apSpentThisDuel: 0, ppSpentThisTroca: 0 },
    context: {
      self: {
        currentHpPct: 1000,
        ap: 2,
        pp: 2,
        unitType: 'infantry' as const,
        weaponType: 'sword' as const,
        activeBuffIds: [],
        activeDebuffIds: [],
      },
      target: {
        currentHpPct: 1000,
        ap: 2,
        pp: 2,
        unitType: 'infantry' as const,
        weaponType: 'sword' as const,
        activeBuffIds: [],
        activeDebuffIds: [],
      },
      isSelfAttacker: true,
      hasPositionalBonus: false,
      trocaNumber: 1 as const,
      battleRound: 1,
      alliesAdjacentCount: 0,
    },
    stats: statSheet(),
    unitType: 'infantry' as const,
    weaponType: 'sword' as const,
    activeEffects: [],
    ...overrides,
  };
}

describe('resolveDuel — assistências (§6.5)', () => {
  it('repassa o resultado de resolveAssists para cada lado no DuelResult, com damageDealt (M10)', () => {
    const result = resolveDuel(
      baseInput({
        attackerAssistCandidates: [assistCandidate('ally-1')],
      }),
    );
    expect(result.attackerAssists).toHaveLength(1);
    expect(result.attackerAssists[0]).toMatchObject({ assistantId: 'ally-1', skillId: counterAttack.id });
    expect(result.attackerAssists[0]?.damageDealt).toBeGreaterThan(0);
    expect(result.defenderAssists).toEqual([]);
  });
});

describe('resolveDuel — assistência causa dano de verdade a HP (§6.5.3, M10)', () => {
  it('assistência do atacante reduz o HP do defensor ANTES da troca 1, isolado de qualquer dano de troca', () => {
    const defenderStartingHp = 999999;
    const result = resolveDuel(
      baseInput({
        // Ator principal sem componente de dano — isola o efeito da assistência.
        attacker: participant({
          id: 'hero-a',
          currentHp: 999999,
          stats: statSheet({ hp: 999999 }),
          tacticsScript: [{ enabled: true, skillId: noOpSkill.id, conditions: [] }],
          knownSkills: { [noOpSkill.id]: noOpSkill, [counterAttack.id]: counterAttack, [defend.id]: defend },
          reactionScript: [], // sem isso, o atacante contra-atacaria o strike do defensor
        }),
        defender: participant({
          id: 'hero-b',
          pp: 0, // sem contra-ataque — hero-b nunca causa dano a si mesmo de qualquer forma
          currentHp: defenderStartingHp,
          stats: statSheet({ hp: defenderStartingHp, def: 200 }),
        }),
        attackerAssistCandidates: [assistCandidate('ally-1')],
      }),
    );
    const assistDamage = result.attackerAssists[0]!.damageDealt;
    expect(assistDamage).toBeGreaterThan(0);
    expect(result.finalHpDefender).toBe(defenderStartingHp - assistDamage);
  });

  it('assistência do defensor reduz o HP do atacante (simétrico)', () => {
    const attackerStartingHp = 999999;
    const result = resolveDuel(
      baseInput({
        attacker: participant({
          id: 'hero-a',
          currentHp: attackerStartingHp,
          stats: statSheet({ hp: attackerStartingHp }),
          tacticsScript: [{ enabled: true, skillId: noOpSkill.id, conditions: [] }],
          knownSkills: { [noOpSkill.id]: noOpSkill, [counterAttack.id]: counterAttack, [defend.id]: defend },
        }),
        defender: participant({
          id: 'hero-b',
          currentHp: 999999,
          stats: statSheet({ hp: 999999, def: 200 }),
          tacticsScript: [{ enabled: true, skillId: noOpSkill.id, conditions: [] }],
          knownSkills: { [noOpSkill.id]: noOpSkill, [counterAttack.id]: counterAttack, [defend.id]: defend },
        }),
        defenderAssistCandidates: [assistCandidate('ally-2')],
      }),
    );
    const assistDamage = result.defenderAssists[0]!.damageDealt;
    expect(assistDamage).toBeGreaterThan(0);
    expect(result.finalHpAttacker).toBe(attackerStartingHp - assistDamage);
  });

  it('soma o dano das duas assistências do mesmo lado (teto de 2, §6.5)', () => {
    const defenderStartingHp = 999999;
    const result = resolveDuel(
      baseInput({
        attacker: participant({
          id: 'hero-a',
          currentHp: 999999,
          stats: statSheet({ hp: 999999 }),
          tacticsScript: [{ enabled: true, skillId: noOpSkill.id, conditions: [] }],
          knownSkills: { [noOpSkill.id]: noOpSkill, [counterAttack.id]: counterAttack, [defend.id]: defend },
          reactionScript: [],
        }),
        defender: participant({
          id: 'hero-b',
          pp: 0,
          currentHp: defenderStartingHp,
          stats: statSheet({ hp: defenderStartingHp, def: 200 }),
        }),
        attackerAssistCandidates: [assistCandidate('ally-1'), assistCandidate('ally-2')],
      }),
    );
    expect(result.attackerAssists).toHaveLength(2);
    const totalAssistDamage = result.attackerAssists.reduce((sum, a) => sum + a.damageDealt, 0);
    expect(result.finalHpDefender).toBe(defenderStartingHp - totalAssistDamage);
    expect(result.attackerAssists.every((a) => a.damageDealt > 0)).toBe(true);
  });

  it('assistência sem componente de dano (heal/buff) não muda o HP do alvo', () => {
    const healAssistSkill: SkillDef = {
      ...counterAttack,
      id: 'skill-assist-heal',
      multiplier: 0,
      flat: 0,
      tags: ['heal'],
      trigger: 'onAllyEngagedNearby',
    };
    const defenderStartingHp = 999999;
    const result = resolveDuel(
      baseInput({
        attacker: participant({
          id: 'hero-a',
          currentHp: 999999,
          stats: statSheet({ hp: 999999 }),
          tacticsScript: [{ enabled: true, skillId: noOpSkill.id, conditions: [] }],
          knownSkills: { [noOpSkill.id]: noOpSkill, [counterAttack.id]: counterAttack, [defend.id]: defend },
          reactionScript: [],
        }),
        defender: participant({
          id: 'hero-b',
          pp: 0,
          currentHp: defenderStartingHp,
          stats: statSheet({ hp: defenderStartingHp, def: 200 }),
        }),
        attackerAssistCandidates: [
          assistCandidate('ally-1', {
            reactionScript: [{ enabled: true, skillId: healAssistSkill.id, conditions: [] }],
            skills: { [healAssistSkill.id]: healAssistSkill },
          }),
        ],
      }),
    );
    expect(result.attackerAssists[0]?.damageDealt).toBe(0);
    expect(result.finalHpDefender).toBe(defenderStartingHp);
  });

  it('sem candidatos de assistência, comportamento idêntico a antes de M10 (campo aditivo)', () => {
    const a = resolveDuel(baseInput());
    const b = resolveDuel(baseInput({ attackerAssistCandidates: [], defenderAssistCandidates: [] }));
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('determinismo: mesma seed produz o mesmo dano de assistência', () => {
    const input = baseInput({
      defender: participant({ id: 'hero-b', pp: 0, currentHp: 999999, stats: statSheet({ hp: 999999, def: 200 }) }),
      attackerAssistCandidates: [assistCandidate('ally-1')],
    });
    const a = resolveDuel(input);
    const b = resolveDuel(input);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});

const effectDefsWithDebuffAndBuff: Readonly<Record<string, EffectDef>> = {
  [defDownEffect.id]: defDownEffect,
  [atkUpEffect.id]: atkUpEffect,
};

describe('resolveDuel — skill.effects aplicado dentro do duelo (§8.3/§6.9, M10)', () => {
  it('debuff aplicado na troca 1 altera o stat sheet efetivo (dano maior na troca 2), fica registrado em effectsApplied e persiste em finalActiveEffects*', () => {
    const result = resolveDuel(
      baseInput({
        attacker: participant({
          id: 'hero-a',
          currentHp: 999999,
          stats: statSheet({ hp: 999999 }),
          tacticsScript: [{ enabled: true, skillId: debuffStrike.id, conditions: [] }],
          knownSkills: { [debuffStrike.id]: debuffStrike, [counterAttack.id]: counterAttack, [defend.id]: defend },
        }),
        defender: participant({
          id: 'hero-b',
          pp: 0, // sem contra-ataque, para isolar o efeito na comparação de dano
          currentHp: 999999,
          stats: statSheet({ hp: 999999, def: 400 }),
        }),
        effectDefs: effectDefsWithDebuffAndBuff,
      }),
    );

    const attackerActions = result.trocas.map((t) => t.actions.find((a) => a.actorId === 'hero-a'));
    const damageTroca1 = attackerActions[0]?.damage ?? 0;
    const damageTroca2 = attackerActions[1]?.damage ?? 0;
    expect(damageTroca1).toBeGreaterThan(0);
    expect(damageTroca2).toBeGreaterThan(damageTroca1); // def do alvo caiu -50% depois da troca 1

    expect(attackerActions[0]?.effectsApplied).toEqual([defDownEffect.id]);

    expect(result.finalActiveEffectsDefender).toHaveLength(1);
    expect(result.finalActiveEffectsDefender[0]).toMatchObject({ id: defDownEffect.id, duration: 'battle' });
    expect(result.finalActiveEffectsAttacker).toEqual([]);
  });

  it('chance=0 nunca aplica o efeito', () => {
    const result = resolveDuel(
      baseInput({
        attacker: participant({
          id: 'hero-a',
          currentHp: 999999,
          stats: statSheet({ hp: 999999 }),
          tacticsScript: [{ enabled: true, skillId: neverAppliesSkill.id, conditions: [] }],
          knownSkills: { [neverAppliesSkill.id]: neverAppliesSkill, [counterAttack.id]: counterAttack, [defend.id]: defend },
        }),
        defender: participant({ id: 'hero-b', pp: 0, currentHp: 999999, stats: statSheet({ hp: 999999, def: 200 }) }),
        effectDefs: effectDefsWithDebuffAndBuff,
      }),
    );
    const firstAction = result.trocas[0]?.actions.find((a) => a.actorId === 'hero-a');
    expect(firstAction?.effectsApplied).toEqual([]);
    expect(result.finalActiveEffectsDefender).toEqual([]);
  });

  it('skill pura de buff (multiplier=0/flat=0) aplica o efeito em si mesma sem exigir rolagem de acerto', () => {
    const result = resolveDuel(
      baseInput({
        attacker: participant({
          id: 'hero-a',
          currentHp: 999999,
          stats: statSheet({ hp: 999999 }),
          tacticsScript: [{ enabled: true, skillId: selfBuffSkill.id, conditions: [] }],
          knownSkills: { [selfBuffSkill.id]: selfBuffSkill, [counterAttack.id]: counterAttack, [defend.id]: defend },
        }),
        defender: participant({ id: 'hero-b', currentHp: 999999, stats: statSheet({ hp: 999999, def: 200 }) }),
        effectDefs: effectDefsWithDebuffAndBuff,
      }),
    );
    const firstAction = result.trocas[0]?.actions.find((a) => a.actorId === 'hero-a');
    expect(firstAction?.hit).toBeNull(); // sem dano, sem rolagem de acerto — como qualquer skill não-ofensiva
    expect(firstAction?.effectsApplied).toEqual([atkUpEffect.id]);
    expect(result.finalActiveEffectsAttacker).toHaveLength(1);
    expect(result.finalActiveEffectsAttacker[0]).toMatchObject({ id: atkUpEffect.id });
  });

  it('reaplicar o mesmo efeito em trocas sucessivas empilha stacks (sem duplicar a entrada)', () => {
    const result = resolveDuel(
      baseInput({
        attacker: participant({
          id: 'hero-a',
          ap: 2, // exatamente o teto de 2 AP — debuffStrike (1 AP) dispara nas trocas 1 e 2
          currentHp: 999999,
          stats: statSheet({ hp: 999999 }),
          tacticsScript: [{ enabled: true, skillId: debuffStrike.id, conditions: [] }],
          knownSkills: { [debuffStrike.id]: debuffStrike, [counterAttack.id]: counterAttack, [defend.id]: defend },
        }),
        defender: participant({ id: 'hero-b', pp: 0, currentHp: 999999, stats: statSheet({ hp: 999999, def: 400 }) }),
        effectDefs: effectDefsWithDebuffAndBuff,
      }),
    );
    expect(result.finalActiveEffectsDefender).toHaveLength(1);
    expect(result.finalActiveEffectsDefender[0]?.stacks).toBe(2);
  });

  it('reação (contra-ataque) que declara effects NÃO os aplica — corte documentado (ver DECISIONS.md)', () => {
    const result = resolveDuel(
      baseInput({
        attacker: participant({ id: 'hero-a', currentHp: 999999, stats: statSheet({ hp: 999999 }) }),
        defender: participant({
          id: 'hero-b',
          pp: 2,
          currentHp: 999999,
          stats: statSheet({ hp: 999999, def: 200 }),
          reactionScript: [{ enabled: true, skillId: counterWithEffects.id, conditions: [] }],
          knownSkills: { [strike.id]: strike, [counterWithEffects.id]: counterWithEffects, [defend.id]: defend },
        }),
        effectDefs: effectDefsWithDebuffAndBuff,
      }),
    );
    const reacted = result.trocas.some(
      (t) => t.actions.find((a) => a.actorId === 'hero-a')?.reaction?.skillId === counterWithEffects.id,
    );
    expect(reacted).toBe(true); // a reação de fato disparou...
    expect(result.finalActiveEffectsAttacker).toEqual([]); // ...mas não aplicou o effect que declara
  });

  it('determinismo: mesma seed produz o mesmo DuelResult, incluindo finalActiveEffects*', () => {
    const input = baseInput({
      attacker: participant({
        id: 'hero-a',
        currentHp: 999999,
        stats: statSheet({ hp: 999999 }),
        tacticsScript: [{ enabled: true, skillId: debuffStrike.id, conditions: [] }],
        knownSkills: { [debuffStrike.id]: debuffStrike, [counterAttack.id]: counterAttack, [defend.id]: defend },
      }),
      defender: participant({ id: 'hero-b', currentHp: 999999, stats: statSheet({ hp: 999999, def: 400 }) }),
      effectDefs: effectDefsWithDebuffAndBuff,
    });
    const a = resolveDuel(input);
    const b = resolveDuel(input);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});
