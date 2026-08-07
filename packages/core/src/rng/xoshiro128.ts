export interface RngState {
  readonly s0: number;
  readonly s1: number;
  readonly s2: number;
  readonly s3: number;
}

export interface RngResult {
  readonly value: number;
  readonly state: RngState;
}

function rotl(x: number, k: number): number {
  return ((x << k) | (x >>> (32 - k))) >>> 0;
}

// splitmix32: expande uma seed de 32 bits em um stream de valores bem distribuídos,
// usado só para inicializar os 4 words de estado do xoshiro128** (nunca começa zerado).
function splitmix32Next(state: number): { value: number; state: number } {
  const nextState = (state + 0x9e3779b9) >>> 0;
  let z = nextState;
  z = Math.imul(z ^ (z >>> 16), 0x85ebca6b) >>> 0;
  z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35) >>> 0;
  z = (z ^ (z >>> 16)) >>> 0;
  return { value: z, state: nextState };
}

export function seedRng(seed: number): RngState {
  let state = seed >>> 0;
  const values: number[] = [];
  for (let i = 0; i < 4; i++) {
    const result = splitmix32Next(state);
    values.push(result.value);
    state = result.state;
  }
  const [s0, s1, s2, s3] = values as [number, number, number, number];
  return { s0, s1, s2, s3 };
}

// xoshiro128** (Blackman/Vigna). Estado imutável: cada chamada devolve o próximo
// valor e o próximo estado, sem mutar o estado recebido.
export function nextUint32(state: RngState): RngResult {
  const { s0, s1, s2, s3 } = state;

  const value = (Math.imul(rotl(Math.imul(s1, 5) >>> 0, 7), 9)) >>> 0;
  const t = (s1 << 9) >>> 0;

  const s2p = (s2 ^ s0) >>> 0;
  const s3p = (s3 ^ s1) >>> 0;
  const s1n = (s1 ^ s2p) >>> 0;
  const s0n = (s0 ^ s3p) >>> 0;
  const s2n = (s2p ^ t) >>> 0;
  const s3n = rotl(s3p, 11);

  return { value, state: { s0: s0n, s1: s1n, s2: s2n, s3: s3n } };
}
