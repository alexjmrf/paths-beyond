import { fpMul } from '../math/fixed.js';
import { STAT_KEYS, type StatKey, type StatModifier, type StatSheet } from './types.js';

// Entrada da agregação de §4.1, passos 1-7 (o passo 8 — buffs/debuffs ativos —
// só existe dentro do duelo e não faz parte do stat sheet estático; fica para M2).
export interface AggregateStatsInput {
  readonly baseCurve: Partial<StatSheet>; // passo 1a: curva da classe no nível N
  readonly awakeningMultiplier: number; // passo 1b: escala 1000 (1000 = ×1.0)
  readonly classAndImprintFlat: readonly StatModifier[]; // passo 2
  readonly equipmentFlat: readonly StatModifier[]; // passo 3
  readonly equipmentPct: readonly StatModifier[]; // passo 4
  readonly talentFlat: readonly StatModifier[]; // passo 5
  readonly talentPct: readonly StatModifier[]; // passo 6
  readonly setBonus: readonly StatModifier[]; // passo 7
}

function emptySheet(): StatSheet {
  const sheet = {} as StatSheet;
  for (const key of STAT_KEYS) sheet[key] = 0;
  return sheet;
}

function applyBase(baseCurve: Partial<StatSheet>, awakeningMultiplier: number): StatSheet {
  const sheet = emptySheet();
  for (const key of STAT_KEYS) {
    sheet[key] = fpMul(baseCurve[key] ?? 0, awakeningMultiplier);
  }
  return sheet;
}

// Exportadas porque duel/effects.ts (M2) reusa o mesmo padrão flat+pct para aplicar
// efeitos ativos ao stat sheet dentro do duelo (§4.1 passo 8), sem duplicar a lógica.
export function addFlat(sheet: StatSheet, mods: readonly StatModifier[]): StatSheet {
  const next = { ...sheet };
  for (const m of mods) {
    if (m.flat !== undefined) next[m.stat] += m.flat;
  }
  return next;
}

// Soma todos os % do mesmo passo por stat antes de multiplicar, para que
// +15% e +10% virem uma única ×1.25 em vez de compor (×1.15 × ×1.10).
export function multiplyByPctSum(sheet: StatSheet, mods: readonly StatModifier[]): StatSheet {
  const pctSums = new Map<StatKey, number>();
  for (const m of mods) {
    if (m.pct !== undefined) pctSums.set(m.stat, (pctSums.get(m.stat) ?? 0) + m.pct);
  }
  const next = { ...sheet };
  for (const [stat, pctSum] of pctSums) {
    next[stat] += fpMul(next[stat], pctSum);
  }
  return next;
}

// Bônus de set (§7.4): passo aditivo — flat soma direto; pct soma uma fração
// do valor corrente (equivalente a multiplicar só nesse ponto da cadeia).
function applySetBonus(sheet: StatSheet, mods: readonly StatModifier[]): StatSheet {
  const next = { ...sheet };
  for (const m of mods) {
    if (m.flat !== undefined) next[m.stat] += m.flat;
    if (m.pct !== undefined) next[m.stat] += fpMul(next[m.stat], m.pct);
  }
  return next;
}

export function aggregateStatSheet(input: AggregateStatsInput): StatSheet {
  let sheet = applyBase(input.baseCurve, input.awakeningMultiplier); // 1
  sheet = addFlat(sheet, input.classAndImprintFlat); // 2
  sheet = addFlat(sheet, input.equipmentFlat); // 3
  sheet = multiplyByPctSum(sheet, input.equipmentPct); // 4
  sheet = addFlat(sheet, input.talentFlat); // 5
  sheet = multiplyByPctSum(sheet, input.talentPct); // 6
  sheet = applySetBonus(sheet, input.setBonus); // 7
  return sheet;
}
