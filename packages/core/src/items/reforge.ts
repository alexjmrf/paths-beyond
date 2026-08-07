import { fpMul } from '../math/fixed.js';
import type { ItemInstance, SubstatWeightEntry } from './types.js';

export interface ApplyReforgeInput {
  readonly item: ItemInstance;
  readonly substatWeights: readonly SubstatWeightEntry[];
}

export interface ApplyReforgeResult {
  readonly item: ItemInstance;
  readonly applied: boolean;
  readonly reason?: string;
}

// §7.3 — "Reforge em enhance=15 e ilvl=100: bônus fixo garantido em todos os substats,
// uma vez por item." "Garantido" = não é uma rolagem aleatória (ao contrário do enhance);
// o bônus percentual por stat vem de `reforgeBonusPct` (packages/data), nunca hardcoded.
export function applyReforge(input: ApplyReforgeInput): ApplyReforgeResult {
  const { item } = input;

  if (item.enhance !== 15) return { item, applied: false, reason: 'reforge exige enhance +15' };
  if (item.ilvl !== 100) return { item, applied: false, reason: 'reforge exige ilvl 100' };
  if (item.reforged) return { item, applied: false, reason: 'item já foi reforjado' };

  const substats = item.substats.map((substat) => {
    const bonusPct = input.substatWeights.find((w) => w.stat === substat.stat)?.reforgeBonusPct;
    if (bonusPct === undefined) return substat;
    return { ...substat, value: substat.value + fpMul(substat.value, bonusPct) };
  });

  return { item: { ...item, substats, reforged: true }, applied: true };
}
