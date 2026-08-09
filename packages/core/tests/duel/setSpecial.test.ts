import { describe, expect, it } from 'vitest';
import { SET_SPECIAL_DUELISTA, SET_SPECIAL_IMUNIDADE } from '../../src/items/sets.js';
import { resolveDuel, type ResolveDuelInput } from '../../src/duel/resolveDuel.js';
import type { DuelEngagementContext, DuelParticipant, EffectDef } from '../../src/duel/types.js';
import type { SkillDef } from '../../src/skills/types.js';
import type { StatSheet } from '../../src/stats/types.js';

// §7.4 (M10, sub-sessão 6/N) — os dois efeitos `special` de set que são LOCAIS ao duelo:
// Duelista ("Contra-atacar custa 0 PP na primeira troca") e Imunidade ("Imune a debuffs na
// troca 1 do duelo"). Reserva e Sentinela vivem na camada de batalha e são testados em
// tests/battle/.
//
// Nota de fixture: `spd: 100` nos dois lados é o baseline de §6.7.3 (evasão 0, sem
// preempção), então todo golpe acerta — os testes abaixo medem só o efeito do set, sem
// ruído de rolagem de acerto. HP alto o bastante pra as 3 trocas sempre acontecerem.

function statSheet(overrides: Partial<StatSheet> = {}): StatSheet {
  return {
    hp: 30000,
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

const counterOnDamaged: SkillDef = {
  id: 'skill-counter-on-damaged',
  name: 'Revide',
  kind: 'reaction',
  apCost: 0,
  ppCost: 1,
  cooldown: 0,
  multiplier: 800,
  flat: 0,
  scalesWith: 'atk',
  effects: [],
  trigger: 'onDamaged',
  tags: ['physical'],
};

const counterOnDebuffed: SkillDef = {
  id: 'skill-counter-on-debuffed',
  name: 'Represália',
  kind: 'reaction',
  apCost: 0,
  ppCost: 1,
  cooldown: 0,
  multiplier: 800,
  flat: 0,
  scalesWith: 'atk',
  effects: [],
  trigger: 'onDebuffed',
  tags: ['physical'],
};

const debuffStrike: SkillDef = {
  id: 'skill-debuff-strike',
  name: 'Golpe Corrosivo',
  kind: 'duel',
  apCost: 0, // 0 AP: o teto de 2 AP por duelo (§6.2) não pode derrubar a skill pra ataque básico na troca 3
  cooldown: 0,
  multiplier: 1200,
  flat: 0,
  scalesWith: 'atk',
  effects: [{ effectId: 'effect-def-down', target: 'target', chance: 1000, duration: 'battle' }],
  tags: ['physical'],
};

const selfBuffStrike: SkillDef = {
  id: 'skill-self-buff-strike',
  name: 'Golpe Inspirado',
  kind: 'duel',
  apCost: 0,
  cooldown: 0,
  multiplier: 1200,
  flat: 0,
  scalesWith: 'atk',
  effects: [{ effectId: 'effect-atk-up', target: 'self', chance: 1000, duration: 'battle' }],
  tags: ['physical'],
};

const defDown: EffectDef = {
  id: 'effect-def-down',
  name: 'Armadura Corroída',
  kind: 'debuff',
  dispellable: true,
  maxStacks: 3,
  statMods: [{ stat: 'def', pct: -500 }],
};

const atkUp: EffectDef = {
  id: 'effect-atk-up',
  name: 'Ímpeto',
  kind: 'buff',
  dispellable: true,
  maxStacks: 3,
  statMods: [{ stat: 'atk', flat: 200 }],
};

const effectDefs: Readonly<Record<string, EffectDef>> = {
  [defDown.id]: defDown,
  [atkUp.id]: atkUp,
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

// O atacante nunca reage (reactionScript vazio), então toda reação vista no log é do
// defensor — que é quem carrega o set nestes testes.
function input(defender: DuelParticipant, overrides: Partial<ResolveDuelInput> = {}): ResolveDuelInput {
  return {
    seed: 42,
    attacker: participant({ id: 'hero-a' }),
    defender,
    effectDefs,
    engagement,
    ...overrides,
  };
}

function reactionsByTroca(result: ReturnType<typeof resolveDuel>): (string | null)[] {
  return result.trocas.map((troca) => {
    const withReaction = troca.actions.find((action) => action.reaction !== null);
    return withReaction?.reaction?.skillId ?? null;
  });
}

describe('§7.4 Duelista — contra-atacar custa 0 PP na primeira troca', () => {
  const duelistDefender = (setSpecialEffectIds: readonly string[]): DuelParticipant =>
    participant({
      id: 'hero-b',
      pp: 0, // sem PP nenhum: só uma reação de custo zero pode disparar
      reactionScript: [{ enabled: true, skillId: counterAttack.id, conditions: [] }],
      knownSkills: { [strike.id]: strike, [counterAttack.id]: counterAttack },
      setSpecialEffectIds,
    });

  it('com o set e PP zerado, o contra-ataque da troca 1 acontece mesmo assim', () => {
    const result = resolveDuel(input(duelistDefender([SET_SPECIAL_DUELISTA])));
    expect(reactionsByTroca(result)[0]).toBe(counterAttack.id);
  });

  it('sem o set, o mesmo defensor com PP zerado não contra-ataca em troca nenhuma', () => {
    const result = resolveDuel(input(duelistDefender([])));
    expect(reactionsByTroca(result)).toEqual([null, null, null]);
  });

  it('o set não gasta PP — o pool final continua zerado', () => {
    const result = resolveDuel(input(duelistDefender([SET_SPECIAL_DUELISTA])));
    expect(result.finalPpDefender).toBe(0);
  });

  it('vale só na PRIMEIRA troca: nas trocas 2 e 3 o contra-ataque volta a exigir PP', () => {
    const result = resolveDuel(input(duelistDefender([SET_SPECIAL_DUELISTA])));
    expect(reactionsByTroca(result).slice(1)).toEqual([null, null]);
  });

  it('com PP sobrando, o set não muda nada além do custo (a reação já disparava)', () => {
    const withPp = (setSpecialEffectIds: readonly string[]): DuelParticipant =>
      participant({
        id: 'hero-b',
        pp: 3,
        reactionScript: [{ enabled: true, skillId: counterAttack.id, conditions: [] }],
        knownSkills: { [strike.id]: strike, [counterAttack.id]: counterAttack },
        setSpecialEffectIds,
      });
    const comSet = resolveDuel(input(withPp([SET_SPECIAL_DUELISTA])));
    const semSet = resolveDuel(input(withPp([])));
    expect(reactionsByTroca(comSet)).toEqual(reactionsByTroca(semSet));
    // A única diferença observável: o PP da troca 1 não foi debitado.
    expect(comSet.finalPpDefender).toBe(semSet.finalPpDefender + 1);
  });

  it('determinismo: mesma seed, mesmo resultado', () => {
    const a = resolveDuel(input(duelistDefender([SET_SPECIAL_DUELISTA])));
    const b = resolveDuel(input(duelistDefender([SET_SPECIAL_DUELISTA])));
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});

describe('§7.4 Imunidade — imune a debuffs na troca 1 do duelo', () => {
  const attackerWithDebuff = participant({
    id: 'hero-a',
    tacticsScript: [{ enabled: true, skillId: debuffStrike.id, conditions: [] }],
    knownSkills: { [debuffStrike.id]: debuffStrike },
  });

  const immuneDefender = (setSpecialEffectIds: readonly string[]): DuelParticipant =>
    participant({ id: 'hero-b', setSpecialEffectIds });

  function debuffTrocas(result: ReturnType<typeof resolveDuel>): boolean[] {
    return result.trocas.map((troca) =>
      troca.actions.some((action) => action.effectsApplied.includes(defDown.id)),
    );
  }

  it('sem o set, o debuff gruda já na troca 1 (controle)', () => {
    const result = resolveDuel(input(immuneDefender([]), { attacker: attackerWithDebuff }));
    expect(debuffTrocas(result)[0]).toBe(true);
  });

  it('com o set, nada é aplicado na troca 1', () => {
    const result = resolveDuel(input(immuneDefender([SET_SPECIAL_IMUNIDADE]), { attacker: attackerWithDebuff }));
    expect(debuffTrocas(result)[0]).toBe(false);
  });

  it('a imunidade é só da troca 1 — na troca 2 o debuff passa', () => {
    const result = resolveDuel(input(immuneDefender([SET_SPECIAL_IMUNIDADE]), { attacker: attackerWithDebuff }));
    expect(debuffTrocas(result)[1]).toBe(true);
    expect(result.finalActiveEffectsDefender.map((e) => e.id)).toContain(defDown.id);
  });

  it('não bloqueia BUFF que o atacante aplica em si mesmo — só debuff no imune', () => {
    const buffAttacker = participant({
      id: 'hero-a',
      tacticsScript: [{ enabled: true, skillId: selfBuffStrike.id, conditions: [] }],
      knownSkills: { [selfBuffStrike.id]: selfBuffStrike },
    });
    const result = resolveDuel(input(immuneDefender([SET_SPECIAL_IMUNIDADE]), { attacker: buffAttacker }));
    expect(result.trocas[0]?.actions.some((a) => a.effectsApplied.includes(atkUp.id))).toBe(true);
  });

  it('debuff bloqueado não dispara onDebuffed (M10 sub-sessão 5/N) — não houve debuff', () => {
    const reactive = participant({
      id: 'hero-b',
      reactionScript: [{ enabled: true, skillId: counterOnDebuffed.id, conditions: [] }],
      knownSkills: { [strike.id]: strike, [counterOnDebuffed.id]: counterOnDebuffed },
      setSpecialEffectIds: [SET_SPECIAL_IMUNIDADE],
    });
    const result = resolveDuel(input(reactive, { attacker: attackerWithDebuff }));
    expect(reactionsByTroca(result)[0]).toBeNull();

    // Controle: o mesmo defensor SEM o set reage na troca 1.
    const semSet = resolveDuel(
      input({ ...reactive, setSpecialEffectIds: [] }, { attacker: attackerWithDebuff }),
    );
    expect(reactionsByTroca(semSet)[0]).toBe(counterOnDebuffed.id);
  });

  it('não interfere em onDamaged — o golpe ainda causa dano e o gatilho dispara', () => {
    const reactive = participant({
      id: 'hero-b',
      reactionScript: [{ enabled: true, skillId: counterOnDamaged.id, conditions: [] }],
      knownSkills: { [strike.id]: strike, [counterOnDamaged.id]: counterOnDamaged },
      setSpecialEffectIds: [SET_SPECIAL_IMUNIDADE],
    });
    const result = resolveDuel(input(reactive, { attacker: attackerWithDebuff }));
    expect(reactionsByTroca(result)[0]).toBe(counterOnDamaged.id);
  });

  it('determinismo: mesma seed, mesmo resultado', () => {
    const a = resolveDuel(input(immuneDefender([SET_SPECIAL_IMUNIDADE]), { attacker: attackerWithDebuff }));
    const b = resolveDuel(input(immuneDefender([SET_SPECIAL_IMUNIDADE]), { attacker: attackerWithDebuff }));
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});
