import { describe, expect, it } from 'vitest';
import { HEAL_TAG, applyHeal, computeHeal, isHealingSkill } from '../../src/duel/heal.js';
import type { SkillDef } from '../../src/skills/types.js';

// §6.5.3/§4.1 (M10, sub-sessão 7/N) — a spec não define fórmula de cura em lugar nenhum:
// §2 só lista `heal` como "cura dada/recebida, %", §6.4 cita "Cura de emergência" entre as
// reações que classes/talentos adicionam, e §6.5.3 diz que a assistência aplica "cura/buff
// em efeito integral" sem dizer integral de quê. A fórmula abaixo é decisão de design
// tomada com o usuário e registrada em DECISIONS.md: mesma forma dos passos 1-2 de §6.6
// (multiplier × stat de scalesWith + flat), modificada pelo `heal` de QUEM CURA, sem
// mitigação, sem triângulo, sem posicional, e sem rolagem nenhuma — cura é determinística.

function healSkill(overrides: Partial<SkillDef> = {}): SkillDef {
  return {
    id: 'skill-cura',
    name: 'Cura',
    kind: 'duel',
    apCost: 1,
    cooldown: 0,
    multiplier: 1000,
    flat: 0,
    scalesWith: 'atk',
    effects: [],
    tags: [HEAL_TAG],
    ...overrides,
  };
}

describe('isHealingSkill — a tag `heal` é o discriminador (§6.5.3)', () => {
  it('skill com a tag cura', () => {
    expect(isHealingSkill(healSkill())).toBe(true);
  });

  it('skill sem a tag não cura, mesmo com multiplier alto', () => {
    expect(isHealingSkill(healSkill({ tags: ['physical'] }))).toBe(false);
  });

  it('a tag convive com outras', () => {
    expect(isHealingSkill(healSkill({ tags: ['holy', HEAL_TAG] }))).toBe(true);
  });
});

describe('computeHeal — §6.6 passos 1-2 sem mitigação (M10 sub-sessão 7/N)', () => {
  it('multiplier × stat + flat, com heal=0 devolvendo a base crua', () => {
    // 1000 × 1.200 = 1200, + 50 flat = 1250
    const heal = computeHeal({ healerStat: 1000, skill: { multiplier: 1200, flat: 50 }, healerHeal: 0 });
    expect(heal).toBe(1250);
  });

  it('escala com o stat de quem cura', () => {
    const fraco = computeHeal({ healerStat: 500, skill: { multiplier: 1000, flat: 0 }, healerHeal: 0 });
    const forte = computeHeal({ healerStat: 1500, skill: { multiplier: 1000, flat: 0 }, healerHeal: 0 });
    expect(fraco).toBe(500);
    expect(forte).toBe(1500);
  });

  it('`heal` do curador é um bônus percentual em fp-scale (+25% → 250)', () => {
    const base = computeHeal({ healerStat: 1000, skill: { multiplier: 1000, flat: 0 }, healerHeal: 0 });
    const comHeal = computeHeal({ healerStat: 1000, skill: { multiplier: 1000, flat: 0 }, healerHeal: 250 });
    expect(base).toBe(1000);
    expect(comHeal).toBe(1250);
  });

  it('`heal` negativo reduz a cura sem nunca virar dano (piso 0)', () => {
    const heal = computeHeal({ healerStat: 1000, skill: { multiplier: 1000, flat: 0 }, healerHeal: -2000 });
    expect(heal).toBe(0);
  });

  it('só flat, sem multiplier, é uma cura fixa que ignora o build', () => {
    const heal = computeHeal({ healerStat: 9999, skill: { multiplier: 0, flat: 300 }, healerHeal: 0 });
    expect(heal).toBe(300);
  });

  it('é determinística: nenhuma rolagem, mesma entrada → mesma saída', () => {
    const args = { healerStat: 777, skill: { multiplier: 1234, flat: 13 }, healerHeal: 137 };
    expect(computeHeal(args)).toBe(computeHeal(args));
  });

  it('trunca em vez de arredondar (regra 2 do CLAUDE.md)', () => {
    // 777 × 1.234 = 958,818 → trunc 958; ×1,137 = 1089,246 → trunc 1089
    expect(computeHeal({ healerStat: 777, skill: { multiplier: 1234, flat: 0 }, healerHeal: 137 })).toBe(1089);
  });
});

describe('applyHeal — bordas de HP', () => {
  it('soma ao HP atual', () => {
    expect(applyHeal(3000, 5000, 1200)).toBe(4200);
  });

  it('nunca passa do HP máximo', () => {
    expect(applyHeal(4800, 5000, 1200)).toBe(5000);
  });

  it('NÃO ressuscita: alvo em 0 continua em 0 (mesmo precedente de applyPeriodicHp, round.ts)', () => {
    expect(applyHeal(0, 5000, 1200)).toBe(0);
  });

  it('cura de 0 não muda nada', () => {
    expect(applyHeal(3000, 5000, 0)).toBe(3000);
  });
});
