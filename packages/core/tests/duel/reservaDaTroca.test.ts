import { describe, expect, it } from 'vitest';
import { HEAL_TAG } from '../../src/duel/heal.js';
import { resolveDuel, type ResolveDuelInput } from '../../src/duel/resolveDuel.js';
import type { DuelEngagementContext, DuelParticipant, ReactionLine } from '../../src/duel/types.js';
import type { SkillDef } from '../../src/skills/types.js';
import type { StatSheet } from '../../src/stats/types.js';

// M38 5/N (D57) — A REAÇÃO CONCEDIDA `onDamaged` RESERVA A TROCA.
//
// §6.4: no máximo uma reação por troca. O `onAttacked` é decidido antes do dano e o
// `onDamaged` depois, então uma reação baseline `onAttacked` sem condição (contra-atacar)
// sempre gastava a troca, e toda reação concedida `onDamaged` — a Bênção do Relicário, o
// Fôlego de Combate — nunca disparava. Medido no torneio: zerar a magnitude delas não mudava
// resultado nenhum.
//
// Decisão do usuário: se o defensor tem uma reação CONCEDIDA `onDamaged` habilitada, com as
// condições satisfeitas e PP para ela, a BASELINE `onAttacked` não dispara naquela troca. Uma
// concedida `onAttacked` continua podendo disparar (é escolha do próprio script concedido).

function stats(overrides: Partial<StatSheet> = {}): StatSheet {
  return { hp: 30000, atk: 1000, def: 300, spd: 100, chc: 0, chd: 1500, eff: 0, efr: 0, pen: 0, heal: 0, lifesteal: 0, focus: 0, vigor: 0, ...overrides };
}

const golpe: SkillDef = {
  id: 'skill-golpe', name: 'Golpe', kind: 'duel', apCost: 0, cooldown: 0,
  multiplier: 1200, flat: 0, scalesWith: 'atk', effects: [], tags: ['physical'],
};
const contra: SkillDef = {
  id: 'skill-contra', name: 'Contra-atacar', kind: 'reaction', apCost: 0, ppCost: 1, cooldown: 0,
  multiplier: 800, flat: 0, scalesWith: 'atk', effects: [], trigger: 'onAttacked', tags: ['physical'],
};
const bencao: SkillDef = {
  id: 'skill-bencao', name: 'Bênção', kind: 'reaction', apCost: 0, ppCost: 1, cooldown: 0,
  multiplier: 150, flat: 0, scalesWith: 'atk', effects: [], trigger: 'onDamaged', tags: [HEAL_TAG],
};
const engagement: DuelEngagementContext = {
  engagementDistance: 1, terrainAccuracyModifier: 0, heightAccuracyModifier: 0, defenderEvasionModifier: 0, battleRound: 1,
};

function participante(id: string, overrides: Partial<DuelParticipant> = {}): DuelParticipant {
  return {
    id, stats: stats(), currentHp: 30000, ap: 5, pp: 3, unitType: 'infantry', weaponType: 'sword', duelRange: 1,
    tacticsScript: [{ enabled: true, skillId: golpe.id, conditions: [] }],
    reactionScript: [], knownSkills: { [golpe.id]: golpe }, cooldowns: {}, activeEffects: [], positionalMultiplier: 1000,
    ...overrides,
  };
}

const baseline: ReactionLine = { enabled: true, skillId: contra.id, conditions: [] };
const concedida: ReactionLine = { enabled: true, skillId: bencao.id, conditions: [], granted: true };

function defensor(script: readonly ReactionLine[], pp = 3): DuelParticipant {
  return participante('def', { pp, reactionScript: script, knownSkills: { [golpe.id]: golpe, [contra.id]: contra, [bencao.id]: bencao } });
}

function reacoesDoDefensor(def: DuelParticipant) {
  const input: ResolveDuelInput = { seed: 7, attacker: participante('atk'), defender: def, effectDefs: {}, engagement };
  return resolveDuel(input)
    .trocas.flatMap((t) => t.actions)
    .filter((a) => a.actorId === 'atk' && a.reaction)
    .map((a) => a.reaction!);
}

describe('a reação concedida onDamaged reserva a troca (D57)', () => {
  it('com a concedida e PP, a baseline onAttacked NÃO dispara, e a cura dispara depois do dano', () => {
    const reacoes = reacoesDoDefensor(defensor([concedida, baseline]));
    expect(reacoes.length).toBeGreaterThan(0);
    expect(reacoes[0]).toMatchObject({ skillId: bencao.id, trigger: 'onDamaged' });
    expect(reacoes[0]!.healDone).toBeGreaterThan(0);
    expect(reacoes.some((r) => r.skillId === contra.id)).toBe(false);
  });

  it('o recíproco: sem a concedida, a baseline onAttacked dispara como sempre', () => {
    const reacoes = reacoesDoDefensor(defensor([baseline]));
    expect(reacoes[0]).toMatchObject({ skillId: contra.id, trigger: 'onAttacked' });
  });

  it('a mesma cura SEM a marca de concedida não reserva nada: a baseline vence (a regra é da concedida)', () => {
    const reacoes = reacoesDoDefensor(defensor([{ ...concedida, granted: undefined }, baseline]));
    expect(reacoes[0]).toMatchObject({ skillId: contra.id, trigger: 'onAttacked' });
  });

  it('sem PP para a concedida, não há reserva — e nada dispara (a baseline também custa PP)', () => {
    const reacoes = reacoesDoDefensor(defensor([concedida, baseline], 0));
    expect(reacoes).toEqual([]);
  });

  it('concedida desabilitada não reserva', () => {
    const reacoes = reacoesDoDefensor(defensor([{ ...concedida, enabled: false }, baseline]));
    expect(reacoes[0]).toMatchObject({ skillId: contra.id });
  });

  it('concedida de 0 PP NÃO reserva: a baseline onAttacked dispara como antes (D57, decisão do usuário)', () => {
    // O Fôlego de Combate custa 0 PP. Com "tem PP para ela" sempre verdade, ele reservaria TODA
    // troca e quem o tem nunca mais contra-atacaria — medido: derrubou as três comps da Sylla,
    // inclusive sem artefato. A reserva é para a reação que COMPETE pelo PP.
    const gratis: SkillDef = { ...bencao, id: 'skill-gratis', ppCost: 0 };
    const def = participante('def', {
      pp: 3,
      reactionScript: [{ enabled: true, skillId: gratis.id, conditions: [], granted: true }, baseline],
      knownSkills: { [golpe.id]: golpe, [contra.id]: contra, [gratis.id]: gratis },
    });
    expect(reacoesDoDefensor(def)[0]).toMatchObject({ skillId: contra.id, trigger: 'onAttacked' });
  });

  it('é determinístico', () => {
    const def = defensor([concedida, baseline]);
    const input: ResolveDuelInput = { seed: 11, attacker: participante('atk'), defender: def, effectDefs: {}, engagement };
    expect(JSON.stringify(resolveDuel(input))).toBe(JSON.stringify(resolveDuel(input)));
  });
});
