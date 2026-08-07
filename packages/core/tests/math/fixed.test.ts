import { describe, expect, it } from 'vitest';
import { FP_SCALE, fpDiv, fpMul, fpPct } from '../../src/math/fixed.js';

describe('FP_SCALE', () => {
  it('is 1000 (three decimal digits of precision)', () => {
    expect(FP_SCALE).toBe(1000);
  });
});

describe('fpMul', () => {
  it('multiplies two fp-scaled values back into fp-scale (2.0 * 0.5 = 1.0)', () => {
    expect(fpMul(2000, 500)).toBe(1000);
  });

  it('is exact when the product divides evenly', () => {
    expect(fpMul(1000, 333)).toBe(333);
  });

  it('truncates toward zero on a positive fractional remainder', () => {
    // 7 * 700 / 1000 = 4.9 -> truncates to 4, never rounds to 5
    expect(fpMul(7, 700)).toBe(4);
  });

  it('truncates toward zero on a negative fractional remainder', () => {
    expect(fpMul(-7, 700)).toBe(-4);
  });

  it('treats FP_SCALE as the multiplicative identity', () => {
    expect(fpMul(1234, FP_SCALE)).toBe(1234);
  });
});

describe('fpDiv', () => {
  it('divides two fp-scaled values back into fp-scale (1.0 / 4.0 = 0.25)', () => {
    expect(fpDiv(1000, 4000)).toBe(250);
  });

  it('truncates toward zero on a positive fractional remainder', () => {
    // 1000 * 1000 / 3 = 333333.33... -> truncates to 333333
    expect(fpDiv(1000, 3)).toBe(333333);
  });

  it('truncates toward zero on a negative fractional remainder', () => {
    expect(fpDiv(-1000, 3)).toBe(-333333);
  });
});

describe('fpPct', () => {
  it('reads 45.7% as the fp-scaled literal 457', () => {
    // 45.7% of 1000 is 457
    expect(fpPct(1000, 457)).toBe(457);
  });

  it('truncates toward zero like fpMul', () => {
    expect(fpPct(7, 700)).toBe(4);
  });

  it('returns 0 for a 0% modifier', () => {
    expect(fpPct(9999, 0)).toBe(0);
  });
});
