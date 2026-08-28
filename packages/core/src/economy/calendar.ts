import { intDiv, intMul } from '../math/fixed.js';
import type { CivilDate, ResetSchedule } from './types.js';

// M14, sub-sessão 2/N — a trava de tempo da masmorra de dificuldade alta: "reseta a
// entrada em dias X da semana ou do mês dependendo do conteúdo" (decisão do usuário).
//
// Saber que DIA é um instante exige calendário, e `packages/core` não pode tocar `Date`
// (regra 1) — nem por conveniência, porque `Date` é sensível a fuso do processo e o
// servidor, o cliente e o `sim-cli` precisam concordar byte a byte. A conversão é feita
// com o algoritmo civil de Howard Hinnant, aritmética inteira pura.
//
// **O reset é em UTC** (registrado em DECISIONS.md): sem uma referência, "dia" não tem
// definição; fuso por jogador é conceito que o projeto não tem. O conteúdo pode declarar a
// hora do reset (`hourUtc`), que é o suficiente para deslocar a virada.

const MS_PER_DAY = 86_400_000;
const MS_PER_HOUR = 3_600_000;

// Quantos dias inteiros se passaram desde a época, truncando SEMPRE para baixo — inclusive
// antes de 1970, onde `Math.trunc` sozinho arredondaria para o lado errado.
export function daysFromEpochMs(ms: number): number {
  const days = intDiv(ms, MS_PER_DAY);
  return ms < 0 && intMul(days, MS_PER_DAY) !== ms ? days - 1 : days;
}

// Hinnant, `civil_from_days`: dias desde 1970-01-01 → data civil proléptica gregoriana.
export function civilFromDays(days: number): CivilDate {
  const z = days + 719_468;
  const era = intDiv(z >= 0 ? z : z - 146_096, 146_097);
  const doe = z - intMul(era, 146_097); // 0..146096
  const yoe = intDiv(doe - intDiv(doe, 1460) + intDiv(doe, 36_524) - intDiv(doe, 146_096), 365); // 0..399
  const y = yoe + intMul(era, 400);
  const doy = doe - (intMul(365, yoe) + intDiv(yoe, 4) - intDiv(yoe, 100)); // 0..365
  const mp = intDiv(intMul(5, doy) + 2, 153); // 0..11
  const d = doy - intDiv(intMul(153, mp) + 2, 5) + 1; // 1..31
  const m = mp < 10 ? mp + 3 : mp - 9; // 1..12
  return { year: m <= 2 ? y + 1 : y, month: m, day: d };
}

// Hinnant, `days_from_civil`: o inverso exato de `civilFromDays`.
export function daysFromCivil(date: CivilDate): number {
  const y = date.month <= 2 ? date.year - 1 : date.year;
  const era = intDiv(y >= 0 ? y : y - 399, 400);
  const yoe = y - intMul(era, 400); // 0..399
  const mp = date.month > 2 ? date.month - 3 : date.month + 9; // 0..11
  const doy = intDiv(intMul(153, mp) + 2, 5) + date.day - 1; // 0..365
  const doe = intMul(yoe, 365) + intDiv(yoe, 4) - intDiv(yoe, 100) + doy; // 0..146096
  return intMul(era, 146_097) + doe - 719_468;
}

// 0 = domingo. 1970-01-01 (dia 0) foi quinta-feira, daí o deslocamento de 4.
export function weekdayFromDays(days: number): number {
  const raw = (days + 4) % 7;
  return raw < 0 ? raw + 7 : raw;
}

function matchesSchedule(days: number, schedule: ResetSchedule): boolean {
  if (schedule.kind === 'weekdays') return schedule.days.includes(weekdayFromDays(days));
  // Dia do mês declarado que não existe naquele mês (31 em fevereiro) simplesmente não
  // acontece — nenhum reset naquele mês, em vez de escorregar para o dia 1 do seguinte.
  return schedule.days.includes(civilFromDays(days).day);
}

// Quantos dias para trás vale a pena procurar o reset anterior. Uma agenda mensal legítima
// tem no máximo ~31 dias entre resets; 400 cobre com folga qualquer agenda válida e evita
// um laço sem fim quando a agenda está vazia (nunca reseta).
const MAX_LOOKBACK_DAYS = 400;

// O instante do último reset declarado em ou antes de `nowMs`, ou `null` se a agenda não
// reseta nunca (lista de dias vazia).
export function lastResetAtMs(nowMs: number, schedule: ResetSchedule): number | null {
  const hourOffsetMs = intMul(schedule.hourUtc ?? 0, MS_PER_HOUR);
  const today = daysFromEpochMs(nowMs);

  for (let i = 0; i <= MAX_LOOKBACK_DAYS; i++) {
    const day = today - i;
    if (!matchesSchedule(day, schedule)) continue;
    const resetAt = intMul(day, MS_PER_DAY) + hourOffsetMs;
    // O dia de hoje só conta depois de passada a hora do reset.
    if (resetAt <= nowMs) return resetAt;
  }
  return null;
}
