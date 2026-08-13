import { describe, expect, it } from 'vitest';
import {
  LETHAL_SURVIVE_TAG,
  findLethalTriggerSkill,
  isLethalTriggerSkill,
  isSurviveLethalSkill,
  lethalUsesOf,
  persistentLethalTriggersUsed,
} from '../../src/duel/lethal.js';
import type { SkillDef } from '../../src/skills/types.js';

// §6.4 (M10, sub-sessão 8/N) — `onLethal` NÃO é uma reação: não passa por `selectReaction`,
// não tem conditions e não custa PP. É consequência automática de um evento (decisão de
// design do usuário, registrada em DECISIONS.md — "prever a própria morte" não é
// interessante). Este arquivo cobre só a seleção pura; o efeito no duelo está em
// lethalInDuel.test.ts.

function skill(overrides: Partial<SkillDef> = {}): SkillDef {
  return {
    id: 'skill-x',
    name: 'X',
    kind: 'duel',
    apCost: 0,
    cooldown: 0,
    multiplier: 1000,
    flat: 0,
    scalesWith: 'atk',
    effects: [],
    tags: [],
    ...overrides,
  };
}

const survive = skill({
  id: 'skill-ultimo-suspiro',
  trigger: 'onLethal',
  lethalUses: 'perDuel',
  multiplier: 0,
  tags: [LETHAL_SURVIVE_TAG],
});

const explode = skill({
  id: 'skill-explosao',
  trigger: 'onLethal',
  lethalUses: 'perBattle',
  multiplier: 1500,
  tags: ['physical'],
});

const normal = skill({ id: 'skill-golpe' });

describe('classificação de uma skill de gatilho de morte', () => {
  it('só `trigger:onLethal` é gatilho de morte', () => {
    expect(isLethalTriggerSkill(survive)).toBe(true);
    expect(isLethalTriggerSkill(explode)).toBe(true);
    expect(isLethalTriggerSkill(normal)).toBe(false);
    expect(isLethalTriggerSkill(skill({ trigger: 'onAttacked' }))).toBe(false);
  });

  it('a tag `survive` é o que discrimina prevenir-a-morte de efeito-ao-morrer', () => {
    expect(isSurviveLethalSkill(survive)).toBe(true);
    expect(isSurviveLethalSkill(explode)).toBe(false);
  });

  it('a tag `survive` sozinha, sem o trigger, não faz nada', () => {
    expect(isSurviveLethalSkill(skill({ tags: [LETHAL_SURVIVE_TAG] }))).toBe(false);
  });

  it('`lethalUses` ausente cai no escopo mais conservador (perDuel)', () => {
    expect(lethalUsesOf(skill({ trigger: 'onLethal' }))).toBe('perDuel');
    expect(lethalUsesOf(survive)).toBe('perDuel');
    expect(lethalUsesOf(explode)).toBe('perBattle');
  });
});

describe('findLethalTriggerSkill', () => {
  it('encontra a skill de gatilho entre as conhecidas', () => {
    const found = findLethalTriggerSkill({ knownSkills: { [normal.id]: normal, [survive.id]: survive } });
    expect(found?.id).toBe(survive.id);
  });

  it('devolve null quando nenhuma skill conhecida tem o trigger', () => {
    expect(findLethalTriggerSkill({ knownSkills: { [normal.id]: normal } })).toBeNull();
  });

  it('ignora uma skill já usada (é o que implementa a frequência)', () => {
    const found = findLethalTriggerSkill({
      knownSkills: { [survive.id]: survive },
      usedSkillIds: [survive.id],
    });
    expect(found).toBeNull();
  });

  it('ignora uma skill em cooldown', () => {
    const found = findLethalTriggerSkill({
      knownSkills: { [survive.id]: survive },
      cooldowns: { [survive.id]: 2 },
    });
    expect(found).toBeNull();
  });

  it('`requireSurvive` filtra a variante de dano — caminho sem matador identificável', () => {
    expect(findLethalTriggerSkill({ knownSkills: { [explode.id]: explode }, requireSurvive: true })).toBeNull();
    expect(
      findLethalTriggerSkill({ knownSkills: { [survive.id]: survive }, requireSurvive: true })?.id,
    ).toBe(survive.id);
  });

  it('`requirePerBattle` filtra perDuel — fora do duelo não há duelo a que se limitar', () => {
    expect(findLethalTriggerSkill({ knownSkills: { [survive.id]: survive }, requirePerBattle: true })).toBeNull();
    const perBattleSurvive = { ...survive, id: 'skill-teimosia', lethalUses: 'perBattle' as const };
    expect(
      findLethalTriggerSkill({ knownSkills: { [perBattleSurvive.id]: perBattleSurvive }, requirePerBattle: true })?.id,
    ).toBe(perBattleSurvive.id);
  });

  it('determinismo: a ordem de inserção do Record não muda quem é escolhida', () => {
    const outra = { ...explode, id: 'skill-aaa-primeira' };
    const ordemA = findLethalTriggerSkill({ knownSkills: { [outra.id]: outra, [explode.id]: explode } });
    const ordemB = findLethalTriggerSkill({ knownSkills: { [explode.id]: explode, [outra.id]: outra } });
    expect(ordemA?.id).toBe(ordemB?.id);
    expect(ordemA?.id).toBe(outra.id); // ordenação lexicográfica de ids, não de inserção
  });
});

describe('persistentLethalTriggersUsed', () => {
  const knownSkills = { [survive.id]: survive, [explode.id]: explode };

  it('mantém só o que é `perBattle` — `perDuel` recarrega no duelo seguinte', () => {
    expect(persistentLethalTriggersUsed([survive.id, explode.id], knownSkills)).toEqual([explode.id]);
  });

  it('descarta id desconhecido em vez de vazar estado sem dono', () => {
    expect(persistentLethalTriggersUsed(['skill-fantasma'], knownSkills)).toEqual([]);
  });

  it('não duplica um id que já vinha usado', () => {
    expect(persistentLethalTriggersUsed([explode.id, explode.id], knownSkills)).toEqual([explode.id]);
  });
});
