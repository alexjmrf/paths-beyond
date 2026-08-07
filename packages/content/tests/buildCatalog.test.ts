import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { buildCatalog, type ParsedContentFiles } from '../src/buildCatalog.js';

// Testes de `buildCatalog` puro (D2, M9): sem `node:fs` dentro da função em si — o fs
// aqui é só do TESTE, pra montar o input a partir de fixtures reais em vez de inventar
// conteúdo de jogo (regra de dados.md). Prova que a metade isomórfica funciona sem
// depender do adapter Node (`loadCatalogFromDisk`), que tem seus próprios testes.
function fixtureDir(...segments: string[]): string {
  const hereDir = fileURLToPath(new URL('.', import.meta.url)); // packages/content/tests/
  return join(hereDir, '..', '..', 'data', 'test-fixtures', ...segments);
}

function readJson(...pathSegments: string[]): unknown {
  return JSON.parse(readFileSync(join(...pathSegments), 'utf8'));
}

function readAllJson(dir: string): unknown[] {
  return readdirSync(dir)
    .filter((name) => name.endsWith('.json'))
    .map((name) => readJson(dir, name));
}

function baseInput(): ParsedContentFiles {
  return {
    classes: readAllJson(fixtureDir('classes', 'valid')),
    skills: readAllJson(fixtureDir('skills', 'valid')),
    items: readAllJson(fixtureDir('items', 'valid')),
    itemSets: readAllJson(fixtureDir('item-sets', 'valid')),
    comps: readAllJson(fixtureDir('comps', 'valid')),
    maps: readAllJson(fixtureDir('maps', 'valid')),
    terrains: readAllJson(fixtureDir('terrains', 'valid')),
    weaponDuelRanges: readJson(fixtureDir('weapon-duel-ranges', 'valid'), 'tabela-teste.json'),
  };
}

describe('buildCatalog()', () => {
  it('indexa classes/skills/items/itemSets por id', () => {
    const catalog = buildCatalog(baseInput());
    expect(catalog.classes['class-soldado']).toBeDefined();
    expect(catalog.skills['skill-golpe-basico']).toBeDefined();
    expect(catalog.items['item-espada-teste']).toBeDefined();
    expect(catalog.itemSets['set-ataque']).toBeDefined();
  });

  it('funde maps.schema (layout) + terrains.schema (terreno) num GridMap de verdade', () => {
    const catalog = buildCatalog(baseInput());
    const map = catalog.maps['map-teste'];
    expect(map).toBeDefined();
    const firstTile = map!.grid.tiles[0]?.[0];
    expect(firstTile).toBeDefined();
    expect(map!.grid.terrains[firstTile!.terrain]).toBeDefined();
  });

  it('suporta múltiplos mapas indexados por id (não só "o primeiro arquivo")', () => {
    const input = baseInput();
    const original = readJson(fixtureDir('maps', 'valid'), 'mapa-teste.json') as Record<string, unknown>;
    const second = { ...original, id: 'map-teste-2', name: 'Segundo Mapa de Teste' };
    const catalog = buildCatalog({ ...input, maps: [...input.maps, second] });

    expect(Object.keys(catalog.maps).sort()).toEqual(['map-teste', 'map-teste-2']);
    expect(catalog.maps['map-teste-2']!.grid.width).toBe(catalog.maps['map-teste']!.grid.width);
  });

  it('carrega as composições reais dos fixtures, com Condition recursivo (not) resolvendo', () => {
    const catalog = buildCatalog(baseInput());
    expect(catalog.comps.length).toBeGreaterThanOrEqual(3);
    for (const comp of catalog.comps) {
      for (const unit of comp.units) {
        expect(catalog.classes[unit.hero.classId]).toBeDefined();
      }
    }
  });

  it('deriva baselineReactionSkillIds a partir de skills kind:"reaction" do catálogo', () => {
    const input = baseInput();
    const contraAtacar = {
      id: 'skill-contra-atacar',
      name: 'Contra-atacar',
      kind: 'reaction',
      apCost: 0,
      ppCost: 1,
      cooldown: 0,
      multiplier: 800,
      flat: 0,
      scalesWith: 'atk',
      trigger: 'onAttacked',
      tags: [],
    };
    const defender = {
      id: 'skill-defender',
      name: 'Defender',
      kind: 'reaction',
      apCost: 0,
      ppCost: 1,
      cooldown: 0,
      multiplier: 0,
      flat: 0,
      scalesWith: 'atk',
      trigger: 'onAttacked',
      tags: [],
    };
    const catalog = buildCatalog({ ...input, skills: [...input.skills, contraAtacar, defender] });

    expect(catalog.baselineReactionSkillIds).toEqual(['skill-contra-atacar', 'skill-defender']);
    // O ataque básico (kind:'duel') do fixture não entra — só reação é baseline.
    expect(catalog.baselineReactionSkillIds).not.toContain('skill-golpe-basico');
  });

  it('rejeita conteúdo inválido — schema.parse real acontece dentro de buildCatalog', () => {
    const input = baseInput();
    const invalidComp = readJson(fixtureDir('comps', 'invalid'), 'sem-unidades.json');
    expect(() => buildCatalog({ ...input, comps: [invalidComp] })).toThrow();
  });

  it('é puro — mesmo input produz o mesmo catálogo (JSON idêntico) duas vezes', () => {
    const input = baseInput();
    const a = buildCatalog(input);
    const b = buildCatalog(input);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});
