import { seedRng, type RngState } from './xoshiro128.js';

// FNV-1a 32-bit: hash simples e determinístico de uma string em um uint32,
// usado para derivar a seed de cada sub-stream a partir do seu contexto.
function fnv1a32(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

// Deriva um sub-stream isolado por contexto: adicionar uma rolagem em um `purpose`
// nunca desloca as rolagens de outro `purpose`, `unitId` ou `round`.
export function rngFor(battleSeed: number, round: number, unitId: string, purpose: string): RngState {
  const contextKey = `${battleSeed}:${round}:${unitId}:${purpose}`;
  return seedRng(fnv1a32(contextKey));
}
