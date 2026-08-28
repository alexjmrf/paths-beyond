import type { Id, ItemInstance, SummonBlueprintPlacement } from '@paths-beyond/core';
import type { ContentCatalog } from './types.js';

// §5.6 (M15 D2) — a ponte catálogo → `buildBattleSetupFromHeroes`. Mora aqui, e não em cada
// chamador, porque são TRÊS que montam batalha a partir de heróis (cliente, servidor e o
// piloto de teste) e a conversão é idêntica nos três: um blueprint é herói + classe +
// equipamento resolvidos, exatamente como uma `HeroPlacement`, menos o que só a invocação
// sabe. Duplicar isso é o mesmo risco que `resolveAiTurns` e `buildBattleSetupFromHeroes`
// existem para evitar — §9.1: "divergência = bug crítico".
//
// Blueprint que referencia classe ou item ausente do catálogo é ERRO DE CONTEÚDO, não caso
// de borda a tolerar: silenciá-lo produziria uma invocação que o motor recusa no clique, e o
// jogador veria "Valor insuficiente" onde o problema é um id errado num JSON.
export function toSummonBlueprintPlacements(catalog: ContentCatalog): readonly SummonBlueprintPlacement[] {
  return Object.values(catalog.summonBlueprints).map((blueprint): SummonBlueprintPlacement => {
    const classDef = catalog.classes[blueprint.hero.classId];
    if (!classDef) {
      throw new Error(`${blueprint.id}: classe desconhecida no catálogo: ${blueprint.hero.classId}`);
    }

    const equippedItems = Object.values(blueprint.hero.equipment)
      .filter((id): id is Id => id !== null)
      .map((id) => {
        const item = catalog.items[id];
        if (!item) throw new Error(`${blueprint.id}: item desconhecido no catálogo: ${id}`);
        return item as ItemInstance;
      });

    return { blueprintId: blueprint.id, hero: blueprint.hero, classDef, equippedItems };
  });
}
