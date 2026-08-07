import {
  BASIC_ATTACK_SKILL,
  addFlat,
  computeCombatPower,
  computeDamage,
  type ItemInstance,
  type StatModifier,
  type StatSheet,
} from '@paths-beyond/core';

// §11 — "ganho de dano real (não só CP) ao equipar." Não existe pipeline Hero→stats no
// cliente ainda (mesmo corte de M2/M3: BattleUnit já vem com stats resolvidos, sem passar
// por `aggregateStatSheet`) — decisão registrada em DECISIONS.md: o item entra como delta
// flat sobre os stats já resolvidos da unidade (mainstat/substats de ItemInstance são
// sempre valores flat, nunca %, então basta `addFlat`, o mesmo helper que duel/effects.ts
// já reusa pra buffs ativos dentro do duelo). "Dano real" é um ataque básico contra um
// alvo-manequim neutro fixo (sem crítico, sem variância, sem triângulo/posicional) —
// comparável entre builds, não uma simulação de duelo completa.
const DUMMY_TARGET_DEF = 300;

function itemStatMods(item: ItemInstance): readonly StatModifier[] {
  return [
    { stat: item.mainstat.stat, flat: item.mainstat.value },
    ...item.substats.map((s) => ({ stat: s.stat, flat: s.value })),
  ];
}

export function applyItemsToStats(baseStats: StatSheet, items: readonly ItemInstance[]): StatSheet {
  return addFlat(baseStats, items.flatMap(itemStatMods));
}

function basicAttackDamage(stats: StatSheet): number {
  return computeDamage({
    attackerAtk: stats.atk,
    attackerDef: stats.def,
    attackerHp: stats.hp,
    defenderDef: DUMMY_TARGET_DEF,
    skill: {
      multiplier: BASIC_ATTACK_SKILL.multiplier,
      flat: BASIC_ATTACK_SKILL.flat,
      scalesWith: BASIC_ATTACK_SKILL.scalesWith,
    },
    attackerPen: stats.pen,
    typeDamageMultiplier: 1000,
    positionalMultiplier: 1000,
    isCriticalHit: false,
    criticalDamageMultiplier: 1000,
    damageDealtPctSum: 0,
    damageTakenReductionPctSum: 0,
    varianceRoll: 1000,
  });
}

export interface ItemPreviewResult {
  readonly statsBefore: StatSheet;
  readonly statsAfter: StatSheet;
  readonly damageBefore: number;
  readonly damageAfter: number;
  readonly cpBefore: number;
  readonly cpAfter: number;
}

// Compara o estado atual (stats base + itens já equipados) contra o estado hipotético de
// trocar o item do mesmo slot pelo `candidate` — não soma o candidato em cima do que já
// ocupa o slot.
export function previewEquip(
  baseStats: StatSheet,
  currentlyEquipped: readonly ItemInstance[],
  candidate: ItemInstance,
): ItemPreviewResult {
  const before = applyItemsToStats(baseStats, currentlyEquipped);
  const afterItems = [...currentlyEquipped.filter((i) => i.slot !== candidate.slot), candidate];
  const after = applyItemsToStats(baseStats, afterItems);

  return {
    statsBefore: before,
    statsAfter: after,
    damageBefore: basicAttackDamage(before),
    damageAfter: basicAttackDamage(after),
    cpBefore: computeCombatPower(before),
    cpAfter: computeCombatPower(after),
  };
}
