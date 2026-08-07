import { describe, expect, it } from 'vitest';
import {
  armoredDamageMultiplier,
  combinedTypeDamageMultiplier,
  typeEffectivenessDamageMultiplier,
  weaponTriangleResult,
} from '../../src/duel/triangle.js';

describe('weaponTriangleResult — §6.8 (dois ciclos)', () => {
  it('espada vence machado: +10% dano, +100 acurácia', () => {
    expect(weaponTriangleResult('sword', 'axe')).toEqual({ damageMultiplier: 1100, accuracyModifier: 100 });
  });

  it('machado perde de espada quando machado ataca espada: -10% dano, -100 acurácia', () => {
    expect(weaponTriangleResult('axe', 'sword')).toEqual({ damageMultiplier: 900, accuracyModifier: -100 });
  });

  it('machado vence lança', () => {
    expect(weaponTriangleResult('axe', 'spear')).toEqual({ damageMultiplier: 1100, accuracyModifier: 100 });
  });

  it('lança vence espada (fecha o ciclo físico)', () => {
    expect(weaponTriangleResult('spear', 'sword')).toEqual({ damageMultiplier: 1100, accuracyModifier: 100 });
  });

  it('mesma arma é neutro', () => {
    expect(weaponTriangleResult('sword', 'sword')).toEqual({ damageMultiplier: 1000, accuracyModifier: 0 });
  });

  it('arcano vence natureza; natureza vence sagrado; sagrado vence arcano (ciclo mágico)', () => {
    expect(weaponTriangleResult('arcane', 'nature')).toEqual({ damageMultiplier: 1100, accuracyModifier: 100 });
    expect(weaponTriangleResult('nature', 'holy')).toEqual({ damageMultiplier: 1100, accuracyModifier: 100 });
    expect(weaponTriangleResult('holy', 'arcane')).toEqual({ damageMultiplier: 1100, accuracyModifier: 100 });
  });

  it('arma física contra arma mágica é neutro (ciclos não se cruzam)', () => {
    expect(weaponTriangleResult('sword', 'arcane')).toEqual({ damageMultiplier: 1000, accuracyModifier: 0 });
  });

  it('arco não participa de nenhum ciclo — sempre neutro no triângulo', () => {
    expect(weaponTriangleResult('bow', 'sword')).toEqual({ damageMultiplier: 1000, accuracyModifier: 0 });
    expect(weaponTriangleResult('sword', 'bow')).toEqual({ damageMultiplier: 1000, accuracyModifier: 0 });
  });
});

describe('typeEffectivenessDamageMultiplier — arqueiro vs flying (§6.8)', () => {
  it('arco causa +25% contra flying', () => {
    expect(typeEffectivenessDamageMultiplier('bow', 'flying')).toBe(1250);
  });

  it('arco não bonifica contra outros tipos', () => {
    expect(typeEffectivenessDamageMultiplier('bow', 'infantry')).toBe(1000);
  });

  it('outras armas não ganham o bônus vs flying', () => {
    expect(typeEffectivenessDamageMultiplier('sword', 'flying')).toBe(1000);
  });
});

describe('armoredDamageMultiplier — §6.8', () => {
  it('armored sofre -20% de dano físico', () => {
    expect(armoredDamageMultiplier('armored', ['physical'])).toBe(800);
  });

  it('armored sofre +20% de dano mágico', () => {
    expect(armoredDamageMultiplier('armored', ['magic'])).toBe(1200);
  });

  it('unidades não-armored não são afetadas', () => {
    expect(armoredDamageMultiplier('infantry', ['physical'])).toBe(1000);
  });

  it('skill sem tag physical/magic não afeta armored', () => {
    expect(armoredDamageMultiplier('armored', ['heal'])).toBe(1000);
  });
});

describe('combinedTypeDamageMultiplier — compõe triângulo + efetividade + armored (passo 5, §6.6)', () => {
  it('multiplica os três fatores em fp-scale (arco vs arqueiro voador armored improvável, mas testa a composição)', () => {
    // espada física vs armored: triângulo neutro (1000) * efetividade neutra (1000) * armored físico (800)
    const result = combinedTypeDamageMultiplier({
      attackerWeapon: 'sword',
      defenderWeapon: 'sword',
      defenderUnitType: 'armored',
      skillTags: ['physical'],
    });
    expect(result).toBe(800);
  });

  it('compõe vantagem de triângulo com penalidade de armored numa só multiplicação', () => {
    // machado vence lança: triângulo 1100. defensor armored + skill física: 800. sem bônus de efetividade (não é flying).
    // fpMul(fpMul(1100,1000),800) = fpMul(1100,800) = 880
    const result = combinedTypeDamageMultiplier({
      attackerWeapon: 'axe',
      defenderWeapon: 'spear',
      defenderUnitType: 'armored',
      skillTags: ['physical'],
    });
    expect(result).toBe(880);
  });
});
