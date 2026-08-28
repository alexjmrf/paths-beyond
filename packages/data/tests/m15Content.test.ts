import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import mapSchema from '../schemas/maps.schema.js';
import summonBlueprintSchema from '../schemas/summon-blueprints.schema.js';
import valorSkillSchema from '../schemas/valor-skills.schema.js';
import { findJsonFiles } from '../validate.js';

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

function readJson(...segments: string[]): unknown {
  return JSON.parse(readFileSync(join(packageRoot, ...segments), 'utf8'));
}

// M15, sub-sessão 2/N — o CONTEÚDO que D2 e D3 exigem. A fatia 1/N ligou quatro campos que
// nada lia; sem estes arquivos, `wall`, `gate` e `summonReinforcement` continuariam sendo
// código com teste e sem conteúdo, que é a definição de código morto que o próprio briefing
// usa ("um campo que nenhum conteúdo usa continua sendo código morto por outro nome").

describe('valor-skills.schema.ts — summonReinforcement depois de D2 (§5.6)', () => {
  const base = { id: 'valor-fixture', name: 'Fixture', cost: 3 };

  it('exige `blueprintId` no payload — o payload solto de M11 aceitava qualquer coisa', () => {
    expect(() => valorSkillSchema.parse({ ...base, kind: 'summonReinforcement', payload: {} })).toThrow();
    expect(() =>
      valorSkillSchema.parse({ ...base, kind: 'summonReinforcement', payload: { blueprintId: 'summon-x' } }),
    ).not.toThrow();
  });

  it('rejeita payload com campo desconhecido no lugar do blueprint', () => {
    expect(() =>
      valorSkillSchema.parse({ ...base, kind: 'summonReinforcement', payload: { heroId: 'hero-jogador' } }),
    ).toThrow();
  });
});

describe('summon-blueprints — a unidade invocável é conteúdo (regra 4, D2)', () => {
  it('todo blueprint do catálogo valida contra o schema', () => {
    const files = findJsonFiles(join(packageRoot, 'summon-blueprints'));
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      expect(() => summonBlueprintSchema.parse(JSON.parse(readFileSync(file, 'utf8')))).not.toThrow();
    }
  });

  it('toda valor-skill de invocação referencia um blueprint que existe', () => {
    const blueprintIds = new Set(
      findJsonFiles(join(packageRoot, 'summon-blueprints')).map(
        (file) => (JSON.parse(readFileSync(file, 'utf8')) as { id: string }).id,
      ),
    );

    const summons = findJsonFiles(join(packageRoot, 'valor-skills'))
      .map((file) => JSON.parse(readFileSync(file, 'utf8')) as { kind: string; payload: { blueprintId?: string } })
      .filter((skill) => skill.kind === 'summonReinforcement');

    expect(summons.length).toBeGreaterThan(0);
    for (const summon of summons) {
      expect(blueprintIds).toContain(summon.payload.blueprintId);
    }
  });

  it('o herói do blueprint referencia classe, arma e skills que existem no catálogo', () => {
    const idsIn = (dir: string): Set<string> =>
      new Set(
        findJsonFiles(join(packageRoot, dir)).map(
          (file) => (JSON.parse(readFileSync(file, 'utf8')) as { id: string }).id,
        ),
      );
    const classes = idsIn('classes');
    const items = idsIn('items');
    const skills = idsIn('skills');

    for (const file of findJsonFiles(join(packageRoot, 'summon-blueprints'))) {
      const blueprint = JSON.parse(readFileSync(file, 'utf8')) as {
        hero: {
          classId: string;
          equipment: Record<string, string | null>;
          duelSkills: readonly string[];
          mapSkills: readonly string[];
        };
      };
      expect(classes).toContain(blueprint.hero.classId);
      for (const itemId of Object.values(blueprint.hero.equipment)) {
        if (itemId !== null) expect(items).toContain(itemId);
      }
      for (const skillId of [...blueprint.hero.duelSkills, ...blueprint.hero.mapSkills]) {
        expect(skills).toContain(skillId);
      }
    }
  });
});

// D3 — "autore pelo menos um mapa usando os valores implementados". Decisão do usuário
// (M15 2/N): a fortaleza do capítulo 6 vira alvenaria de verdade. Isso SUBSTITUI a nota de
// M12 3/N que dizia que o chokepoint tinha de ser montanha porque `Tile.object` não tinha
// leitor — e tem a consequência aceita de que a Sentinela Alada não sobrevoa mais a muralha.
describe('map-campanha-6 — a fortaleza depois de D3 (§5.1)', () => {
  interface Tile {
    readonly terrain: string;
    readonly height: number;
    readonly object?: string;
    readonly gate?: { readonly opensFor: string; readonly durability: number };
  }
  const mapa = readJson('maps', 'map-campanha-6.json') as { tiles: Tile[][] };

  it('valida contra o schema', () => {
    expect(() => mapSchema.parse(mapa)).not.toThrow();
  });

  it('a muralha é alvenaria fechada: todo o perímetro é `wall`, exceto o portão', () => {
    // Perímetro da fortaleza (x 6..12, y 2..8). Um único tile de montanha aqui já seria um
    // buraco para a Sentinela Alada — meia muralha é pior que nenhuma, porque promete uma
    // barreira que não existe para quem voa.
    const foraDoPadrao: string[] = [];
    for (let y = 2; y <= 8; y++) {
      for (let x = 6; x <= 12; x++) {
        const noPerimetro = y === 2 || y === 8 || x === 6 || x === 12;
        if (!noPerimetro) continue;
        const tile = mapa.tiles[y]?.[x];
        const esperado = x === 9 && y === 8 ? 'gate' : 'wall';
        if (tile?.object !== esperado) foraDoPadrao.push(`(${x},${y})=${tile?.object ?? tile?.terrain}`);
      }
    }
    expect(foraDoPadrao).toEqual([]);
  });

  it('o portão (9,8) está TRANCADO: ninguém abre, os dois lados arrombam', () => {
    const portao = mapa.tiles[8]?.[9];
    expect(portao?.object).toBe('gate');
    expect(portao?.gate?.opensFor).toBe('none');
    // Durabilidade acima de 1 é o que separa "arrombar" de "abrir com outro nome".
    expect(portao?.gate?.durability).toBeGreaterThan(1);
  });

  it('o portão é a ÚNICA brecha da muralha', () => {
    const gates = mapa.tiles.flat().filter((tile) => tile.object === 'gate');
    expect(gates).toHaveLength(1);
  });
});

// Invariante nova, e ela pega um erro que a fatia 1/N tornou possível: até M15 nada
// bloqueava um tile, então nascer sobre `object` não significava nada. Agora significa —
// uma unidade que começa dentro de um muro ou de um portão fechado está presa, e o guarda
// do capítulo 6 nascia EXATAMENTE em cima do vão (9,8) que virou portão.
describe('nenhuma unidade nasce em tile bloqueado (§5.1, M15)', () => {
  interface Tile {
    readonly object?: string;
  }
  interface UnitPlacement {
    readonly unitId: string;
    readonly pos: { readonly x: number; readonly y: number };
  }

  const mapsById = new Map<string, Tile[][]>(
    findJsonFiles(join(packageRoot, 'maps'))
      .map((file) => JSON.parse(readFileSync(file, 'utf8')) as { id: string; tiles: Tile[][] })
      .map((map) => [map.id, map.tiles]),
  );

  for (const dir of ['encounters', 'dungeon-encounters']) {
    it(`${dir}: nenhuma unidade começa sobre muro ou portão`, () => {
      const files = findJsonFiles(join(packageRoot, dir));
      expect(files.length).toBeGreaterThan(0);

      for (const file of files) {
        const encounter = JSON.parse(readFileSync(file, 'utf8')) as {
          id: string;
          mapId: string;
          units: readonly UnitPlacement[];
        };
        const tiles = mapsById.get(encounter.mapId);
        expect(tiles, `${encounter.id} referencia mapa inexistente`).toBeDefined();

        for (const unit of encounter.units) {
          const object = tiles?.[unit.pos.y]?.[unit.pos.x]?.object;
          expect(
            object === 'wall' || object === 'gate',
            `${encounter.id}/${unit.unitId} nasce sobre ${object}`,
          ).toBe(false);
        }
      }
    });
  }
});
