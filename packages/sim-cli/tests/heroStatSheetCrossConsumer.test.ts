import { hashState, resolveHeroCombatProfile, resolveHeroStatSheet, type ItemInstance } from '@paths-beyond/core';
import { loadCatalogFromDisk } from '@paths-beyond/content';
import { describe, expect, it } from 'vitest';
import { runStatSheetCommand } from '../src/statSheet.js';

// Critério de aceite 4 de M9 (docs/milestones/M9-integracao-de-conteudo.md, seção 6):
// "o mesmo Hero produz o mesmo hash de StatSheet no cliente, no servidor e no
// sim-cli" — o análogo de §3.3 pra camada de conteúdo. Este arquivo prova as pernas
// sim-cli e servidor (as duas rodam em Node, contra o mesmo catálogo real de
// packages/data via `loadCatalogFromDisk`); a perna cliente é verificada à parte
// contra o bundle real do navegador via Playwright/Chromium headless — decisão de
// escopo registrada em DECISIONS.md (não automatizada em `pnpm test` nesta milestone,
// mesmo padrão já usado pra confirmar a sub-sessão 3).
//
// "Servidor" aqui é `resolveHeroCombatProfile` — a MESMA função que
// `buildBattleSetupFromHeroes`/`buildBattleUnit` (usadas por
// `apps/server/src/battle/routes.ts` desde M7) chamam por dentro pra resolver
// `.stats`, já exercitada de ponta a ponta contra conteúdo real por
// `apps/server/tests/realContent.test.ts` (M9 sub-sessão 2) — não uma cópia paralela
// de lógica.
describe('critério de aceite 4 (M9): mesmo Hero → mesmo hash de StatSheet entre consumidores', () => {
  it('sim-cli (runStatSheetCommand) e resolveHeroCombatProfile (usada pelo servidor) produzem o mesmo hash pro mesmo Hero real', () => {
    const catalog = loadCatalogFromDisk();
    const comp = catalog.comps.find((c) => c.id === 'comp-espadachim');
    expect(comp).toBeDefined();
    const hero = comp!.units[0]!.hero;
    const classDef = catalog.classes[hero.classId];
    expect(classDef).toBeDefined();

    const equippedItems: ItemInstance[] = Object.values(hero.equipment)
      .filter((id): id is string => id !== null)
      .map((id) => catalog.items[id]!);

    const heroJson = JSON.stringify(hero);
    const simCliOutput = runStatSheetCommand({ heroFile: 'hero.json' }, (path) => {
      if (path !== 'hero.json') throw new Error(`arquivo não simulado: ${path}`);
      return heroJson;
    });
    const simCliHash = /Hash: ([0-9a-f]{8})/.exec(simCliOutput)?.[1];
    expect(simCliHash).toBeDefined();

    const serverStats = resolveHeroCombatProfile({
      hero,
      classDef: classDef!,
      equippedItems,
      itemSets: catalog.itemSets,
      skillsCatalog: catalog.skills,
      weaponDuelRanges: catalog.weaponDuelRanges,
      baselineReactionSkillIds: catalog.baselineReactionSkillIds,
    }).stats;
    const serverHash = hashState(serverStats);

    const directStats = resolveHeroStatSheet({ hero, classDef: classDef!, equippedItems, itemSets: catalog.itemSets });
    const directHash = hashState(directStats);

    expect(simCliHash).toBe(serverHash);
    expect(simCliHash).toBe(directHash);
  });
});
