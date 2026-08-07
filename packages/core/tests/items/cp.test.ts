import { describe, expect, it } from 'vitest';
import { computeCombatPower } from '../../src/items/cp.js';
import type { StatSheet } from '../../src/stats/types.js';

function statSheet(overrides: Partial<StatSheet> = {}): StatSheet {
  return {
    hp: 0, atk: 0, def: 0, spd: 0, chc: 0, chd: 0,
    eff: 0, efr: 0, pen: 0, heal: 0, lifesteal: 0, focus: 0, vigor: 0,
    ...overrides,
  };
}

describe('computeCombatPower — §7.5', () => {
  it('bate com o cálculo à mão para um stat sheet fixo', () => {
    // base = 1000*1.6 + 500*2.2 + 2000*0.3 = 1600+1100+600 = 3300
    // critFactor = 1 + 0.5*1.5 = 1.75 -> 3300*1.75 = 5775
    // spdFactor = 1 + 200/4000 = 1.05 -> 5775*1.05 = 6063 (truncado)
    const stats = statSheet({ atk: 1000, def: 500, hp: 2000, chc: 500, chd: 1500, spd: 200 });
    expect(computeCombatPower(stats)).toBe(6063);
  });

  it('stat sheet zerado dá CP zero', () => {
    expect(computeCombatPower(statSheet())).toBe(0);
  });

  it('focus e vigor aumentam o CP (eixo de recurso)', () => {
    const base = computeCombatPower(statSheet({ atk: 1000 }));
    const withResources = computeCombatPower(statSheet({ atk: 1000, focus: 600, vigor: 750 }));
    expect(withResources).toBeGreaterThan(base);
  });

  it('eff e efr aumentam o CP', () => {
    const base = computeCombatPower(statSheet({ atk: 1000 }));
    const withEffEfr = computeCombatPower(statSheet({ atk: 1000, eff: 400, efr: 400 }));
    expect(withEffEfr).toBeGreaterThan(base);
  });

  it('é determinístico e puro (mesma entrada, mesma saída sempre)', () => {
    const stats = statSheet({ atk: 800, def: 400, hp: 3000, spd: 150, chc: 300, chd: 1600 });
    expect(computeCombatPower(stats)).toBe(computeCombatPower(stats));
  });
});
