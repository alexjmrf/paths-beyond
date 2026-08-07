import { describe, expect, it } from 'vitest';
import { ACC_BASELINE, computeHitChance } from '../../src/duel/accuracy.js';

function input(overrides: Partial<Parameters<typeof computeHitChance>[0]> = {}) {
  return {
    triangleAccuracyModifier: 0,
    defenderEvasion: 0,
    terrainAccuracyModifier: 0,
    heightAccuracyModifier: 0,
    ...overrides,
  };
}

describe('computeHitChance — §6.6', () => {
  it('baseline neutra é 1000 (100%) — todo mundo acerta por padrão sem stat de acurácia', () => {
    expect(ACC_BASELINE).toBe(1000);
    expect(computeHitChance(input())).toBe(1000);
  });

  it('vantagem de triângulo soma +100 de acurácia', () => {
    expect(computeHitChance(input({ triangleAccuracyModifier: 100 }))).toBe(1000); // já no teto, clamp
  });

  it('desvantagem de triângulo subtrai 100 de acurácia', () => {
    expect(computeHitChance(input({ triangleAccuracyModifier: -100 }))).toBe(900);
  });

  it('evasão do defensor reduz a chance de acerto', () => {
    expect(computeHitChance(input({ defenderEvasion: 150 }))).toBe(850);
  });

  it('modificadores de terreno e altura entram na soma (externos, resolvidos fora do core em M2)', () => {
    expect(computeHitChance(input({ terrainAccuracyModifier: -50, heightAccuracyModifier: 100 }))).toBe(1000);
  });

  it('nunca fica abaixo do piso de 50 (5%)', () => {
    expect(computeHitChance(input({ defenderEvasion: 5000 }))).toBe(50);
  });

  it('nunca ultrapassa o teto de 1000 (100%)', () => {
    expect(computeHitChance(input({ triangleAccuracyModifier: 100, heightAccuracyModifier: 500 }))).toBe(1000);
  });
});
