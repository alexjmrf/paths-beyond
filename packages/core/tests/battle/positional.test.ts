import { describe, expect, it } from 'vitest';
import { computePositionalModifiers, type PositionalModifiersInput } from '../../src/battle/positional.js';

function input(overrides: Partial<PositionalModifiersInput> = {}): PositionalModifiersInput {
  return {
    defenderPos: { x: 5, y: 5 },
    attackerAllyPositions: [],
    attackerHeight: 0,
    defenderHeight: 0,
    defenderTerrainDefBonus: 0,
    defenderTerrainEvaBonus: 0,
    defenderPp: 2,
    ...overrides,
  };
}

describe('computePositionalModifiers — §5.5', () => {
  it('sem nenhuma condição especial, é tudo neutro', () => {
    const result = computePositionalModifiers(input());
    expect(result).toEqual({
      damageMultiplier: 1000,
      accuracyModifier: 0,
      defenderEvasionModifier: 0,
      criticalDamageBonus: 0,
      ppLockedForTroca1: false,
    });
  });

  it('flanco: 1 aliado do atacante adjacente ao defensor dá +10% de dano e trava PP na troca 1', () => {
    const result = computePositionalModifiers(
      input({ attackerAllyPositions: [{ x: 5, y: 4 }] }), // adjacente a (5,5)
    );
    expect(result.damageMultiplier).toBe(1100);
    expect(result.ppLockedForTroca1).toBe(true);
    expect(result.defenderEvasionModifier).toBe(0); // cerco que penaliza evasão, não flanco
  });

  it('cerco: 2+ aliados adjacentes dá o mesmo +10% de dano do flanco (não dobra) e -15% de evasão do defensor', () => {
    const result = computePositionalModifiers(
      input({
        attackerAllyPositions: [
          { x: 5, y: 4 },
          { x: 5, y: 6 },
        ],
      }),
    );
    expect(result.damageMultiplier).toBe(1100);
    expect(result.defenderEvasionModifier).toBe(-150);
    expect(result.ppLockedForTroca1).toBe(true);
  });

  it('aliados não adjacentes ao defensor não contam para flanco/cerco', () => {
    const result = computePositionalModifiers(input({ attackerAllyPositions: [{ x: 0, y: 0 }] }));
    expect(result.damageMultiplier).toBe(1000);
    expect(result.ppLockedForTroca1).toBe(false);
  });

  it('altura: +5% de dano e +10% de acurácia por nível de diferença quando o atacante está mais alto', () => {
    const result = computePositionalModifiers(input({ attackerHeight: 2, defenderHeight: 0 }));
    expect(result.damageMultiplier).toBe(1100); // 1000 + 2*50
    expect(result.accuracyModifier).toBe(200); // 2*100
  });

  it('defensor mais alto não concede bônus de altura ao atacante', () => {
    const result = computePositionalModifiers(input({ attackerHeight: 0, defenderHeight: 3 }));
    expect(result.damageMultiplier).toBe(1000);
    expect(result.accuracyModifier).toBe(0);
  });

  it('terreno do defensor aplica defBonus (reduz o multiplicador de dano) e evaBonus (soma à evasão)', () => {
    const result = computePositionalModifiers(input({ defenderTerrainDefBonus: 150, defenderTerrainEvaBonus: 80 }));
    expect(result.damageMultiplier).toBe(850);
    expect(result.defenderEvasionModifier).toBe(80);
  });

  it('emboscada: defensor com 0 PP dá +15% de dano crítico ao atacante', () => {
    const result = computePositionalModifiers(input({ defenderPp: 0 }));
    expect(result.criticalDamageBonus).toBe(150);
  });

  it('defensor com PP > 0 não é emboscada', () => {
    const result = computePositionalModifiers(input({ defenderPp: 1 }));
    expect(result.criticalDamageBonus).toBe(0);
  });

  it('combina múltiplas condições simultâneas (cerco + altura + terreno + emboscada)', () => {
    const result = computePositionalModifiers(
      input({
        attackerAllyPositions: [
          { x: 5, y: 4 },
          { x: 5, y: 6 },
        ],
        attackerHeight: 1,
        defenderHeight: 0,
        defenderTerrainDefBonus: 50,
        defenderTerrainEvaBonus: 20,
        defenderPp: 0,
      }),
    );
    // dano: 1000 + 100 (cerco) + 50 (altura 1 nível) - 50 (terreno) = 1100
    expect(result.damageMultiplier).toBe(1100);
    // acurácia: 100 (altura)
    expect(result.accuracyModifier).toBe(100);
    // evasão: 20 (terreno) - 150 (cerco) = -130
    expect(result.defenderEvasionModifier).toBe(-130);
    expect(result.criticalDamageBonus).toBe(150);
    expect(result.ppLockedForTroca1).toBe(true);
  });
});
