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

describe('resolveDuel — assistências (§6.5)', () => {
  it('repassa o resultado de resolveAssists para cada lado no DuelResult', () => {
    const result = resolveDuel(
      baseInput({
        attackerAssistCandidates: [
          {
            id: 'ally-1',
            reactionScript: [{ enabled: true, skillId: counterAttack.id, conditions: [] }],
            skills: { [counterAttack.id]: { ...counterAttack, trigger: 'onAllyEngagedNearby' } },
            economy: { pools: { ap: 2, pp: 2 }, apSpentThisDuel: 0, ppSpentThisTroca: 0 },
            context: {
              self: {
                currentHpPct: 1000,
                ap: 2,
                pp: 2,
                unitType: 'infantry',
                weaponType: 'sword',
                activeBuffIds: [],
                activeDebuffIds: [],
              },
              target: {
                currentHpPct: 1000,
                ap: 2,
                pp: 2,
                unitType: 'infantry',
                weaponType: 'sword',
                activeBuffIds: [],
                activeDebuffIds: [],
              },
              isSelfAttacker: true,
              hasPositionalBonus: false,
              trocaNumber: 1,
              battleRound: 1,
              alliesAdjacentCount: 0,
            },
          },
        ],
      }),
    );
    expect(result.attackerAssists).toEqual([{ assistantId: 'ally-1', skillId: counterAttack.id }]);
    expect(result.defenderAssists).toEqual([]);
  });
});
