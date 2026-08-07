import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildBattleSetupFromHeroes, type HeroPlacement } from '@paths-beyond/core';
import { describe, expect, it } from 'vitest';
import { firstArenaMap } from '../src/buildCatalog.js';
import { loadCatalogFromDisk } from '../src/loadCatalogFromDisk.js';

// Rede de regressão da migração (M9, sub-sessão 1): estes 4 testes existiam em
// `tools/balance/tests/loadContent.test.ts` (M8, sub-sessão 3/N — equipamento real
// entrando na conta do torneio) e precisam continuar passando sem mudar de expectativa
// depois que o loader virou `@paths-beyond/content`.
describe('loadCatalogFromDisk() — itens/sets reais (regressão de M8 sub-sessão 3/N)', () => {
  it('carrega os 11 itens reais (9 armas + 2 colares) e os 2 item-sets', () => {
    const catalog = loadCatalogFromDisk();
    expect(Object.keys(catalog.items)).toHaveLength(11);
    expect(Object.keys(catalog.itemSets)).toHaveLength(2);
  });

  it('todo comp equipa arma + colar, e os dois ids resolvem contra o catálogo de itens carregado', () => {
    const catalog = loadCatalogFromDisk();
    for (const comp of catalog.comps) {
      for (const unit of comp.units) {
        const { weapon, necklace } = unit.hero.equipment;
        expect(weapon).not.toBeNull();
        expect(necklace).not.toBeNull();
        expect(catalog.items[weapon!]).toBeDefined();
        expect(catalog.items[necklace!]).toBeDefined();
      }
    }
  });

  it('equipar os itens reais de um comp aumenta hp/atk da unidade montada (equipamento realmente conta)', () => {
    const catalog = loadCatalogFromDisk();
    const comp = catalog.comps.find((c) => c.id === 'comp-espadachim');
    expect(comp).toBeDefined();
    const unit = comp!.units[0]!;
    const classDef = catalog.classes[unit.hero.classId]!;
    const equippedItems = [unit.hero.equipment.weapon, unit.hero.equipment.necklace]
      .filter((id): id is string => id !== null)
      .map((id) => catalog.items[id]!);

    const map = firstArenaMap(catalog);
    const basePlacement: HeroPlacement = {
      unitId: unit.hero.id,
      hero: unit.hero,
      classDef,
      equippedItems: [],
      side: 'player',
      pos: unit.pos,
      height: unit.height,
      aiArchetype: unit.aiArchetype,
    };
    const geared: HeroPlacement = { ...basePlacement, equippedItems };

    const buildSetup = (placements: readonly HeroPlacement[]) =>
      buildBattleSetupFromHeroes({
        placements,
        map: map.grid,
        permadeath: 'classic',
        winCondition: map.winCondition,
        effectDefs: {},
        initialValor: map.initialValor,
        itemSets: catalog.itemSets,
        skillsCatalog: catalog.skills,
        weaponDuelRanges: catalog.weaponDuelRanges,
        baselineReactionSkillIds: [],
      });

    const withoutItems = buildSetup([basePlacement]).units[0]!;
    const withItems = buildSetup([geared]).units[0]!;

    expect(withItems.stats.hp).toBeGreaterThan(withoutItems.stats.hp);
    expect(withItems.stats.atk).toBeGreaterThan(withoutItems.stats.atk);
  });

  it('é determinístico — mesmo conteúdo real carregado duas vezes produz o mesmo catálogo de itens', () => {
    const a = loadCatalogFromDisk();
    const b = loadCatalogFromDisk();
    expect(JSON.stringify(a.items)).toBe(JSON.stringify(b.items));
    expect(JSON.stringify(a.itemSets)).toBe(JSON.stringify(b.itemSets));
  });
});

// Regressão adicional (equivalentes ao que vivia em `tools/balance/tests/runTournament.test.ts`
// só na parte de carregamento — o resto daquele arquivo testa `runTournament`, que continua
// em `tools/balance` consumindo este pacote).
describe('loadCatalogFromDisk() — conteúdo real e fixtures (regressão de M8 sub-sessão 1-2)', () => {
  it('encontra as 9 composições reais de M8, com classes e skills resolvíveis', () => {
    const catalog = loadCatalogFromDisk();
    expect(catalog.comps.length).toBe(9);
    for (const comp of catalog.comps) {
      for (const unit of comp.units) {
        expect(catalog.classes[unit.hero.classId]).toBeDefined();
        for (const skillId of unit.hero.duelSkills) {
          expect(catalog.skills[skillId]).toBeDefined();
        }
      }
    }
  });

  function testFixturesDir(): string {
    const hereDir = fileURLToPath(new URL('.', import.meta.url)); // packages/content/tests/
    return join(hereDir, '..', '..', 'data', 'test-fixtures');
  }

  it('layout "valid-subdir" continua encontrando as composições sintéticas de test-fixtures/', () => {
    const catalog = loadCatalogFromDisk({ rootDir: testFixturesDir(), layout: 'valid-subdir' });
    expect(catalog.comps.length).toBeGreaterThanOrEqual(2);
    for (const comp of catalog.comps) {
      for (const unit of comp.units) {
        expect(catalog.classes[unit.hero.classId]).toBeDefined();
      }
    }
  });

  it('deriva baselineReactionSkillIds reais (skill-contra-atacar, skill-defender)', () => {
    const catalog = loadCatalogFromDisk();
    expect(catalog.baselineReactionSkillIds).toEqual(['skill-contra-atacar', 'skill-defender']);
  });
});
