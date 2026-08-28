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

// Contagem inteira que NÃO está em escala 1000: energia por intervalo de tempo, unidades
// de material, custos. `fpMul`/`fpDiv` não servem — eles dividem/multiplicam pela escala,
// e um instante em milissegundos multiplicado por 1000 chega perto do limite seguro de
// inteiro do JS. Ficam aqui, e não soltos no chamador, porque a regra do projeto é que
// multiplicação e divisão só acontecem nos helpers deste arquivo.
export function intMul(a: number, b: number): number {
  return Math.trunc(a * b);
}

export function intDiv(a: number, b: number): number {
  return Math.trunc(a / b);
}
