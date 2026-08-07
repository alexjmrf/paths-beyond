// §6.6 — `acc` não existe como stat de personagem (§4.1 não o lista): todo mundo parte
// da mesma baseline de 100% de acerto, só desviada por triângulo de arma e terreno/altura.
export const ACC_BASELINE = 1000;
const HIT_FLOOR = 50;
const HIT_CEILING = 1000;

export interface AccuracyInput {
  readonly triangleAccuracyModifier: number; // weaponTriangleResult(...).accuracyModifier
  readonly defenderEvasion: number; // computeEvasionFromSpd(...)
  readonly terrainAccuracyModifier: number; // externo — grid é M3, 0 se não houver
  readonly heightAccuracyModifier: number; // externo — grid é M3, 0 se não houver
}

export function computeHitChance(input: AccuracyInput): number {
  const raw =
    ACC_BASELINE +
    input.triangleAccuracyModifier -
    input.defenderEvasion +
    input.terrainAccuracyModifier +
    input.heightAccuracyModifier;
  return Math.min(Math.max(raw, HIT_FLOOR), HIT_CEILING);
}
