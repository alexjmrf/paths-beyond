import { fpMul } from '../math/fixed.js';

// §6.7.3 — único ganho de evasão do jogo, e vem só de spd.
const SPD_EVASION_BASELINE = 100;
const EVASION_CAP = 150; // +150 fp-scale = +15%, cap rígido (só o topo — spd não tem piso)
const EVASION_PER_SPD_POINT = 500; // 0.5 em fp-scale

export function computeEvasionFromSpd(spd: number): number {
  const raw = fpMul(spd - SPD_EVASION_BASELINE, EVASION_PER_SPD_POINT);
  return Math.min(raw, EVASION_CAP);
}
