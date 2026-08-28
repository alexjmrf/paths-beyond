import { buildBattleSetupFromHeroes, resolveAutoBattle, type BattleSetup, type HeroPlacement, type Id } from '@paths-beyond/core';
import { describe, expect, it } from 'vitest';
import { loadCatalogFromDisk } from '../src/loadCatalogFromDisk.js';
import type { DungeonEncounter } from '../src/types.js';

// M14, sub-sessão 2/N e 3/N — as masmorras de §10 como BATALHA (decisão do usuário).
//
// Este arquivo é o análogo de `campanha.test.ts` para o farm: prova que cada masmorra é um
// confronto de verdade, jogável até um desfecho. Ele existe porque a primeira versão do
// conteúdo tinha DOIS defeitos que nenhum schema pegaria — unidades nascendo fora do mapa e,
// pior, confrontos que **nunca terminavam**: os dois lados paravam a dois tiles um do outro,
// em lados opostos de uma crista, porque a IA de mapa escolhe tile por distância de
// Manhattan e trava em mínimo local contra parede (limitação de M7 que a regra 6 manda não
// resolver com IA mais esperta). A correção foi de conteúdo; este teste é o que impede a
// regressão.

const catalog = loadCatalogFromDisk();

// Várias seeds porque "termina" não pode depender de sorte de rolagem.
const SEEDS = [1, 2, 3, 42];

function setupFor(encounter: DungeonEncounter, playerLevelDelta = 0): BattleSetup {
  const map = catalog.maps[encounter.mapId];
  if (!map) throw new Error(`masmorra referencia mapa desconhecido: ${encounter.mapId}`);

  const placements: HeroPlacement[] = encounter.units.map((unit) => ({
    unitId: unit.unitId,
    hero: unit.side === 'player' ? { ...unit.hero, level: unit.hero.level + playerLevelDelta } : unit.hero,
    classDef: catalog.classes[unit.hero.classId]!,
    equippedItems: Object.values(unit.hero.equipment)
      .filter((id): id is Id => id !== null)
      .map((id) => catalog.items[id]!)
      .filter(Boolean),
    side: unit.side,
    pos: unit.pos,
    height: unit.height,
    ...(unit.aiArchetype ? { aiArchetype: unit.aiArchetype } : {}),
  }));

  return buildBattleSetupFromHeroes({
    placements,
    map: map.grid,
    permadeath: encounter.permadeath,
    winCondition: encounter.winCondition ?? map.winCondition,
    effectDefs: catalog.effects,
    initialValor: map.initialValor,
    valorSkills: catalog.valorSkills,
    itemSets: catalog.itemSets,
    skillsCatalog: catalog.skills,
    weaponDuelRanges: catalog.weaponDuelRanges,
    baselineReactionSkillIds: catalog.baselineReactionSkillIds,
  });
}

const dungeons = Object.values(catalog.dungeons);
const normais = dungeons.filter((d) => d.difficulty === 'normal');
const elites = dungeons.filter((d) => d.difficulty === 'elite');

describe('as masmorras são confrontos jogáveis', () => {
  it('o catálogo tem masmorra carregada (senão todo teste abaixo passa por vazio)', () => {
    expect(dungeons.length).toBeGreaterThan(0);
    expect(normais.length).toBe(elites.length);
  });

  it.each(dungeons.map((d) => [d.id] as const))('%s aponta para um confronto que existe', (dungeonId) => {
    const dungeon = catalog.dungeons[dungeonId]!;
    const encounter = catalog.dungeonEncounters[dungeon.encounterId];
    expect(encounter, `${dungeonId} sem confronto`).toBeDefined();
    expect(catalog.maps[encounter!.mapId], `${dungeonId} com mapa inexistente`).toBeDefined();
  });

  // O teste que os dois bugs de posicionamento teriam pego.
  it.each(dungeons.map((d) => [d.id] as const))('%s TERMINA — nenhum confronto sem desfecho', (dungeonId) => {
    const encounter = catalog.dungeonEncounters[catalog.dungeons[dungeonId]!.encounterId]!;
    const setup = setupFor(encounter);
    for (const seed of SEEDS) {
      const resultado = resolveAutoBattle({ setup, seed });
      expect(resultado.outcome, `${dungeonId} não decidiu com seed ${seed} (${resultado.rounds} rounds)`).not.toBe(
        'ongoing',
      );
    }
  });

  it.each(normais.map((d) => [d.id] as const))(
    '%s (normal) é vencida pelo time de referência — é o piso da dificuldade',
    (dungeonId) => {
      const encounter = catalog.dungeonEncounters[catalog.dungeons[dungeonId]!.encounterId]!;
      const setup = setupFor(encounter);
      for (const seed of SEEDS) {
        expect(resolveAutoBattle({ setup, seed }).outcome, `${dungeonId} com seed ${seed}`).toBe('victory');
      }
    },
  );

  it.each(elites.map((d) => [d.id] as const))(
    '%s (elite) exige mais que o time de referência, mas NÃO é impossível',
    (dungeonId) => {
      const encounter = catalog.dungeonEncounters[catalog.dungeons[dungeonId]!.encounterId]!;

      // Com o time de referência, a elite ganha: é o que a torna elite.
      expect(resolveAutoBattle({ setup: setupFor(encounter), seed: 42 }).outcome).toBe('defeat');

      // Com um time 20 níveis acima, ela cai. Sem esta metade, "difícil" seria
      // indistinguível de "inacabável" — e conteúdo impossível passaria no teste acima.
      const forte = setupFor(encounter, 20);
      const vitorias = SEEDS.filter((seed) => resolveAutoBattle({ setup: forte, seed }).outcome === 'victory');
      expect(vitorias.length, `${dungeonId} não foi vencida nem com time 20 níveis acima`).toBeGreaterThan(0);
    },
  );

  it('a varredura é determinística: mesma seed, mesma batalha', () => {
    const encounter = catalog.dungeonEncounters[normais[0]!.encounterId]!;
    const setup = setupFor(encounter);
    const a = resolveAutoBattle({ setup, seed: 7 });
    const b = resolveAutoBattle({ setup, seed: 7 });
    expect(a.commands).toEqual(b.commands);
    expect(a.outcome).toBe(b.outcome);
  });
});
