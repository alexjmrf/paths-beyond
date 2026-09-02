import {
  addFlat,
  computeCombatPower,
  multiplyByPctSum,
  resolveTalentEffects,
  type StatSheet,
  type TalentAllocation,
  type ColumnTalentNode,
} from '@paths-beyond/core';

// Mesmo padrão de apps/client/src/logic/itemPreview.ts: sem pipeline Hero→stats no
// cliente ainda, então o efeito de stat dos talentos entra como delta sobre `unit.stats`
// já resolvido — `addFlat`/`multiplyByPctSum` (M1) são os mesmos passos 5/6 que
// `aggregateStatSheet` usaria pra talentos dentro da resolução completa.
export function applyTalentsToStats(baseStats: StatSheet, tree: readonly ColumnTalentNode[], allocation: TalentAllocation): StatSheet {
  const resolved = resolveTalentEffects(tree, allocation);
  let sheet = addFlat(baseStats, resolved.statMods);
  sheet = multiplyByPctSum(sheet, resolved.statMods);
  return sheet;
}

export interface TalentPreviewResult {
  readonly statsBefore: StatSheet;
  readonly statsAfter: StatSheet;
  readonly cpBefore: number;
  readonly cpAfter: number;
}

export function previewTalents(
  baseStats: StatSheet,
  tree: readonly ColumnTalentNode[],
  allocation: TalentAllocation,
): TalentPreviewResult {
  const statsAfter = applyTalentsToStats(baseStats, tree, allocation);
  return {
    statsBefore: baseStats,
    statsAfter,
    cpBefore: computeCombatPower(baseStats),
    cpAfter: computeCombatPower(statsAfter),
  };
}
