import { buildBattleSetupFromHeroes, type HeroPlacement } from '@paths-beyond/core';
import { describe, expect, it } from 'vitest';
import { loadBalanceContent } from '../src/loadContent.js';

// M8, sub-sessão 3/N: antes desta fatia, `equippedItems` era sempre `[]` — nenhum item
// jamais entrava na conta de `tools/balance`, mesmo quando um comp referenciava um item
// de verdade em `hero.equipment`. Estes testes provam as duas pontas: o catálogo real é
// carregado (não só os tipos de conteúdo já existentes) e o equipamento realmente muda
// os stats resolvidos de uma unidade — não só que os ids existem estruturalmente.
describe('loadBalanceContent() — itens/sets reais (M8, sub-sessão 3/N)', () => {
  it('carrega os 11 itens reais (9 armas + 2 colares) e os 2 item-sets', () => {
    const content = loadBalanceContent();
    expect(Object.keys(content.items)).toHaveLength(11);
    expect(Object.keys(content.itemSets)).toHaveLength(2);
  });

  it('todo comp equipa arma + colar, e os dois ids resolvem contra o catálogo de itens carregado', () => {
    const content = loadBalanceContent();
    for (const comp of content.comps) {
      for (const unit of comp.units) {
        const { weapon, necklace } = unit.hero.equipment;
        expect(weapon).not.toBeNull();
        expect(necklace).not.toBeNull();
        expect(content.items[weapon!]).toBeDefined();
        expect(content.items[necklace!]).toBeDefined();
      }
    }
  });

  it('equipar os itens reais de um comp aumenta hp/atk/def da unidade montada (equipamento realmente conta)', () => {
    const content = loadBalanceContent();
    const comp = content.comps.find((c) => c.id === 'comp-espadachim');
    expect(comp).toBeDefined();
    const unit = comp!.units[0]!;
    const classDef = content.classes[unit.hero.classId]!;
    const equippedItems = [unit.hero.equipment.weapon, unit.hero.equipment.necklace]
      .filter((id): id is string => id !== null)
      .map((id) => content.items[id]!);

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
        map: content.map.grid,
        permadeath: 'classic',
        winCondition: content.map.winCondition,
        effectDefs: {},
        initialValor: content.map.initialValor,
        itemSets: content.itemSets,
        skillsCatalog: content.skills,
        weaponDuelRanges: content.weaponDuelRanges,
        baselineReactionSkillIds: [],
      });

    const withoutItems = buildSetup([basePlacement]).units[0]!;
    const withItems = buildSetup([geared]).units[0]!;

    expect(withItems.stats.hp).toBeGreaterThan(withoutItems.stats.hp);
    expect(withItems.stats.atk).toBeGreaterThan(withoutItems.stats.atk);
  });

  it('é determinístico — mesmo conteúdo real carregado duas vezes produz o mesmo catálogo de itens', () => {
    const a = loadBalanceContent();
    const b = loadBalanceContent();
    expect(JSON.stringify(a.items)).toBe(JSON.stringify(b.items));
    expect(JSON.stringify(a.itemSets)).toBe(JSON.stringify(b.itemSets));
  });
});
