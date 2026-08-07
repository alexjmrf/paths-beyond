import { FP_SCALE } from '../math/fixed.js';
import { rngFor } from '../rng/rngFor.js';
import { nextUint32 } from '../rng/xoshiro128.js';
import type { StatKey } from '../stats/types.js';
import { ENHANCE_MILESTONES, type EnhanceLevel, type EnhanceRates, type ItemInstance, type SubstatWeightEntry, type ValueRange } from './types.js';

const NEXT_MILESTONE: Readonly<Partial<Record<EnhanceLevel, EnhanceLevel>>> = { 0: 3, 3: 6, 6: 9, 9: 12, 12: 15 };
const RATE_KEY_BY_CURRENT: Readonly<Partial<Record<EnhanceLevel, keyof EnhanceRates>>> = {
  0: 'toThree',
  3: 'toSix',
  6: 'toNine',
  9: 'toTwelve',
  12: 'toFifteen',
};

export interface AttemptEnhanceInput {
  readonly item: ItemInstance;
  readonly seed: number;
  readonly rates: EnhanceRates;
  readonly substatWeights: readonly SubstatWeightEntry[];
}

export interface AttemptEnhanceResult {
  readonly item: ItemInstance;
  readonly success: boolean;
}

function pickWeighted<T extends { readonly weight: number }>(entries: readonly T[], rngValue: number): T {
  const totalWeight = entries.reduce((sum, entry) => sum + entry.weight, 0);
  const roll = rngValue % totalWeight;
  let cursor = 0;
  for (const entry of entries) {
    cursor += entry.weight;
    if (roll < cursor) return entry;
  }
  return entries[entries.length - 1] as T;
}

function rollInRange(rngValue: number, range: ValueRange): number {
  const span = range.max - range.min + 1;
  return range.min + (rngValue % span);
}

function rollUint32(seed: number, id: string, purpose: string): number {
  return nextUint32(rngFor(seed, 0, id, purpose)).value;
}

// §7.3 — no marco, adiciona um substat novo se houver <4 e ainda houver stat elegível
// (nem mainstat, nem já presente); senão rola um substat existente (escolhido
// uniformemente) para cima, valor do incremento sorteado na mesma faixa do stat.
function applySuccessfulEnhance(
  item: ItemInstance,
  input: AttemptEnhanceInput,
): readonly ItemInstance['substats'][number][] {
  const chosenStats = new Set(item.substats.map((s) => s.stat));
  const eligibleNew = input.substatWeights.filter((w) => w.stat !== item.mainstat.stat && !chosenStats.has(w.stat));

  if (item.substats.length < 4 && eligibleNew.length > 0) {
    const picked = pickWeighted(eligibleNew, rollUint32(input.seed, item.id, `enhance-${item.enhance}-new-stat`));
    const value = rollInRange(rollUint32(input.seed, item.id, `enhance-${item.enhance}-new-value`), picked.valueRange);
    return [...item.substats, { stat: picked.stat, value, rolls: 1 }];
  }

  const index =
    rollUint32(input.seed, item.id, `enhance-${item.enhance}-pick-existing`) % item.substats.length;
  const target = item.substats[index] as ItemInstance['substats'][number];
  const range: ValueRange = input.substatWeights.find((w) => w.stat === target.stat)?.valueRange ?? { min: 0, max: 0 };
  const increase = rollInRange(rollUint32(input.seed, item.id, `enhance-${item.enhance}-roll-up`), range);

  return item.substats.map((substat, i) =>
    i === index ? { stat: substat.stat as StatKey, value: substat.value + increase, rolls: substat.rolls + 1 } : substat,
  );
}

export function attemptEnhance(input: AttemptEnhanceInput): AttemptEnhanceResult {
  const { item } = input;
  if (item.enhance >= ENHANCE_MILESTONES[ENHANCE_MILESTONES.length - 1]!) {
    return { item, success: false };
  }

  const nextLevel = NEXT_MILESTONE[item.enhance] as EnhanceLevel;
  const rateKey = RATE_KEY_BY_CURRENT[item.enhance] as keyof EnhanceRates;
  const chance = input.rates[rateKey];

  const roll = rollUint32(input.seed, item.id, `enhance-${item.enhance}`) % FP_SCALE;
  if (roll >= chance) {
    return { item, success: false };
  }

  const substats = applySuccessfulEnhance(item, input);
  return { item: { ...item, enhance: nextLevel, substats }, success: true };
}
