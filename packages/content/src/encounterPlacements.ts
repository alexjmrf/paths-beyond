import type { Id, Placement } from '@paths-beyond/core';
import type { ContentCatalog, EncounterUnitContent } from './types.js';

// §8.1 (M17, sub-sessão 3/N) — de unidade de ENCONTRO para placement de BATALHA.
//
// Existe pelo mesmo motivo que `toSummonBlueprintPlacements` (M15) existe ao lado: cinco
// lugares fazem esta conversão — o piloto de campanha, os dois testes de conteúdo, a
// campanha do cliente e a masmorra do servidor — e até esta fatia eram cinco cópias de um
// `map` de seis linhas. Cópias iguais não incomodam; o que muda com o inimigo autorado é
// que a conversão passou a ter um RAMO, e cinco cópias de um ramo são cinco chances de um
// consumidor resolver o inimigo por um caminho diferente do dos outros — §9.1, a
// divergência que o projeto chama de bug crítico.
//
// Fica em `packages/content` e não no core porque é aqui que "id" vira "coisa": o core
// recebe o inimigo e a classe já resolvidos, e não sabe o que é um catálogo.
export function toEncounterPlacements(
  units: readonly EncounterUnitContent[],
  catalog: ContentCatalog,
): readonly Placement[] {
  return units.map((unit): Placement => {
    if (unit.side === 'enemy') {
      const enemy = catalog.enemies[unit.enemyId];
      // Falha alto, e a escolha é deliberada. Um inimigo que não resolve não é "uma
      // unidade a menos": é um encontro com um buraco no elenco, e a condição de vitória
      // `rout` passaria a ser cumprida por um exército que nunca existiu.
      if (!enemy) throw new Error(`inimigo desconhecido no catálogo: ${unit.enemyId}`);
      return {
        unitId: unit.unitId,
        enemy,
        side: 'enemy',
        pos: unit.pos,
        height: unit.height,
        ...(unit.aiArchetype ? { aiArchetype: unit.aiArchetype } : {}),
      };
    }

    const classDef = catalog.classes[unit.hero.classId];
    if (!classDef) throw new Error(`classe desconhecida no catálogo: ${unit.hero.classId}`);

    const equippedItems = Object.values(unit.hero.equipment)
      .filter((id): id is Id => id !== null)
      .map((id) => {
        const item = catalog.items[id];
        if (!item) throw new Error(`item desconhecido no catálogo: ${id}`);
        return item;
      });

    return {
      unitId: unit.unitId,
      hero: unit.hero,
      classDef,
      equippedItems,
      // §10/D16 (M18, 5/N) — o ALIADO DE CENÁRIO luta do lado do jogador. Ele é um lado
      // próprio no CONTEÚDO (para não poder ser confundido com alguém do elenco) e o
      // mesmo lado no TABULEIRO — o motor conhece dois lados, e um terceiro ali seria
      // regra nova para uma distinção que é só de autoria.
      side: 'player',
      pos: unit.pos,
      height: unit.height,
      ...(unit.aiArchetype ? { aiArchetype: unit.aiArchetype } : {}),
    };
  });
}
