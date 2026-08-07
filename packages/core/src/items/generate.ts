import { rngFor } from '../rng/rngFor.js';
import { nextUint32 } from '../rng/xoshiro128.js';
import type { StatKey } from '../stats/types.js';
import type { Id } from '../types.js';
import type {
  GearSlot,
  ItemInstance,
  MainstatWeightEntry,
  Rarity,
  SubstatWeightEntry,
  ValueRange,
} from './types.js';

// §7.1 — "Weapon: sempre atk flat; Helmet: sempre hp flat; Armor: sempre def flat."
// Regra estrutural, não número de balanceamento — fica no core, não em dado.
const FIXED_MAINSTAT_BY_SLOT: Partial<Record<GearSlot, StatKey>> = {
  weapon: 'atk',
  helmet: 'hp',
  armor: 'def',
};

// §7.2 — "rarity ... // substats iniciais: 1/2/3/4". Regra estrutural, não balanceamento.
const SUBSTAT_COUNT_BY_RARITY: Record<Rarity, number> = {
  common: 1,
  rare: 2,
  heroic: 3,
  epic: 4,
};

export interface GenerateItemInput {
  readonly id: Id;
  readonly setId: Id;
  readonly slot: GearSlot;
  readonly rarity: Rarity;
  readonly ilvl: number;
  readonly seed: number;
  readonly substatWeights: readonly SubstatWeightEntry[];
  readonly mainstatWeights: readonly MainstatWeightEntry[];
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

function rollUint32(seed: number, id: Id, purpose: string): number {
  return nextUint32(rngFor(seed, 0, id, purpose)).value;
}

// §7.1-§7.3 — gera um item pronto para uso (mainstat + substats iniciais), determinístico
// por (seed, id). Pesos/faixas vêm de fora (packages/data) — core não lê arquivo nenhum.
export function generateItem(input: GenerateItemInput): ItemInstance {
  const fixedStat = FIXED_MAINSTAT_BY_SLOT[input.slot];

  let mainstatStat: StatKey;
  let mainstatValue: number;

  if (fixedStat) {
    const range = input.mainstatWeights.find((e) => e.slot === input.slot && e.stat === fixedStat)?.valueRange;
    mainstatStat = fixedStat;
    mainstatValue = rollInRange(rollUint32(input.seed, input.id, 'mainstat-value'), range ?? { min: 0, max: 0 });
  } else {
    const candidates = input.mainstatWeights.filter((e) => e.slot === input.slot);
    const picked = pickWeighted(candidates, rollUint32(input.seed, input.id, 'mainstat-stat'));
    mainstatStat = picked.stat;
    mainstatValue = rollInRange(rollUint32(input.seed, input.id, 'mainstat-value'), picked.valueRange);
  }

  const substatCount = SUBSTAT_COUNT_BY_RARITY[input.rarity];
  const eligibleSubstats = input.substatWeights.filter((e) => e.stat !== mainstatStat);
  const chosenStats = new Set<StatKey>();
  const substats: ItemInstance['substats'][number][] = [];

  for (let i = 0; i < substatCount; i++) {
    const remaining = eligibleSubstats.filter((e) => !chosenStats.has(e.stat));
    if (remaining.length === 0) break;

    const picked = pickWeighted(remaining, rollUint32(input.seed, input.id, `substat-stat-${i}`));
    chosenStats.add(picked.stat);
    const value = rollInRange(rollUint32(input.seed, input.id, `substat-value-${i}`), picked.valueRange);
    substats.push({ stat: picked.stat, value, rolls: 1 });
  }

  return {
    id: input.id,
    setId: input.setId,
    slot: input.slot,
    rarity: input.rarity,
    ilvl: input.ilvl,
    mainstat: { stat: mainstatStat, value: mainstatValue },
    substats,
    enhance: 0,
    reforged: false,
  };
}
