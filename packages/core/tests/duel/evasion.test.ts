import { describe, expect, it } from 'vitest';
import { computeEvasionFromSpd } from '../../src/duel/evasion.js';

describe('computeEvasionFromSpd — §6.7.3', () => {
  it('spd na baseline (100) não concede evasão', () => {
    expect(computeEvasionFromSpd(100)).toBe(0);
  });

  it('cresce 0.5 de evasão (fp-scale) por ponto de spd acima da baseline', () => {
    // (150 - 100) * 0.5 = 25
    expect(computeEvasionFromSpd(150)).toBe(25);
  });

  it('respeita o cap rígido de +150 (15%)', () => {
    // (400 - 100) * 0.5 = 150 -> exatamente no cap
    expect(computeEvasionFromSpd(400)).toBe(150);
    // (1000 - 100) * 0.5 = 450 -> deveria estourar sem o cap
    expect(computeEvasionFromSpd(1000)).toBe(150);
  });

  it('spd abaixo da baseline gera evasão negativa (só o topo tem cap, não o piso)', () => {
    expect(computeEvasionFromSpd(50)).toBe(-25);
  });
});
