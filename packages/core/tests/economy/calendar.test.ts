import { describe, expect, it } from 'vitest';
import { civilFromDays, daysFromCivil, daysFromEpochMs, lastResetAtMs, weekdayFromDays } from '../../src/economy/calendar.js';
import type { ResetSchedule } from '../../src/economy/types.js';

// M14, sub-sessão 2/N — a trava de tempo da masmorra de dificuldade alta: decisão do
// usuário, "reseta a entrada em dias X da semana ou do mês dependendo do conteúdo".
//
// Isso exige saber que dia é um instante — e `packages/core` não pode tocar `Date`
// (regra 1). Daí a conversão civil ser aritmética inteira própria (algoritmo de Hinnant),
// testada contra datas conhecidas e por ida-e-volta. O teste também não usa `Date`: se
// usasse, estaria conferindo a implementação contra a mesma biblioteca que ela existe
// para não precisar.

const DIA = 86_400_000;

describe('conversão de instante para data civil, sem Date', () => {
  it('o dia 0 é 1970-01-01 (a época do Unix)', () => {
    expect(civilFromDays(0)).toEqual({ year: 1970, month: 1, day: 1 });
    expect(daysFromCivil({ year: 1970, month: 1, day: 1 })).toBe(0);
  });

  it('1970-01-01 foi uma quinta-feira (0 = domingo)', () => {
    expect(weekdayFromDays(0)).toBe(4);
  });

  it('2024-01-01 é o dia 19723 e caiu numa segunda', () => {
    expect(daysFromCivil({ year: 2024, month: 1, day: 1 })).toBe(19723);
    expect(civilFromDays(19723)).toEqual({ year: 2024, month: 1, day: 1 });
    expect(weekdayFromDays(19723)).toBe(1);
  });

  it('2024 é bissexto: 29 de fevereiro existe e 1º de março vem logo depois', () => {
    const fev29 = daysFromCivil({ year: 2024, month: 2, day: 29 });
    expect(civilFromDays(fev29)).toEqual({ year: 2024, month: 2, day: 29 });
    expect(civilFromDays(fev29 + 1)).toEqual({ year: 2024, month: 3, day: 1 });
  });

  it('2023 não é bissexto: 28 de fevereiro é seguido por 1º de março', () => {
    const fev28 = daysFromCivil({ year: 2023, month: 2, day: 28 });
    expect(civilFromDays(fev28 + 1)).toEqual({ year: 2023, month: 3, day: 1 });
  });

  it('1900 não é bissexto e 2000 é (a regra dos séculos)', () => {
    expect(civilFromDays(daysFromCivil({ year: 1900, month: 2, day: 28 }) + 1)).toEqual({
      year: 1900,
      month: 3,
      day: 1,
    });
    expect(civilFromDays(daysFromCivil({ year: 2000, month: 2, day: 28 }) + 1)).toEqual({
      year: 2000,
      month: 2,
      day: 29,
    });
  });

  it('ida e volta bate para 20 anos de dias seguidos', () => {
    const inicio = daysFromCivil({ year: 2015, month: 1, day: 1 });
    for (let d = inicio; d < inicio + 7305; d++) {
      expect(daysFromCivil(civilFromDays(d))).toBe(d);
    }
  });

  it('o dia de um instante trunca para baixo, inclusive antes da época', () => {
    expect(daysFromEpochMs(0)).toBe(0);
    expect(daysFromEpochMs(DIA - 1)).toBe(0);
    expect(daysFromEpochMs(DIA)).toBe(1);
    expect(daysFromEpochMs(-1)).toBe(-1);
  });
});

describe('lastResetAtMs — quando foi o último reset declarado', () => {
  // 2024-01-01 é segunda. Uma agenda de terças e sábados reseta em 02/01 e 06/01.
  const tercasESabados: ResetSchedule = { kind: 'weekdays', days: [2, 6] };

  const emUtc = (ano: number, mes: number, dia: number, hora = 0): number =>
    daysFromCivil({ year: ano, month: mes, day: dia }) * DIA + hora * 3_600_000;

  it('numa quarta, o último reset foi a terça anterior', () => {
    const quarta = emUtc(2024, 1, 3, 10);
    expect(lastResetAtMs(quarta, tercasESabados)).toBe(emUtc(2024, 1, 2));
  });

  it('na própria terça antes da hora do reset, vale o sábado anterior', () => {
    const tercaDeMadrugada = emUtc(2024, 1, 2, 0) - 1;
    expect(lastResetAtMs(tercaDeMadrugada, tercasESabados)).toBe(emUtc(2023, 12, 30));
  });

  it('a hora do reset é respeitada quando declarada', () => {
    const comHora: ResetSchedule = { kind: 'weekdays', days: [2], hourUtc: 5 };
    expect(lastResetAtMs(emUtc(2024, 1, 2, 4), comHora)).toBe(emUtc(2023, 12, 26, 5));
    expect(lastResetAtMs(emUtc(2024, 1, 2, 5), comHora)).toBe(emUtc(2024, 1, 2, 5));
  });

  it('agenda por dia do mês reseta no dia declarado', () => {
    const diaUmEQuinze: ResetSchedule = { kind: 'monthDays', days: [1, 15] };
    expect(lastResetAtMs(emUtc(2024, 3, 20), diaUmEQuinze)).toBe(emUtc(2024, 3, 15));
    expect(lastResetAtMs(emUtc(2024, 3, 10), diaUmEQuinze)).toBe(emUtc(2024, 3, 1));
    // Atravessa a virada de mês para trás.
    expect(lastResetAtMs(emUtc(2024, 4, 1) - 1, diaUmEQuinze)).toBe(emUtc(2024, 3, 15));
  });

  it('dia 31 declarado simplesmente não acontece nos meses que não o têm', () => {
    const diaTrintaEUm: ResetSchedule = { kind: 'monthDays', days: [31] };
    // Fevereiro não tem 31: em 2024-03-05 o último reset foi 31 de janeiro.
    expect(lastResetAtMs(emUtc(2024, 3, 5), diaTrintaEUm)).toBe(emUtc(2024, 1, 31));
  });

  it('agenda sem dia nenhum nunca reseta', () => {
    expect(lastResetAtMs(emUtc(2024, 3, 5), { kind: 'weekdays', days: [] })).toBeNull();
  });
});
