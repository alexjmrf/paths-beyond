import { buildBattleSetupFromHeroes, buildInitialState, validateColumnAllocation } from '@paths-beyond/core';
import { toEncounterPlacements } from '../src/encounterPlacements.js';
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
        // §8.1 (M17, 3/N) — os dois lados referenciam conteúdo, mas conteúdo DIFERENTE. O
        // inimigo não tem classe nem equipamento a resolver; o que ele tem de ter é ficha
        // no catálogo, e as skills dela precisam existir do mesmo jeito.
        if (unit.side === 'enemy') {
          const enemy = catalog.enemies[unit.enemyId];
          expect(enemy, `${encounter.id}/${unit.unitId}: ${unit.enemyId}`).toBeDefined();
          for (const skillId of [...enemy!.duelSkills, ...enemy!.mapSkills]) {
            expect(catalog.skills[skillId]).toBeDefined();
          }
          for (const line of enemy!.tacticsScript) {
            expect(catalog.skills[line.skillId]).toBeDefined();
          }
          continue;
        }

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

  // §8.1/§8.2 (M17, 4/N) — o lado do jogador é o ELENCO, e isso passou a ter consequência
  // mecânica. Enquanto a árvore era da classe, `classId` bastava para resolver o talento de
  // qualquer herói; com a árvore sendo do PERSONAGEM (D6), resolvê-la exige saber QUEM ele
  // é. Um herói de campanha sem `characterId` não é um herói sem talento: é um herói cuja
  // alocação inteira some em silêncio, porque `resolveTalentEffects` ignora nó desconhecido
  // sem reclamar (§8.2). É o mesmo modo de falha que a 2/N pegou nas rotas do servidor.
  it('todo herói do lado do jogador é um personagem do elenco', () => {
    for (const encounter of catalog.encounters) {
      for (const unit of encounter.units) {
        if (unit.side === 'enemy') continue;
        const personagem = catalog.characters[unit.hero.characterId!];
        expect(personagem, `${encounter.id}/${unit.unitId}: ${unit.hero.characterId}`).toBeDefined();
      }
    }
  });

  it('a classe declarada pelo herói é a classe do personagem que ele é', () => {
    // Duas fontes para o mesmo fato, e por isso elas podem divergir: o encontro escreve a
    // `classId` e o elenco também. Divergir não quebraria nada visível — a batalha usaria a
    // classe do encontro e a árvore do personagem —, e seria um herói jogando com a curva
    // de status de uma classe e os talentos de outra.
    for (const encounter of catalog.encounters) {
      for (const unit of encounter.units) {
        if (unit.side === 'enemy') continue;
        const personagem = catalog.characters[unit.hero.characterId!]!;
        expect(unit.hero.classId, `${encounter.id}/${unit.unitId}`).toBe(personagem.classId);
      }
    }
  });

  it('toda alocação escrita na campanha é válida na árvore de quem a joga', () => {
    // O recíproco do teste acima, e o que ele sozinho não pegaria. A 2/N escreveu este
    // teste para as comps da arena e ninguém o escreveu para a campanha, que é onde o
    // jogador de verdade entra: uma slug de nó errada não quebra o carregamento, só apaga o
    // talento — a party joga o capítulo mais fraca do que o autor escreveu, sem aviso.
    //
    // A checagem é `validateColumnAllocation` e não "o id existe": a árvore de §8.2 é um
    // CAMINHO, então uma alocação pode ter só ids reais e ainda ser impossível de alcançar
    // jogando (linha 5 sem as linhas 1..4, ou uma troca de coluna sem passar pelo meio).
    for (const encounter of catalog.encounters) {
      for (const unit of encounter.units) {
        if (unit.side === 'enemy') continue;
        const arvore = catalog.characterTalentTrees[unit.hero.characterId!];
        expect(arvore, `${encounter.id}/${unit.unitId}: sem árvore`).toBeDefined();
        const resultado = validateColumnAllocation({
          tree: arvore!,
          allocation: unit.hero.talents,
          awakening: unit.hero.awakening,
        });
        expect(resultado.issues, `${encounter.id}/${unit.unitId}`).toEqual([]);
      }
    }
  });

  it('a arma equipada bate com o `weaponType` declarado do herói', () => {
    for (const encounter of catalog.encounters) {
      // Só o lado do jogador: `allowedWeapons` é da CLASSE, e inimigo autorado não tem
      // classe. A arma dele é validada pelo enum do schema, que é o que resta a validar
      // quando não há uma lista de permissões por trás.
      for (const unit of encounter.units) {
        if (unit.side === 'enemy') continue;
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
      const placements = toEncounterPlacements(encounter.units, catalog);

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
    characterTalentTrees: catalog.characterTalentTrees,
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
        placements: toEncounterPlacements(encounter.units, catalog),
        map: arenaMap.grid,
        permadeath: encounter.permadeath,
        winCondition: encounter.winCondition ?? arenaMap.winCondition,
        effectDefs: catalog.effects,
        initialValor: arenaMap.initialValor,
        itemSets: catalog.itemSets,
        skillsCatalog: catalog.skills,
        weaponDuelRanges: catalog.weaponDuelRanges,
        baselineReactionSkillIds: catalog.baselineReactionSkillIds,
    characterTalentTrees: catalog.characterTalentTrees,
      });
      return JSON.stringify(buildInitialState(setup, 42));
    };
    expect(build()).toBe(build());
  });
});
