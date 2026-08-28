import { describe, expect, it } from 'vitest';
import { hashState } from '../../src/determinism/hash.js';
import { resolveDuel, type ResolveDuelInput } from '../../src/duel/resolveDuel.js';
import type { DuelEngagementContext, DuelParticipant, EffectDef } from '../../src/duel/types.js';
import type { SkillDef } from '../../src/skills/types.js';
import type { StatSheet } from '../../src/stats/types.js';

// §4.1 `lifesteal` ("Vampirismo, %") + M15 D1 (briefing
// `docs/milestones/M15-fechamento-do-loop-de-pvp.md`): o stat existe desde M1 e NUNCA teve
// consumidor — aparecia só em `STAT_KEYS` e nos schemas. D1 fixa a leitura: cura o atacante
// como fração do dano EFETIVAMENTE APLICADO A HP (não do dano calculado antes do corte em
// 0), nunca acima do HP máximo, e o excesso é descartado em vez de virar escudo.
//
// Método destes testes: toda asserção compara duas execuções idênticas do MESMO duelo, uma
// com `lifesteal: 0` e outra com `lifesteal: 1000` (100%). Isso prova duas coisas de uma
// vez — que a cura acontece, e que ela não desloca nenhum stream de RNG (o dano recebido
// pelo alvo tem de ser idêntico byte a byte nas duas execuções). 100% também torna as
// contas exatas mesmo somando várias trocas: `fpPct(x, 1000) === x`, sem erro de
// truncamento acumulado.

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

const counterAttack: SkillDef = {
  id: 'skill-contra-ataque', name: 'Contra-ataque', kind: 'reaction',
  apCost: 0, ppCost: 1, cooldown: 0,
  multiplier: 800, flat: 0, scalesWith: 'atk', effects: [], trigger: 'onAttacked', tags: ['physical'],
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

function duel(attacker: DuelParticipant, defender: DuelParticipant): ReturnType<typeof resolveDuel> {
  const input: ResolveDuelInput = {
    seed: 42,
    attacker,
    defender,
    effectDefs,
    engagement,
    attackerAssistCandidates: [],
    defenderAssistCandidates: [],
    ppLockedForTroca1: [],
  };
  return resolveDuel(input);
}

// Atacante ferido (para haver espaço de cura) contra um defensor que não reage.
function woundedAttacker(lifesteal: number): DuelParticipant {
  return participant({ id: 'atacante', stats: statSheet({ lifesteal }), currentHp: 10000 });
}

describe('§4.1 lifesteal — vampirismo no duelo (M15 D1)', () => {
  it('o atacante cura ao causar dano, e o dano recebido pelo alvo NÃO muda (nenhum stream deslocado)', () => {
    const semVampirismo = duel(woundedAttacker(0), participant({ id: 'alvo' }));
    const comVampirismo = duel(woundedAttacker(1000), participant({ id: 'alvo' }));

    expect(comVampirismo.finalHpDefender).toBe(semVampirismo.finalHpDefender);
    expect(comVampirismo.finalHpAttacker).toBeGreaterThan(semVampirismo.finalHpAttacker);
  });

  it('a 100% a cura é exatamente o dano aplicado ao alvo', () => {
    const alvoHp = 30000;
    const semVampirismo = duel(woundedAttacker(0), participant({ id: 'alvo', currentHp: alvoHp }));
    const comVampirismo = duel(woundedAttacker(1000), participant({ id: 'alvo', currentHp: alvoHp }));

    const danoCausado = alvoHp - semVampirismo.finalHpDefender;
    expect(danoCausado).toBeGreaterThan(0);
    expect(comVampirismo.finalHpAttacker - semVampirismo.finalHpAttacker).toBe(danoCausado);
  });

  it('a cura é fração do dano EFETIVAMENTE aplicado, não do dano calculado', () => {
    // Alvo com 1 HP e um golpe que causaria milhares: só 1 ponto de dano chega a HP, então
    // a 100% de vampirismo a cura é de exatamente 1. Esta é a diferença entre a leitura de
    // D1 e a leitura ingênua (que curaria o golpe inteiro por matar um alvo quase morto).
    const atacante = participant({ id: 'atacante', stats: statSheet({ lifesteal: 1000 }), currentHp: 10000 });
    const resultado = duel(atacante, participant({ id: 'alvo', currentHp: 1 }));

    expect(resultado.finalHpDefender).toBe(0);
    expect(resultado.finalHpAttacker).toBe(10001);
  });

  it('nunca passa do HP máximo: o excesso é descartado, não vira escudo', () => {
    const atacante = participant({ id: 'atacante', stats: statSheet({ lifesteal: 1000 }), currentHp: 30000 });
    const resultado = duel(atacante, participant({ id: 'alvo', currentHp: 1 }));

    expect(resultado.finalHpAttacker).toBe(30000);
  });

  it('o contra-ataque também vampiriza (o vampirismo é de quem BATE, não de quem ataca primeiro)', () => {
    function defensorQueContra(lifesteal: number): DuelParticipant {
      return participant({
        id: 'defensor',
        stats: statSheet({ lifesteal }),
        currentHp: 15000,
        reactionScript: [{ enabled: true, skillId: counterAttack.id, conditions: [] }],
        knownSkills: { [strike.id]: strike, [counterAttack.id]: counterAttack },
      });
    }

    const semVampirismo = duel(participant({ id: 'atacante' }), defensorQueContra(0));
    const comVampirismo = duel(participant({ id: 'atacante' }), defensorQueContra(1000));

    const danoNoAtacante = 30000 - semVampirismo.finalHpAttacker;
    expect(danoNoAtacante).toBeGreaterThan(0);
    expect(comVampirismo.finalHpDefender - semVampirismo.finalHpDefender).toBe(danoNoAtacante);
  });

  it('não ressuscita: quem morre não vampiriza mesmo com contra-ataque no script', () => {
    // `applyHeal` já recusa curar quem está em 0 desde M10 7/N; o vampirismo herda essa
    // regra em vez de abrir uma exceção própria.
    const vitima = participant({
      id: 'vitima',
      stats: statSheet({ lifesteal: 1000 }),
      currentHp: 1,
      reactionScript: [{ enabled: true, skillId: counterAttack.id, conditions: [] }],
      knownSkills: { [strike.id]: strike, [counterAttack.id]: counterAttack },
    });
    const resultado = duel(participant({ id: 'atacante' }), vitima);

    expect(resultado.finalHpDefender).toBe(0);
  });

  it('é determinístico: mesma seed, mesmo hash', () => {
    const primeiro = hashState(duel(woundedAttacker(1000), participant({ id: 'alvo' })));
    const segundo = hashState(duel(woundedAttacker(1000), participant({ id: 'alvo' })));
    expect(primeiro).toBe(segundo);
  });
});
