export const FP_SCALE = 1000;

export function fpMul(a: number, b: number): number {
  return Math.trunc((a * b) / FP_SCALE);
}

export function fpDiv(a: number, b: number): number {
  return Math.trunc((a * FP_SCALE) / b);
}

export function fpPct(value: number, pct: number): number {
  return fpMul(value, pct);
}
