import { describe, expect, it } from 'vitest';
import { nextUint32, type RngState } from '../../src/rng/xoshiro128.js';
import { rngFor } from '../../src/rng/rngFor.js';

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

describe('rngFor', () => {
  it('is deterministic: identical context always derives the identical stream', () => {
    const a = takeSequence(rngFor(42, 3, 'unit-1', 'damage'), 100);
    const b = takeSequence(rngFor(42, 3, 'unit-1', 'damage'), 100);
    expect(a).toEqual(b);
  });

  it('derives a different stream when only the purpose changes', () => {
    const damage = takeSequence(rngFor(42, 3, 'unit-1', 'damage'), 50);
    const crit = takeSequence(rngFor(42, 3, 'unit-1', 'crit'), 50);
    expect(damage).not.toEqual(crit);
  });

  it('derives a different stream when only the unitId changes', () => {
    const unit1 = takeSequence(rngFor(42, 3, 'unit-1', 'damage'), 50);
    const unit2 = takeSequence(rngFor(42, 3, 'unit-2', 'damage'), 50);
    expect(unit1).not.toEqual(unit2);
  });

  it('derives a different stream when only the round changes', () => {
    const round3 = takeSequence(rngFor(42, 3, 'unit-1', 'damage'), 50);
    const round4 = takeSequence(rngFor(42, 4, 'unit-1', 'damage'), 50);
    expect(round3).not.toEqual(round4);
  });

  it('derives a different stream when only the battleSeed changes', () => {
    const seedA = takeSequence(rngFor(1, 3, 'unit-1', 'damage'), 50);
    const seedB = takeSequence(rngFor(2, 3, 'unit-1', 'damage'), 50);
    expect(seedA).not.toEqual(seedB);
  });

  it('adding a roll to one purpose does not shift another purpose\'s stream (independent sub-streams)', () => {
    // Simula "sistema A" consumindo N rolagens extras antes de "sistema B" começar a rolar.
    // O stream de B deve ser idêntico independentemente de quanto A consumiu, porque
    // cada purpose deriva sua própria seed em vez de compartilhar um cursor.
    const bBeforeAConsumes = takeSequence(rngFor(7, 1, 'unit-1', 'B'), 10);

    let aState = rngFor(7, 1, 'unit-1', 'A');
    for (let i = 0; i < 25; i++) {
      aState = nextUint32(aState).state;
    }

    const bAfterAConsumes = takeSequence(rngFor(7, 1, 'unit-1', 'B'), 10);

    expect(bAfterAConsumes).toEqual(bBeforeAConsumes);
  });
});
