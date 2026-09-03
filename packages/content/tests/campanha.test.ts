import { tileAt } from '@paths-beyond/core';
import { describe, expect, it } from 'vitest';
import { loadCatalogFromDisk } from '../src/loadCatalogFromDisk.js';
import { COMMAND_BUDGET, playthrough } from './campaignPilot.js';

// M12, sub-sessão 3/N — a evidência do critério de aceite do milestone: "campanha de 6+
// mapas JOGÁVEL ponta a ponta com pelo menos 3 condições de vitória distintas".
//
// "Jogável" não é propriedade que schema ou typecheck consigam afirmar: um `seize` cujo
// tile alvo está atrás de uma montanha, um `defend` em que o inimigo alcança o objetivo no
// round 1, um `escort` cuja rota não existe — os três validam contra o Zod e nascem
// impossíveis. Então este arquivo JOGA os 6 capítulos: o piloto automático de
// `campaignPilot.ts` assume o lado do jogador (o lado inimigo já é a IA de mapa do próprio
// conteúdo) e cada capítulo tem que terminar em `victory`.
//
// O piloto é o PISO do que um humano faz — não escolhe skill, não gasta Valor, não lança
// skill de mapa. Capítulo que ele vence, humano vence; capítulo que ele perde é sinal de
// conteúdo a rever.

const catalog = loadCatalogFromDisk();

describe('campanha em capítulos (§10) — 6 mapas jogáveis ponta a ponta', () => {
  it('são 6 capítulos, ordenados', () => {
    expect(catalog.encounters).toHaveLength(6);
    expect(catalog.encounters.map((e) => e.chapter)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('usa mais de 3 condições de vitória distintas — as 5 de §5.7', () => {
    const conditions = catalog.encounters.map((e) => (e.winCondition ?? catalog.maps[e.mapId]!.winCondition).t);
    expect(conditions).toEqual(['rout', 'seize', 'defend', 'surviveRounds', 'escort', 'rout']);
    expect(new Set(conditions).size).toBeGreaterThanOrEqual(3);
  });

  for (const encounter of catalog.encounters) {
    it(`${encounter.name}: o piloto automático vence`, () => {
      const { state, commands } = playthrough(catalog, encounter);
      expect({ id: encounter.id, outcome: state.outcome }).toEqual({ id: encounter.id, outcome: 'victory' });
      expect(commands).toBeLessThan(COMMAND_BUDGET);
    });
  }

  it('a jogada inteira é determinística: mesma seed → mesmo estado final', () => {
    for (const encounter of catalog.encounters) {
      const first = playthrough(catalog, encounter);
      const second = playthrough(catalog, encounter);
      expect(JSON.stringify(second.state)).toBe(JSON.stringify(first.state));
    }
  });
});

describe('os objetivos são alcançáveis pelo terreno, não só pelo schema', () => {
  it('todo tile alvo de condição é pisável por quem precisa pisar nele', () => {
    for (const encounter of catalog.encounters) {
      const arenaMap = catalog.maps[encounter.mapId]!;
      const condition = encounter.winCondition ?? arenaMap.winCondition;
      if (condition.t === 'rout' || condition.t === 'surviveRounds') continue;

      const tile = tileAt(arenaMap.grid, condition.target);
      expect(tile, `${encounter.id}: alvo fora do grid`).toBeDefined();
      const terrain = arenaMap.grid.terrains[tile!.terrain]!;
      // `defend` é o caso invertido: o tile precisa ser pisável pelo INIMIGO, senão
      // "não deixe inimigo pisar" seria vitória grátis.
      expect(terrain.moveCost.foot, `${encounter.id}: alvo intransponível a pé`).not.toBe('impassable');
    }
  });

  it('nenhuma unidade começa em tile intransponível para o próprio moveType', () => {
    for (const encounter of catalog.encounters) {
      const arenaMap = catalog.maps[encounter.mapId]!;
      for (const unit of encounter.units) {
        // §8.1 (M17, 3/N) — o `moveType` sai da classe do herói ou da ficha do inimigo. A
        // pergunta é a mesma para os dois (esta unidade cabe no tile em que nasce?), só a
        // fonte muda — e o inimigo autorado declara o dele por extenso.
        const moveType =
          unit.side === 'enemy' ? catalog.enemies[unit.enemyId]!.moveType : catalog.classes[unit.hero.classId]!.moveType;
        const tile = tileAt(arenaMap.grid, unit.pos)!;
        const cost = arenaMap.grid.terrains[tile.terrain]!.moveCost[moveType];
        expect(cost, `${encounter.id}/${unit.unitId}`).not.toBe('impassable');
      }
    }
  });

  it('a altura declarada de cada unidade é a do tile em que ela começa', () => {
    // `move` copia a altura do destino (`commands.ts`); começar com uma altura que o mapa
    // não tem daria vantagem posicional (§6.6) saída de um número autorado à mão.
    for (const encounter of catalog.encounters) {
      const arenaMap = catalog.maps[encounter.mapId]!;
      for (const unit of encounter.units) {
        expect(unit.height, `${encounter.id}/${unit.unitId}`).toBe(tileAt(arenaMap.grid, unit.pos)!.height);
      }
    }
  });
});

describe('a IA de mapa está ligada na campanha (§9.1)', () => {
  it('todo inimigo da campanha declara um arquétipo', () => {
    for (const encounter of catalog.encounters) {
      for (const unit of encounter.units.filter((u) => u.side === 'enemy')) {
        expect(unit.aiArchetype, `${encounter.id}/${unit.unitId}`).toBeDefined();
      }
    }
  });

  it('nenhuma unidade do jogador declara arquétipo — a party é do humano', () => {
    for (const encounter of catalog.encounters) {
      for (const unit of encounter.units.filter((u) => u.side === 'player')) {
        expect(unit.aiArchetype, `${encounter.id}/${unit.unitId}`).toBeUndefined();
      }
    }
  });

  it('os 5 arquétipos de §9.1 têm consumidor real na campanha', () => {
    const used = new Set(
      catalog.encounters.flatMap((e) =>
        e.units.map((u) => u.aiArchetype).filter((a): a is NonNullable<typeof a> => !!a),
      ),
    );
    expect([...used].sort()).toEqual(['aggressive', 'flank', 'guard-tile', 'hold-position', 'support-nearest']);
  });
});

describe('as skills de mapa em área (§5.4) têm consumidor real', () => {
  it('a campanha equipa as duas, e nenhuma é só um número de dano', () => {
    const equipped = new Set(
      catalog.encounters.flatMap((e) =>
        e.units.flatMap((u) => (u.side === 'enemy' ? catalog.enemies[u.enemyId]!.mapSkills : u.hero.mapSkills)),
      ),
    );
    expect([...equipped].sort()).toEqual(['skill-luz-do-alvorecer', 'skill-salva-arcana']);

    for (const skillId of equipped) {
      const skill = catalog.skills[skillId]!;
      expect(skill.kind).toBe('map');
      expect(skill.areaRadius, `${skillId}: sem área`).toBeGreaterThan(0);
      // Critério de aceite de M12: nenhuma skill que o jogador ESCOLHE é só dano.
      expect(skill.effects.length, `${skillId}: só um número de dano`).toBeGreaterThan(0);
      for (const application of skill.effects) {
        expect(catalog.effects[application.effectId], `${skillId}: efeito inexistente`).toBeDefined();
      }
    }
  });
});

// §10/D14/D16 (M18, 5/N) — o CRITÉRIO DE ACEITE 3 do milestone, na sua forma jogável.
//
// "Nenhum capítulo nomeia a party, e a campanha é zerável só com os quatro do núcleo."
// A metade da FORMA está em `encounters.test.ts` (nenhuma vaga nomeia um adquirível); esta
// é a metade JOGÁVEL, e as duas juntas é que fecham o critério — a forma sozinha permitiria
// uma campanha que não nomeia ninguém e ainda assim é invencível com quatro.
describe('a campanha é zerável só com o núcleo de história (critério 3)', () => {
  const NUCLEO = new Set(
    Object.values(catalog.characters)
      .filter((character) => character.acquisition === 'story')
      .map((character) => character.id),
  );

  it('o núcleo tem quatro personagens', () => {
    expect(NUCLEO.size).toBe(4);
  });

  it('toda VAGA de todo capítulo é preenchida por alguém do núcleo', () => {
    for (const encounter of catalog.encounters) {
      for (const unit of encounter.units) {
        if (unit.side !== 'player') continue;
        expect(NUCLEO.has(unit.hero.characterId!), `${encounter.id}/${unit.unitId}`).toBe(true);
      }
    }
  });

  it('e o piloto automático vence os SEIS capítulos com essa party', () => {
    // O piloto joga exatamente o que as vagas declaram, que o teste acima acabou de provar
    // ser só o núcleo. Se um capítulo passasse a exigir mais do que quatro personagens
    // conseguem, é aqui que apareceria — e foi assim que o capítulo 5 foi pego, quando a
    // Mensageira ainda ocupava uma vaga e sumia junto com o objetivo.
    for (const encounter of catalog.encounters) {
      const resultado = playthrough(catalog, encounter);
      expect(resultado.state.outcome, `${encounter.id}`).toBe('victory');
    }
  });
});
