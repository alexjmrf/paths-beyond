import { intDiv, intMul } from '../math/fixed.js';
import type { EnergyRules, EnergyState, SpendEnergyResult } from './types.js';

// §10 — "Energia de conta limita o farm diário."
//
// Decisão do usuário (M14 1/N): regeneração CONTÍNUA — +1 a cada `refillIntervalMs` até
// `max` —, não recarga diária. O teto e o intervalo são dado (`packages/data`), nunca
// número aqui.
//
// A energia não é um contador que alguém incrementa: é DERIVADA do par
// `{stored, asOfMs}` mais o instante atual. É o que dispensa qualquer tarefa periódica no
// servidor e o que mantém `packages/core` sem relógio (regra 1) — `nowMs` entra por
// parâmetro.

export function resolveEnergy(state: EnergyState, nowMs: number, rules: EnergyRules): EnergyState {
  // Relógio andando para trás (ajuste de hora, réplica atrasada): nada acontece. Avançar
  // `asOfMs` para um instante ANTERIOR daria energia de graça na próxima apuração.
  const elapsed = nowMs - state.asOfMs;
  if (elapsed <= 0) return state;

  // Já no teto: não há o que acumular, e o relógio de regeneração passa a contar do agora.
  // Sem isto, um dia inteiro parado no teto viraria um dia de energia no instante em que o
  // jogador gastasse a primeira unidade.
  if (state.stored >= rules.max) return { stored: rules.max, asOfMs: nowMs };

  const gained = intDiv(elapsed, rules.refillIntervalMs);
  if (gained <= 0) return state; // fração de intervalo: fica valendo, `asOfMs` não anda

  const stored = state.stored + gained;
  if (stored >= rules.max) return { stored: rules.max, asOfMs: nowMs };

  // Abaixo do teto, `asOfMs` anda só o que foi CONSUMIDO em intervalos completos: a sobra
  // continua contando para o próximo ponto.
  return { stored, asOfMs: state.asOfMs + intMul(gained, rules.refillIntervalMs) };
}

export function spendEnergy(state: EnergyState, nowMs: number, rules: EnergyRules, cost: number): SpendEnergyResult {
  const energy = resolveEnergy(state, nowMs, rules);

  // Custo zero ou negativo devolveria energia — uma masmorra malformada não pode virar
  // fonte de energia.
  if (!Number.isInteger(cost) || cost <= 0) {
    return { ok: false, reason: `custo de energia inválido: ${cost}`, energy };
  }
  if (energy.stored < cost) {
    return { ok: false, reason: `energia insuficiente: ${energy.stored} de ${cost}`, energy };
  }

  // Ao sair do teto o relógio de regeneração passa a correr a partir de agora.
  const wasAtCap = energy.stored >= rules.max;
  return {
    ok: true,
    energy: { stored: energy.stored - cost, asOfMs: wasAtCap ? nowMs : energy.asOfMs },
  };
}
