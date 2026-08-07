import { describe, expect, it } from 'vitest';
import { RULES_VERSION, STAT_KEYS, aggregateStatSheet, fpMul, rngFor, seedRng } from '../src/index.js';

describe('packages/core public API (index.ts)', () => {
  it('exposes RULES_VERSION as a stable string', () => {
    expect(typeof RULES_VERSION).toBe('string');
    expect(RULES_VERSION.length).toBeGreaterThan(0);
  });

  it('exposes math, rng and stats through the same barrel', () => {
    expect(fpMul(2000, 500)).toBe(1000);
    expect(seedRng(1)).toBeDefined();
    expect(rngFor(1, 1, 'u1', 'test')).toBeDefined();

    const sheet = aggregateStatSheet({
      baseCurve: {},
      awakeningMultiplier: 1000,
      classAndImprintFlat: [],
      equipmentFlat: [],
      equipmentPct: [],
      talentFlat: [],
      talentPct: [],
      setBonus: [],
    });
    for (const key of STAT_KEYS) {
      expect(sheet[key]).toBe(0);
    }
  });
});
