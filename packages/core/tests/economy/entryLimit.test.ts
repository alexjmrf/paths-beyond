import { describe, expect, it } from 'vitest';
import { daysFromCivil } from '../../src/economy/calendar.js';
import { consumeEntry, entriesRemaining, resolveEntries } from '../../src/economy/entryLimit.js';
import type { EntryLimitRule, EntryLimitState } from '../../src/economy/types.js';

// M14, sub-sessão 2/N — "a dificuldade alta é travada por tempo" (decisão do usuário: a
// entrada reseta em dias declarados da semana ou do mês, conforme o conteúdo).
//
// Mesma forma da energia: o estado guardado é `{used, asOfMs}` e o saldo é DERIVADO do
// instante. Nada aqui lê relógio.

const DIA = 86_400_000;
const emUtc = (ano: number, mes: number, dia: number, hora = 0): number =>
  daysFromCivil({ year: ano, month: mes, day: dia }) * DIA + hora * 3_600_000;

// 3 entradas, resetando às terças e sábados.
const regra: EntryLimitRule = { maxEntries: 3, resetOn: { kind: 'weekdays', days: [2, 6] } };

describe('resolveEntries', () => {
  it('não reseta antes do dia declarado', () => {
    const estado: EntryLimitState = { used: 3, asOfMs: emUtc(2024, 1, 3) }; // quarta
    expect(resolveEntries(estado, emUtc(2024, 1, 4), regra).used).toBe(3); // quinta
  });

  it('reseta ao atravessar o dia declarado', () => {
    const estado: EntryLimitState = { used: 3, asOfMs: emUtc(2024, 1, 3) }; // quarta
    expect(resolveEntries(estado, emUtc(2024, 1, 6, 1), regra).used).toBe(0); // sábado
  });

  it('reseta uma vez só: atravessar o mesmo reset de novo não devolve mais nada', () => {
    const estado: EntryLimitState = { used: 3, asOfMs: emUtc(2024, 1, 3) };
    const depoisDoReset = resolveEntries(estado, emUtc(2024, 1, 6, 1), regra);
    const gastou = consumeEntry(depoisDoReset, emUtc(2024, 1, 6, 2), regra);
    expect(gastou.ok).toBe(true);
    expect(resolveEntries(gastou.state, emUtc(2024, 1, 6, 20), regra).used).toBe(1);
  });

  it('relógio andando para trás não devolve entrada', () => {
    const estado: EntryLimitState = { used: 2, asOfMs: emUtc(2024, 1, 10) };
    expect(resolveEntries(estado, emUtc(2023, 1, 10), regra)).toEqual(estado);
  });

  it('agenda por dia do mês também reseta', () => {
    const mensal: EntryLimitRule = { maxEntries: 1, resetOn: { kind: 'monthDays', days: [1] } };
    const estado: EntryLimitState = { used: 1, asOfMs: emUtc(2024, 3, 20) };
    expect(resolveEntries(estado, emUtc(2024, 3, 25), mensal).used).toBe(1);
    expect(resolveEntries(estado, emUtc(2024, 4, 1, 5), mensal).used).toBe(0);
  });
});

describe('consumeEntry', () => {
  it('gasta uma entrada por vez até o teto', () => {
    let estado: EntryLimitState = { used: 0, asOfMs: emUtc(2024, 1, 3) };
    for (let i = 1; i <= 3; i++) {
      const r = consumeEntry(estado, emUtc(2024, 1, 3, i), regra);
      expect(r.ok).toBe(true);
      estado = r.state;
      expect(estado.used).toBe(i);
    }
    const estourou = consumeEntry(estado, emUtc(2024, 1, 3, 20), regra);
    expect(estourou.ok).toBe(false);
    if (!estourou.ok) expect(estourou.reason).toContain('entrada');
    expect(estourou.state.used).toBe(3);
  });

  it('depois do reset dá para entrar de novo', () => {
    const esgotado: EntryLimitState = { used: 3, asOfMs: emUtc(2024, 1, 3) };
    const noSabado = consumeEntry(esgotado, emUtc(2024, 1, 6, 1), regra);
    expect(noSabado.ok).toBe(true);
    expect(noSabado.state.used).toBe(1);
  });

  it('entriesRemaining conta o que sobrou depois do reset derivado', () => {
    const esgotado: EntryLimitState = { used: 3, asOfMs: emUtc(2024, 1, 3) };
    expect(entriesRemaining(esgotado, emUtc(2024, 1, 4), regra)).toBe(0);
    expect(entriesRemaining(esgotado, emUtc(2024, 1, 6, 1), regra)).toBe(3);
  });

  it('agenda vazia significa entrada que nunca volta', () => {
    const semReset: EntryLimitRule = { maxEntries: 1, resetOn: { kind: 'weekdays', days: [] } };
    const gasto = consumeEntry({ used: 1, asOfMs: emUtc(2024, 1, 1) }, emUtc(2030, 1, 1), semReset);
    expect(gasto.ok).toBe(false);
  });
});
