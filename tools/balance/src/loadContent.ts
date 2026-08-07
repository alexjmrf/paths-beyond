import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ClassDef, Coord, GridMap, Hero, Id, ItemInstance, ItemSet, MapAiArchetype, SkillDef, Terrain, WeaponType, WinCondition } from '@paths-beyond/core';
import classSchema from '@paths-beyond/data/schemas/classes.schema.js';
import compSchema from '@paths-beyond/data/schemas/comps.schema.js';
import itemSchema from '@paths-beyond/data/schemas/items.schema.js';
import itemSetSchema from '@paths-beyond/data/schemas/item-sets.schema.js';
import mapSchema from '@paths-beyond/data/schemas/maps.schema.js';
import skillSchema from '@paths-beyond/data/schemas/skills.schema.js';
import terrainSchema from '@paths-beyond/data/schemas/terrains.schema.js';
import weaponDuelRangesSchema from '@paths-beyond/data/schemas/weapon-duel-ranges.schema.js';
import { findJsonFiles } from '@paths-beyond/data/validate.js';

export interface CompUnitContent {
  readonly hero: Hero;
  readonly pos: Coord;
  readonly height: 0 | 1 | 2 | 3;
  readonly aiArchetype: MapAiArchetype;
}

export interface Composition {
  readonly id: Id;
  readonly name: string;
  readonly units: readonly CompUnitContent[];
}

export interface ArenaMap {
  readonly grid: GridMap;
  readonly winCondition: WinCondition;
  readonly initialValor: number;
}

export interface BalanceContent {
  readonly comps: readonly Composition[];
  readonly classes: Readonly<Record<Id, ClassDef>>;
  readonly skills: Readonly<Record<Id, SkillDef>>;
  readonly items: Readonly<Record<Id, ItemInstance>>;
  readonly itemSets: Readonly<Record<Id, ItemSet>>;
  readonly weaponDuelRanges: Readonly<Record<WeaponType, number>>;
  readonly map: ArenaMap;
}

interface MapContent {
  readonly width: number;
  readonly height: number;
  readonly tiles: readonly (readonly { readonly terrain: string; readonly height: 0 | 1 | 2 | 3 }[])[];
  readonly zocEnabled: boolean;
  readonly winCondition: WinCondition;
  readonly initialValor: number;
}

// Diretório-fonte por padrão: packages/data/ (conteúdo real, M8 sub-sessão 2) — layout
// 'flat', mesma convenção de `validateDataset(rootDir)` (packages/data/validate.ts):
// `<rootDir>/<type>/*.json`, sem split valid/invalid, porque conteúdo real não tem
// vizinho inválido de propósito. Testes de regressão continuam podendo apontar pra
// `packages/data/test-fixtures/` com `layout: 'valid-subdir'` (`<rootDir>/<type>/valid/`),
// preservando o comportamento original da primeira sub-sessão de M8 sem duplicar lógica.
//
// `import.meta.resolve('@paths-beyond/data/package.json')` seria mais robusto a
// mudanças de estrutura do monorepo, mas o loader SSR do Vitest (vite-node) não
// implementa `import.meta.resolve` (mesma categoria de divergência tsx-vs-vite-node já
// documentada em packages/data/validate.ts, DECISIONS.md M1) — funciona rodando via
// `tsx` direto, quebra sob `pnpm test`. Caminho relativo à posição deste arquivo dentro
// do monorepo funciona nos dois ambientes, então é o que usamos.
export function realContentDir(): string {
  const hereDir = fileURLToPath(new URL('.', import.meta.url)); // tools/balance/src/
  return join(hereDir, '..', '..', '..', 'packages', 'data');
}

export type ContentLayout = 'flat' | 'valid-subdir';

export interface LoadBalanceContentOptions {
  readonly rootDir?: string;
  readonly layout?: ContentLayout;
}

function typeDir(rootDir: string, type: string, layout: ContentLayout): string {
  return layout === 'valid-subdir' ? join(rootDir, type, 'valid') : join(rootDir, type);
}

function loadValid<T>(schema: { parse: (input: unknown) => T }, dir: string): T[] {
  const files = findJsonFiles(dir);
  return files.map((file) => schema.parse(JSON.parse(readFileSync(file, 'utf8'))));
}

function loadFirstValid<T>(schema: { parse: (input: unknown) => T }, dir: string): T {
  const files = findJsonFiles(dir);
  const first = files[0];
  if (!first) throw new Error(`nenhum conteúdo válido encontrado em ${dir}`);
  return schema.parse(JSON.parse(readFileSync(first, 'utf8')));
}

export function loadBalanceContent(options: LoadBalanceContentOptions = {}): BalanceContent {
  const root = options.rootDir ?? realContentDir();
  const layout = options.layout ?? 'flat';

  // O tipo de `Condition` inferido por Zod (comps.schema.ts, via heroSchema.tacticsScript)
  // e o tipo escrito à mão em packages/core não são estruturalmente idênticos na variante
  // recursiva `not` — Zod infere `Condition` sem o `readonly c: Condition` completo.
  // Validação de verdade já aconteceu em `schema.parse` acima; o cast é só pra TS aceitar
  // a ponte entre os dois sistemas de tipo (Zod-inferido vs. hand-authored).
  const comps = loadValid(compSchema, typeDir(root, 'comps', layout)) as unknown as Composition[];

  const classList = loadValid<ClassDef>(classSchema, typeDir(root, 'classes', layout));
  const classes: Record<Id, ClassDef> = {};
  for (const classDef of classList) classes[classDef.id] = classDef;

  const skillList = loadValid<SkillDef>(skillSchema, typeDir(root, 'skills', layout));
  const skills: Record<Id, SkillDef> = {};
  for (const skill of skillList) skills[skill.id] = skill;

  // Mesmo descompasso de tipo já documentado acima pra `Condition`: `items.schema.ts`
  // valida `enhance` como `0..15` (frouxo, nível de schema), mas o `ItemInstance` de
  // packages/core tipa `enhance` como os 6 marcos literais (`EnhanceLevel`, M4). O
  // `schema.parse` já garante que o valor real está nos marcos certos; o cast é só pra
  // TS aceitar a ponte entre os dois sistemas de tipo.
  const itemList = loadValid(itemSchema, typeDir(root, 'items', layout)) as unknown as ItemInstance[];
  const items: Record<Id, ItemInstance> = {};
  for (const item of itemList) items[item.id] = item;

  const itemSetList = loadValid<ItemSet>(itemSetSchema, typeDir(root, 'item-sets', layout));
  const itemSets: Record<Id, ItemSet> = {};
  for (const itemSet of itemSetList) itemSets[itemSet.id] = itemSet;

  const weaponDuelRanges = loadFirstValid<Record<WeaponType, number>>(weaponDuelRangesSchema, typeDir(root, 'weapon-duel-ranges', layout));

  const mapContent = loadFirstValid<MapContent>(mapSchema, typeDir(root, 'maps', layout));
  const terrainList = loadValid<Terrain>(terrainSchema, typeDir(root, 'terrains', layout));
  const terrains: Record<string, Terrain> = {};
  for (const terrain of terrainList) terrains[terrain.id] = terrain;

  const grid: GridMap = {
    width: mapContent.width,
    height: mapContent.height,
    tiles: mapContent.tiles,
    terrains,
    zocEnabled: mapContent.zocEnabled,
  };

  return {
    comps,
    classes,
    skills,
    items,
    itemSets,
    weaponDuelRanges,
    map: { grid, winCondition: mapContent.winCondition, initialValor: mapContent.initialValor },
  };
}
