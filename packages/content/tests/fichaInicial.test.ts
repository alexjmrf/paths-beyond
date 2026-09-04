import { buildBattleSetupFromHeroes, resolveHeroStatSheet } from '@paths-beyond/core';
import { describe, expect, it } from 'vitest';
import { loadCatalogFromDisk } from '../src/loadCatalogFromDisk.js';
import { toStartingHero } from '../src/startingHero.js';
import { COMMAND_BUDGET, playthrough } from './campaignPilot.js';

// §10/D14 (M18, 6/N) — a FICHA INICIAL conversando com o resto do conteúdo.
//
// O schema de `packages/data` valida a forma de um arquivo isolado; o que só se pode
// perguntar aqui é se a ficha aponta para coisas que existem, se a arma é uma que a
// classe do personagem sabe empunhar, e — a asserção que dá sentido à fatia inteira — se
// a ficha com que o jogador RECEBE o núcleo é a mesma contra a qual a campanha foi
// afinada.
//
// Essa última é o que transporta a prova da 5/N para produção. Lá o piloto venceu os seis
// capítulos com a party que as VAGAS declaram; em produção quem preenche a vaga é o herói
// da conta. Se as duas fichas puderem divergir, a prova não vale para ninguém — a
// campanha estaria afinada contra um time que só existe no arquivo de conteúdo.

const catalog = loadCatalogFromDisk();
const characters = Object.values(catalog.characters);

describe('M18 §10 — a ficha inicial aponta só para conteúdo que existe', () => {
  it.each(characters.map((c) => [c.id, c] as const))('%s: a classe, a arma e as skills existem', (_id, character) => {
    const ficha = character.startingHero;

    const classDef = catalog.classes[character.classId];
    expect(classDef, `classe inexistente: ${character.classId}`).toBeDefined();

    // §4.2/D2 — o herói escolhe UM `weaponType` dentre os da classe. Uma ficha com arma
    // que a classe não empunha resolveria com o alcance de duelo de outra arma.
    expect(classDef!.allowedWeapons, `${character.id} empunha ${ficha.weaponType}`).toContain(ficha.weaponType);

    for (const itemId of Object.values(ficha.equipment)) {
      if (itemId === null) continue;
      expect(catalog.items[itemId], `item inexistente: ${itemId}`).toBeDefined();
    }
    for (const skillId of [...ficha.duelSkills, ...ficha.mapSkills]) {
      expect(catalog.skills[skillId], `skill inexistente: ${skillId}`).toBeDefined();
    }
    for (const linha of ficha.tacticsScript) {
      expect(catalog.skills[linha.skillId], `skill de tática inexistente: ${linha.skillId}`).toBeDefined();
    }
  });

  it.each(characters.map((c) => [c.id, c] as const))('%s: a arma equipada é do slot de arma', (_id, character) => {
    const weaponId = character.startingHero.equipment.weapon;
    expect(weaponId, `${character.id} começa desarmado`).not.toBeNull();
    expect(catalog.items[weaponId!]?.slot).toBe('weapon');
  });

  // O recíproco, que é a lacuna que M18 encontrou três vezes em fatias diferentes: não
  // basta "toda ficha aponta para coisa que existe". Um personagem do pool SEM ficha faria
  // `POST /summon` conceder posse de alguém que não vira herói — o jogador pagaria a moeda
  // premium por uma linha no banco.
  it('todo personagem do pool de todo banner tem ficha inicial', () => {
    for (const banner of Object.values(catalog.banners)) {
      for (const entry of banner.pool) {
        expect(catalog.characters[entry.characterId]?.startingHero, `${entry.characterId} sem ficha`).toBeDefined();
      }
    }
  });
});

describe('M18 §10 — a ficha resolve no motor', () => {
  it.each(characters.map((c) => [c.id, c] as const))('%s: vira um Hero que o core resolve', (_id, character) => {
    const hero = toStartingHero(character, `heroi-${character.id}`);

    expect(hero.characterId).toBe(character.id);
    expect(hero.classId).toBe(character.classId);
    // Uma conta nova não tem progresso nenhum: o que a ficha entrega é o ponto de partida.
    expect({ exp: hero.exp, awakening: hero.awakening, imprint: hero.imprint, talents: hero.talents }).toEqual({
      exp: 0,
      awakening: 0,
      imprint: 0,
      talents: {},
    });

    const equippedItems = Object.values(hero.equipment)
      .filter((id): id is string => id !== null)
      .map((id) => catalog.items[id]!);

    const sheet = resolveHeroStatSheet({
      hero,
      classDef: catalog.classes[hero.classId]!,
      equippedItems,
      itemSets: catalog.itemSets,
      talentTree: catalog.characterTalentTrees[character.id]?.nodes ?? [],
    });

    // Um herói que resolve com 0 de HP ou de ATK não é jogável, e é o tipo de coisa que
    // um schema não pode perguntar.
    expect(sheet.hp).toBeGreaterThan(0);
    expect(sheet.atk).toBeGreaterThan(0);
  });

  it('os quatro do núcleo montam uma batalha de verdade juntos', () => {
    // A prova de que a party inicial não é só nove fichas válidas isoladas: elas entram
    // no mesmo `buildBattleSetupFromHeroes` que a campanha, a arena e a masmorra usam.
    const nucleo = characters.filter((c) => c.acquisition === 'story');
    const mapa = catalog.maps[catalog.encounters[0]!.mapId]!;

    const placements = nucleo.map((character, index) => {
      const hero = toStartingHero(character, `heroi-${character.id}`);
      return {
        unitId: `player-${hero.id}`,
        hero,
        classDef: catalog.classes[hero.classId]!,
        equippedItems: Object.values(hero.equipment)
          .filter((id): id is string => id !== null)
          .map((id) => catalog.items[id]!),
        side: 'player' as const,
        pos: { x: 1, y: 1 + index },
        height: 0 as const,
      };
    });

    const setup = buildBattleSetupFromHeroes({
      placements,
      map: mapa.grid,
      permadeath: 'casual',
      winCondition: { t: 'rout' },
      effectDefs: catalog.effects,
      initialValor: mapa.initialValor,
      valorSkills: catalog.valorSkills,
      itemSets: catalog.itemSets,
      skillsCatalog: catalog.skills,
      weaponDuelRanges: catalog.weaponDuelRanges,
      baselineReactionSkillIds: catalog.baselineReactionSkillIds,
      characterTalentTrees: catalog.characterTalentTrees,
    });

    expect(setup.units).toHaveLength(4);
    expect(setup.units.every((unit) => unit.stats.hp > 0)).toBe(true);
  });
});

// A asserção que é a razão da fatia: a campanha continua afinada contra o que o jogador
// de fato recebe.
//
// A 5/N provou que o piloto vence os seis capítulos com a party que as VAGAS declaram. Em
// produção quem preenche a vaga não é o herói autorado: é o da CONTA, montado da ficha
// inicial. Se as duas pudessem divergir, aquela prova valeria para um time que só existe
// no arquivo de conteúdo.
//
// A prova é feita nas duas pontas, e nenhuma basta sozinha. A JOGÁVEL (abaixo) é a que
// importa e é a que mede; a da FORMA trava os três campos que definem o poder da
// referência — nível, tipo de arma e a arma equipada. Ela deliberadamente NÃO compara
// `talents`, `mapSkills` nem `tacticsScript`: os três são decisão do jogador (a alocação
// da árvore, o script tático de §6.5), e a vaga os autora só para o piloto ter o que jogar.
describe('M18 §10/D16 — a campanha foi afinada contra a ficha que o jogador recebe', () => {
  const vagasComPersonagem = catalog.encounters.flatMap((encounter) =>
    encounter.units
      .filter((unit) => unit.side === 'player' && unit.hero.characterId !== undefined)
      .map((unit) => [`${encounter.id}/${unit.unitId}`, unit] as const),
  );

  it('há vagas de campanha autoradas com personagem para comparar', () => {
    expect(vagasComPersonagem.length).toBeGreaterThan(0);
  });

  it.each(vagasComPersonagem)('%s: mesmo nível e mesma arma que a ficha do personagem', (_rotulo, unit) => {
    const autorado = unit.side === 'player' ? unit.hero : undefined;
    const ficha = catalog.characters[autorado!.characterId!]?.startingHero;
    expect(ficha, `vaga aponta para personagem fora do elenco: ${autorado!.characterId}`).toBeDefined();

    expect({
      level: autorado!.level,
      weaponType: autorado!.weaponType,
      weapon: autorado!.equipment.weapon,
    }).toEqual({
      level: ficha!.level,
      weaponType: ficha!.weaponType,
      weapon: ficha!.equipment.weapon,
    });
  });

  // A metade JOGÁVEL, e a que fecha o critério de aceite 3 no caminho que produção usa:
  // os seis capítulos jogados pelo mesmo piloto da 5/N, com as vagas preenchidas pelos
  // heróis que uma CONTA NOVA recebe — ficha inicial, `talents: {}`, o script tático
  // padrão e nenhum item farmado.
  //
  // A 5/N jogou com o herói AUTORADO na vaga, que carrega alocação de talento escolhida a
  // dedo (Miron com a mão que alcança, Sylla com o fôlego de combate) e o script tático de
  // duas linhas do clérigo. Nada disso existe numa conta nova, e era exatamente a pergunta
  // que ninguém tinha medido: o jogador que ainda não gastou um ponto de talento tem
  // campanha para jogar?
  describe('os seis capítulos com a party de uma CONTA NOVA', () => {
    function comFichaInicial(encounter: (typeof catalog.encounters)[number]): typeof encounter {
      return {
        ...encounter,
        units: encounter.units.map((unit) =>
          unit.side === 'player'
            ? { ...unit, hero: toStartingHero(catalog.characters[unit.hero.characterId!]!, unit.hero.id) }
            : unit,
        ),
      };
    }

    for (const encounter of catalog.encounters) {
      it(`${encounter.name}: o piloto vence`, () => {
        const { state, commands } = playthrough(catalog, comFichaInicial(encounter));

        expect({ id: encounter.id, outcome: state.outcome }).toEqual({ id: encounter.id, outcome: 'victory' });
        expect(commands).toBeLessThan(COMMAND_BUDGET);
      });
    }
  });
});
