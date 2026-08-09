import type { StatModifier } from '../stats/types.js';
import type { Id } from '../types.js';
import type { ItemInstance, ItemSet } from './types.js';

// §7.4 (M10, sub-sessão 6/N) — ids canônicos dos 4 efeitos `special`. O motor precisa
// reconhecê-los pra mudar comportamento, então eles NÃO são conteúdo livre: são a mesma
// categoria de `BASIC_ATTACK_SKILL` (regra do motor, não número de balanceamento). O JSON
// de `packages/data/item-sets/` repete estas strings porque `packages/data` não depende de
// `@paths-beyond/core` — mesmo espelhamento já usado por `ItemSet`/`EffectDef` (ver
// DECISIONS.md). O prefixo `set-special:` marca que o id é interpretado pelo motor, e não
// um `EffectDef` de `packages/data/effects`.
export const SET_SPECIAL_DUELISTA = 'set-special:duelista-contra-atacar-livre-troca-1';
export const SET_SPECIAL_RESERVA = 'set-special:reserva-ap';
export const SET_SPECIAL_SENTINELA = 'set-special:sentinela-assistencia-livre-por-round';
export const SET_SPECIAL_IMUNIDADE = 'set-special:imunidade-debuff-troca-1';

// §7.4 — conta peças equipadas por set e emite os StatModifier dos limiares atingidos
// (2/4 peças), prontos para o passo 7 de aggregateStatSheet (M1). Efeitos `special`
// (Duelista/Reserva/Sentinela/Imunidade) não viram StatModifier — mexem com economia de
// AP/PP e turno de duelo, não com o stat sheet; quem os resolve é
// `resolveSetSpecialEffects` abaixo.
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

// §7.4 — a outra metade de um ItemSet ("2 peças dão stat, 4 peças mudam comportamento"):
// devolve os `effectId` dos efeitos `special` cujo limiar de peças foi atingido. O limiar
// vem do dado (`effect.pieces`), não é assumido como 4. Quem interpreta cada id é a camada
// que o efeito afeta — duelo (Duelista/Imunidade) ou batalha (Reserva/Sentinela); esta
// função só resolve QUAIS estão ativos.
export function resolveSetSpecialEffects(
  equippedItems: readonly ItemInstance[],
  itemSets: Readonly<Record<Id, ItemSet>>,
): readonly Id[] {
  const countBySet = new Map<Id, number>();
  for (const item of equippedItems) {
    countBySet.set(item.setId, (countBySet.get(item.setId) ?? 0) + 1);
  }

  const effectIds: Id[] = [];
  for (const [setId, count] of countBySet) {
    const set = itemSets[setId];
    if (!set) continue;
    for (const effect of set.effects) {
      if (effect.t !== 'special') continue;
      if (count >= effect.pieces && !effectIds.includes(effect.effectId)) {
        effectIds.push(effect.effectId);
      }
    }
  }
  return effectIds;
}
