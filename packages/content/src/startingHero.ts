import type { Hero, Id } from '@paths-beyond/core';
import type { CharacterContent } from './types.js';

// §10/D14 (M18, 6/N) — de PERSONAGEM (catálogo) para HERÓI (a instância que o jogador leva
// ao mapa).
//
// Uma função só, no mesmo espírito de `ownedCharacterIds` no servidor: os dois pontos que
// criam herói — a conta nova recebendo o núcleo de quatro e o `POST /summon` concedendo um
// adquirível — têm de produzir exatamente a mesma ficha. Duas montagens da mesma coisa é a
// divergência que §9.1 chama de bug crítico, e aqui ela apareceria como "o Aren invocado
// não é o Aren da campanha".
//
// Mora em `packages/content` e não no core porque é aqui que "id" vira "coisa" (mesmo
// argumento de `encounterPlacements.ts`), e não em `packages/gacha` porque o núcleo de
// história nasce sem passar por rolagem nenhuma.
export function toStartingHero(character: CharacterContent, heroId: Id): Hero {
  const ficha = character.startingHero;

  return {
    id: heroId,
    characterId: character.id,
    classId: character.classId,
    level: ficha.level,
    // O progresso não vem do catálogo: quem sobe de nível, desperta, imprime e aloca
    // talento é a CONTA (§10). Zerado aqui é o ponto de partida, não uma omissão.
    exp: 0,
    awakening: 0,
    imprint: 0,
    talents: {},
    equipment: { ...ficha.equipment },
    weaponType: ficha.weaponType,
    duelSkills: [...ficha.duelSkills],
    mapSkills: [...ficha.mapSkills],
    tacticsScript: ficha.tacticsScript.map((linha) => ({ ...linha })),
  };
}
