import { describe, expect, it } from 'vitest';
import {
  computeDamage,
  isCriticalHit,
  rollCritRoll,
  rollDamageVariance,
  type DamageInput,
} from '../../src/duel/damage.js';

function input(overrides: Partial<DamageInput> = {}): DamageInput {
  return {
    attackerAtk: 1000,
    attackerDef: 1000,
    attackerHp: 1000,
    defenderDef: 1000,
    skill: { multiplier: 1000, flat: 0, scalesWith: 'atk' },
    attackerPen: 0,
    typeDamageMultiplier: 1000,
    positionalMultiplier: 1000,
    isCriticalHit: false,
    criticalDamageMultiplier: 1500,
    damageDealtPctSum: 0,
    damageTakenReductionPctSum: 0,
    varianceRoll: 1000,
    ...overrides,
  };
}

describe('computeDamage — os 10 passos de §6.6', () => {
  it('caso neutro: 1000 ATK vs 1000 DEF, skill 100%, sem pen/crítico/buffs/variância → 500', () => {
    // passo 1: base = fpMul(1000,1000)+0 = 1000
    // passo 2: defEfetiva = fpPct(1000, 1000-0) = 1000
    // passo 3: mitigacao = fpDiv(300000, 300000 + 1000*300) = fpDiv(300000,600000) = 500 (~50% aos 1000 DEF)
    // passo 4: posMitig = fpMul(1000,500) = 500
    // passos 5-9 neutros não alteram o valor
    expect(computeDamage(input())).toBe(500);
  });

  it('penetração reduz a DEF efetiva e portanto a mitigação', () => {
    expect(computeDamage(input({ attackerPen: 500 }))).toBe(666);
  });

  it('penetração é limitada ao cap de 700 (§4.1) mesmo se o stat bruto for maior', () => {
    expect(computeDamage(input({ attackerPen: 700 }))).toBe(computeDamage(input({ attackerPen: 900 })));
  });

  it('crítico multiplica pelo chd do atacante', () => {
    // afterCrit = fpMul(500, 1500) = 750
    expect(computeDamage(input({ isCriticalHit: true, criticalDamageMultiplier: 1500 }))).toBe(750);
  });

  it('soma de %dano causado aumenta o resultado (passo 8)', () => {
    // afterDamageDealtBuff = fpMul(500, 1000+200) = 600
    expect(computeDamage(input({ damageDealtPctSum: 200 }))).toBe(600);
  });

  it('soma de %redução de dano recebido diminui o resultado (passo 8)', () => {
    // afterBuffs = fpMul(500, 1000-300) = 350
    expect(computeDamage(input({ damageTakenReductionPctSum: 300 }))).toBe(350);
  });

  it('variância aplica o roll já resolvido (±3%, passo 9)', () => {
    expect(computeDamage(input({ varianceRoll: 1030 }))).toBe(515);
    expect(computeDamage(input({ varianceRoll: 970 }))).toBe(485);
  });

  it('triângulo e modificador posicional multiplicam o resultado (passos 5-6)', () => {
    // afterType = fpMul(500,1100) = 550; afterPositional = fpMul(550,1100) = 605
    expect(computeDamage(input({ typeDamageMultiplier: 1100, positionalMultiplier: 1100 }))).toBe(605);
  });

  it('scalesWith usa DEF ou HP do atacante em vez de ATK quando declarado na skill', () => {
    const byDef = computeDamage(
      input({ attackerDef: 2000, skill: { multiplier: 1000, flat: 0, scalesWith: 'def' } }),
    );
    const byAtk = computeDamage(input({ attackerAtk: 2000 }));
    expect(byDef).toBe(byAtk);
  });

  it('resultado nunca fica abaixo de 1, mesmo quando a mitigação zeraria o dano (passo 10)', () => {
    const result = computeDamage(
      input({ attackerAtk: 10, defenderDef: 100000, skill: { multiplier: 1000, flat: 0, scalesWith: 'atk' } }),
    );
    expect(result).toBe(1);
  });

  it('flat da skill soma ao dano base antes de qualquer mitigação (passo 1)', () => {
    const withFlat = computeDamage(input({ skill: { multiplier: 1000, flat: 100, scalesWith: 'atk' } }));
    const withoutFlat = computeDamage(input());
    expect(withFlat).toBeGreaterThan(withoutFlat);
  });
});

describe('rollCritRoll / isCriticalHit — rolagem de crítico (stream determinístico)', () => {
  it('mapeia um uint32 para o intervalo fp-scale [0, 999]', () => {
    const rolled = rollCritRoll(0xffffffff);
    expect(rolled).toBeGreaterThanOrEqual(0);
    expect(rolled).toBeLessThan(1000);
  });

  it('é determinístico: o mesmo uint32 sempre mapeia para o mesmo valor', () => {
    expect(rollCritRoll(123456)).toBe(rollCritRoll(123456));
  });

  it('isCriticalHit compara a rolagem contra chc: rolagem abaixo de chc é crítico', () => {
    // rollCritRoll(500) = 500 % 1000 = 500
    expect(isCriticalHit(500, 600)).toBe(true);
    expect(isCriticalHit(500, 400)).toBe(false);
  });

  it('chc é limitado a 1000 (§4.1) mesmo que o stat bruto exceda o cap', () => {
    expect(isCriticalHit(999, 5000)).toBe(true);
  });
});

describe('rollDamageVariance — ±3% (passo 9, stream "damage-variance")', () => {
  it('mapeia para o intervalo fechado [970, 1030]', () => {
    for (const raw of [0, 1, 60, 61, 1000, 0xffffffff]) {
      const value = rollDamageVariance(raw);
      expect(value).toBeGreaterThanOrEqual(970);
      expect(value).toBeLessThanOrEqual(1030);
    }
  });

  it('é determinístico: o mesmo uint32 sempre mapeia para o mesmo valor', () => {
    expect(rollDamageVariance(777)).toBe(rollDamageVariance(777));
  });
});
