import type { StatModifier } from '../stats/types.js';
import type { Id } from '../types.js';
import type { ItemInstance, ItemSet } from './types.js';

// §7.4 — conta peças equipadas por set e emite os StatModifier dos limiares atingidos
// (2/4 peças), prontos para o passo 7 de aggregateStatSheet (M1). Efeitos `special`
// (Duelista/Reserva/Sentinela/Imunidade) não são resolvidos aqui — mexem com economia de
// AP/PP e turno de duelo, não com o stat sheet; corte de escopo de M4 (ver DECISIONS.md).
export function resolveSetBonuses(
  equippedItems: readonly ItemInstance[],
  itemSets: Readonly<Record<Id, ItemSet>>,
): readonly StatModifier[] {
  const countBySet = new Map<Id, number>();
  for (const item of equippedItems) {
    countBySet.set(item.setId, (countBySet.get(item.setId) ?? 0) + 1);
  }

  const modifiers: StatModifier[] = [];
  for (const [setId, count] of countBySet) {
    const set = itemSets[setId];
    if (!set) continue;
    for (const effect of set.effects) {
      if (effect.t !== 'stat') continue;
      if (count >= effect.pieces) {
        modifiers.push({ stat: effect.stat, flat: effect.flat, pct: effect.pct });
      }
    }
  }
  return modifiers;
}
