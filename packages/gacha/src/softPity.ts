import type { SoftPityCurve } from './types.js';

// M38 3/N (D54) — a curva de SOFT PITY.
//
// A forma é a de Genshin, aceita pelo usuário com os números da tabela de D54: a taxa de `Hero`
// é constante até a rampa, soma uma parcela fixa por rolagem a partir de `softStart`, e é 1000
// no teto duro. Tudo em milésimos INTEIROS (regra 2).

/** A taxa de `Hero` na rolagem `rollNumber` (1 = a primeira desde o último `Hero`). */
export function softRate(curve: SoftPityCurve, ceiling: number, rollNumber: number): number {
  if (rollNumber >= ceiling) return 1000;
  const rampa = rollNumber >= curve.softStart ? curve.step * (rollNumber - curve.softStart + 1) : 0;
  return Math.min(1000, curve.baseRate + rampa);
}
