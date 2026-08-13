import { buildBattleSetupFromHeroes, buildInitialState, type HeroPlacement, type Id } from '@paths-beyond/core';
import { describe, expect, it } from 'vitest';
import { loadCatalogFromDisk } from '../src/loadCatalogFromDisk.js';

// §10 (M12, sub-sessão 1/N) — a campanha saiu de `apps/client/src/data/campaign.ts` (TS)
// para `packages/data/encounters/*.json`. Estes testes cobrem o que o TypeScript não
// cobre: integridade cruzada entre o elenco e o resto do catálogo. Um `classId` ou
// `weapon` inexistente valida contra o schema (é só uma string de id) e só quebra na hora
// de montar a batalha — que é exatamente o que o formato antigo em TS pegava em compilação
// e o formato em dado não pega mais.

const catalog = loadCatalogFromDisk();

describe('campanha em capítulos (§10)', () => {
  it('carrega os 6 encounters da campanha', () => {
    expect(catalog.encounters).toHaveLength(6);
  });

  it('vêm ordenados por capítulo, não pela ordem dos arquivos no disco', () => {
    expect(catalog.encounters.map((e) => e.chapter)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('o herói do jogador está em todos os capítulos, e a party cresce', () => {
    // M12, sub-sessão 3/N — até aqui a campanha eram 3 capítulos de UMA unidade do
    // jogador (herança de M6). A party crescendo é o que dá sujeito à assistência de M10
    // e ao `escort` de alguém que não seja o próprio herói.
    const partySizes = catalog.encounters.map((e) => e.units.filter((u) => u.side === 'player').length);
    expect(partySizes).toEqual([1, 2, 3, 4, 5, 5]);

    for (const encounter of catalog.encounters) {
      expect(encounter.units.some((u) => u.unitId === 'hero-jogador' && u.side === 'player')).toBe(true);
    }
  });

  it('nenhum capítulo referencia os layouts provisórios de M6/M9', () => {
    // Os 3 `map-campanha-*-provisorio` (15×15 de planície pura) foram aposentados nesta
    // fatia; um encounter apontando pra eles significaria layout órfão ressuscitado.
    for (const encounter of catalog.encounters) {
      expect(encounter.mapId).not.toContain('provisorio');
    }
    expect(Object.keys(catalog.maps).filter((id) => id.includes('provisorio'))).toEqual([]);
  });
});

describe('integridade cruzada com o resto do catálogo', () => {
  it('todo `mapId` referenciado existe em maps', () => {
    for (const encounter of catalog.encounters) {
      expect(catalog.maps[encounter.mapId]).toBeDefined();
    }
  });

  it('toda classe, skill e item referenciados pelo elenco existem', () => {
    for (const encounter of catalog.encounters) {
      for (const unit of encounter.units) {
        expect(catalog.classes[unit.hero.classId]).toBeDefined();
        for (const skillId of [...unit.hero.duelSkills, ...unit.hero.mapSkills]) {
          expect(catalog.skills[skillId]).toBeDefined();
        }
        for (const line of unit.hero.tacticsScript) {
          expect(catalog.skills[line.skillId]).toBeDefined();
        }
        for (const itemId of Object.values(unit.hero.equipment)) {
          if (itemId === null) continue;
          expect(catalog.items[itemId]).toBeDefined();
        }
      }
    }
  });

  it('a arma equipada bate com o `weaponType` declarado do herói', () => {
    for (const encounter of catalog.encounters) {
      for (const unit of encounter.units) {
        const classDef = catalog.classes[unit.hero.classId]!;
        expect(classDef.allowedWeapons).toContain(unit.hero.weaponType);
      }
    }
  });

  it('nenhuma unidade começa fora do grid do próprio mapa', () => {
    for (const encounter of catalog.encounters) {
      const grid = catalog.maps[encounter.mapId]!.grid;
      for (const unit of encounter.units) {
        expect(unit.pos.x).toBeGreaterThanOrEqual(0);
        expect(unit.pos.y).toBeGreaterThanOrEqual(0);
        expect(unit.pos.x).toBeLessThan(grid.width);
        expect(unit.pos.y).toBeLessThan(grid.height);
      }
    }
  });
});

describe('cada encounter monta uma batalha de verdade', () => {
  it('vira um BattleSetup jogável, com a condição de vitória resolvida', () => {
    for (const encounter of catalog.encounters) {
      const arenaMap = catalog.maps[encounter.mapId]!;
      const placements: HeroPlacement[] = encounter.units.map((unit) => ({
        unitId: unit.unitId,
        hero: unit.hero,
        classDef: catalog.classes[unit.hero.classId]!,
        equippedItems: Object.values(unit.hero.equipment)
          .filter((id): id is Id => id !== null)
          .map((id) => catalog.items[id]!),
        side: unit.side,
        pos: unit.pos,
        height: unit.height,
        ...(unit.aiArchetype ? { aiArchetype: unit.aiArchetype } : {}),
      }));

      const setup = buildBattleSetupFromHeroes({
        placements,
        map: arenaMap.grid,
        permadeath: encounter.permadeath,
        winCondition: encounter.winCondition ?? arenaMap.winCondition,
        effectDefs: catalog.effects,
        initialValor: arenaMap.initialValor,
        itemSets: catalog.itemSets,
        skillsCatalog: catalog.skills,
        weaponDuelRanges: catalog.weaponDuelRanges,
        baselineReactionSkillIds: catalog.baselineReactionSkillIds,
      });

      const state = buildInitialState(setup, 42);
      expect(state.outcome).toBe('ongoing');
      expect(state.units).toHaveLength(encounter.units.length);
      // Ninguém sai ferido da montagem. `buildInitialState` já drena os turnos de IA que
      // vêm antes da primeira unidade humana na iniciativa (M7), e com a IA da campanha
      // ligada (M12, sub-sessão 3/N) isso deixou de ser inofensivo: inimigo que nasce
      // dentro do próprio alcance ataca ANTES do primeiro comando do jogador. É erro de
      // posicionamento no encounter, não do motor.
      expect(state.units.every((u) => u.hp === u.stats.hp)).toBe(true);
    }
  });

  it('é determinístico: montar o mesmo encounter duas vezes dá o mesmo estado', () => {
    const build = (): string => {
      const encounter = catalog.encounters[0]!;
      const arenaMap = catalog.maps[encounter.mapId]!;
      const setup = buildBattleSetupFromHeroes({
        placements: encounter.units.map((unit) => ({
          unitId: unit.unitId,
          hero: unit.hero,
          classDef: catalog.classes[unit.hero.classId]!,
          equippedItems: Object.values(unit.hero.equipment)
            .filter((id): id is Id => id !== null)
            .map((id) => catalog.items[id]!),
          side: unit.side,
          pos: unit.pos,
          height: unit.height,
        })),
        map: arenaMap.grid,
        permadeath: encounter.permadeath,
        winCondition: encounter.winCondition ?? arenaMap.winCondition,
        effectDefs: catalog.effects,
        initialValor: arenaMap.initialValor,
        itemSets: catalog.itemSets,
        skillsCatalog: catalog.skills,
        weaponDuelRanges: catalog.weaponDuelRanges,
        baselineReactionSkillIds: catalog.baselineReactionSkillIds,
      });
      return JSON.stringify(buildInitialState(setup, 42));
    };
    expect(build()).toBe(build());
  });
});
