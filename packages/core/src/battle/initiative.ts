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

// §5.3 — "iniciativa = spd + rand(0,99)". `round` é 0 para a lista inicial (rolada UMA vez
// no início da batalha) e o round corrente para quem entra depois (§5.3: "unidades que entram
// depois — reforços, invocações"), o que dá a cada invocação um stream próprio sem tocar no
// da montagem.
export function rollInitiative(battleSeed: number, round: number, unitId: Id, spd: number): number {
  return spd + (nextUint32(rngFor(battleSeed, round, unitId, 'initiative')).value % ROLL_SPAN);
}

// §5.3 — "Empate resolvido de forma determinística por (unitId), nunca por RNG adicional."
function byInitiativeThenId(a: InitiativeEntry, b: InitiativeEntry): number {
  if (a.initiative !== b.initiative) return b.initiative - a.initiative;
  return a.unitId < b.unitId ? -1 : a.unitId > b.unitId ? 1 : 0;
}

// §5.3 — cada unidade tem seu próprio sub-stream (rngFor por unitId), então a ordem em que
// as unidades são passadas não influencia o resultado.
export function computeInitiativeOrder(units: readonly InitiativeUnit[], battleSeed: number): readonly InitiativeEntry[] {
  const entries = units.map((unit): InitiativeEntry => ({
    unitId: unit.id,
    initiative: rollInitiative(battleSeed, 0, unit.id, unit.spd),
  }));

  return [...entries].sort(byInitiativeThenId);
}

// §5.3 — "Unidades que entram depois (reforços, invocações) são inseridas na posição
// correspondente ao seu valor de iniciativa." INSERIR, não recalcular: a regra 9 do
// CLAUDE.md ("a lista não é recalculada durante a batalha") continua valendo byte a byte —
// nenhuma entrada existente é re-rolada nem reordenada entre si.
export function insertIntoInitiativeOrder(
  order: readonly InitiativeEntry[],
  entry: InitiativeEntry,
): readonly InitiativeEntry[] {
  const index = order.findIndex((existing) => byInitiativeThenId(entry, existing) < 0);
  if (index < 0) return [...order, entry];
  return [...order.slice(0, index), entry, ...order.slice(index)];
}
