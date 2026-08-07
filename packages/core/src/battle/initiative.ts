import { rngFor } from '../rng/rngFor.js';
import { nextUint32 } from '../rng/xoshiro128.js';
import type { Id } from '../types.js';

export interface InitiativeUnit {
  readonly id: Id;
  readonly spd: number;
}

export interface InitiativeEntry {
  readonly unitId: Id;
  readonly initiative: number;
}

const ROLL_SPAN = 100; // rand(0,99)

// §5.3 — "iniciativa = spd + rand(0,99)", rolado UMA vez no início da batalha, stream
// 'initiative'. Cada unidade tem seu próprio sub-stream (rngFor por unitId) — a ordem em
// que as unidades são passadas não influencia o resultado.
export function computeInitiativeOrder(units: readonly InitiativeUnit[], battleSeed: number): readonly InitiativeEntry[] {
  const entries = units.map((unit): InitiativeEntry => {
    const roll = nextUint32(rngFor(battleSeed, 0, unit.id, 'initiative')).value % ROLL_SPAN;
    return { unitId: unit.id, initiative: unit.spd + roll };
  });

  return [...entries].sort((a, b) => {
    if (a.initiative !== b.initiative) return b.initiative - a.initiative;
    // §5.3 — "Empate resolvido de forma determinística por (unitId), nunca por RNG adicional."
    return a.unitId < b.unitId ? -1 : a.unitId > b.unitId ? 1 : 0;
  });
}
