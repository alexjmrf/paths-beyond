import { lastResetAtMs } from './calendar.js';
import type { ConsumeEntryResult, EntryLimitRule, EntryLimitState } from './types.js';

// M14, sub-sessão 2/N — a trava de tempo da dificuldade alta (decisão do usuário: a
// masmorra difícil dá mais recursos, é sempre manual e tem entrada limitada, que reseta em
// dias declarados da semana ou do mês).
//
// Mesma forma da energia, pelo mesmo motivo: o saldo é DERIVADO de `{used, asOfMs}` mais o
// instante, em vez de ser um contador que alguém precisa lembrar de zerar. Não existe
// tarefa periódica, e nenhuma linha aqui lê relógio.

export function resolveEntries(state: EntryLimitState, nowMs: number, rule: EntryLimitRule): EntryLimitState {
  // Relógio andando para trás não devolve entrada (mesma postura de `resolveEnergy`).
  if (nowMs < state.asOfMs) return state;

  const lastReset = lastResetAtMs(nowMs, rule.resetOn);
  // Só zera se o reset caiu DEPOIS da última apuração: atravessar o mesmo reset duas vezes
  // não devolve entrada duas vezes.
  const resetou = lastReset !== null && lastReset > state.asOfMs;

  return { used: resetou ? 0 : state.used, asOfMs: nowMs };
}

export function entriesRemaining(state: EntryLimitState, nowMs: number, rule: EntryLimitRule): number {
  const resolved = resolveEntries(state, nowMs, rule);
  const remaining = rule.maxEntries - resolved.used;
  return remaining > 0 ? remaining : 0;
}

export function consumeEntry(state: EntryLimitState, nowMs: number, rule: EntryLimitRule): ConsumeEntryResult {
  const resolved = resolveEntries(state, nowMs, rule);
  if (resolved.used >= rule.maxEntries) {
    return {
      ok: false,
      reason: `sem entrada disponível: ${resolved.used} de ${rule.maxEntries} usadas até o próximo reset`,
      state: resolved,
    };
  }
  return { ok: true, state: { used: resolved.used + 1, asOfMs: nowMs } };
}
