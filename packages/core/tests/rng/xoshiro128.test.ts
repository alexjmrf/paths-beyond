import { describe, expect, it } from 'vitest';
import { nextUint32, seedRng, type RngState } from '../../src/rng/xoshiro128.js';

function takeSequence(state: RngState, count: number): number[] {
  const values: number[] = [];
  let current = state;
  for (let i = 0; i < count; i++) {
    const result = nextUint32(current);
    values.push(result.value);
    current = result.state;
  }
  return values;
}

describe('seedRng + nextUint32 determinism', () => {
  it('produces the exact same 1000-value sequence twice from the same seed', () => {
    const a = takeSequence(seedRng(42), 1000);
    const b = takeSequence(seedRng(42), 1000);
    expect(a).toEqual(b);
  });

  it('produces a different sequence for a different seed', () => {
    const a = takeSequence(seedRng(1), 50);
    const b = takeSequence(seedRng(2), 50);
    expect(a).not.toEqual(b);
  });

  it('is pure: calling nextUint32 does not mutate the input state', () => {
    const state = seedRng(7);
    const before = { ...state };
    nextUint32(state);
    expect(state).toEqual(before);
  });

  it('always yields uint32 values (0 <= value <= 2**32 - 1)', () => {
    const values = takeSequence(seedRng(123), 200);
    for (const value of values) {
      expect(Number.isInteger(value)).toBe(true);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(0xffffffff);
    }
  });

  it('state is a plain serializable object (survives JSON roundtrip and resumes identically)', () => {
    const state = seedRng(99);
    const { state: midState } = nextUint32(state);
    const serialized = JSON.parse(JSON.stringify(midState)) as RngState;

    const continuedFromLive = takeSequence(midState, 10);
    const continuedFromSerialized = takeSequence(serialized, 10);
    expect(continuedFromSerialized).toEqual(continuedFromLive);
  });

  it('never gets stuck returning all-zero state for small seeds', () => {
    const state = seedRng(0);
    expect(Object.values(state).some((v) => v !== 0)).toBe(true);
  });
});
