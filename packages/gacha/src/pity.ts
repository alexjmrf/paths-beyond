import type { PityState } from './types.js';

// D18 — pity duro contado. Separado da rolagem porque são duas perguntas distintas: "a
// garantia vale agora?" e "quanto vale o contador depois?". Juntas dentro de `rollSummon`
// elas ficariam expressas como dois `if` no meio do sorteio, e é justamente esta transição
// que precisa ser afirmável sozinha.

export function isPityArmed(pity: PityState, threshold: number): boolean {
  return pity.rollsSinceNew >= threshold;
}

export interface PityTransition {
  // A rolagem entregou um personagem que o jogador ainda não tinha.
  readonly grantedNew: boolean;
  // O jogador já possui o pool inteiro: não há o que garantir.
  readonly poolExhausted: boolean;
}

export function advancePity(pity: PityState, transition: PityTransition): PityState {
  if (transition.grantedNew) return { rollsSinceNew: 0 };

  // Pool esgotado: o contador CONGELA. Avançar acumularia uma garantia sem destino, e
  // consumi-la seria pior — o jogador perderia uma garantia que nada pagou. Congelado, se
  // um personagem novo entrar no pool amanhã, a garantia que ele já tinha continua de pé.
  if (transition.poolExhausted) return pity;

  return { rollsSinceNew: pity.rollsSinceNew + 1 };
}
