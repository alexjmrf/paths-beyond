import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { findJsonFiles } from '@paths-beyond/data/validate.js';
import { buildCatalog } from './buildCatalog.js';
import type { ContentCatalog } from './types.js';

// Diretório-fonte por padrão: packages/data/ (conteúdo real). `import.meta.resolve`
// seria mais robusto a mudanças de estrutura do monorepo, mas o loader SSR do Vitest
// (vite-node) não o implementa — mesma categoria de divergência tsx-vs-vite-node já
// documentada em packages/data/validate.ts (DECISIONS.md, M1) e reaproveitada em
// tools/balance/src/loadContent.ts (M8). Caminho relativo à posição deste arquivo dentro
// do monorepo funciona nos dois ambientes.
function realContentDir(): string {
  const hereDir = fileURLToPath(new URL('.', import.meta.url)); // packages/content/src/
  return join(hereDir, '..', '..', 'data');
}

export type ContentLayout = 'flat' | 'valid-subdir';

export interface LoadCatalogFromDiskOptions {
  readonly rootDir?: string;
  readonly layout?: ContentLayout;
}

function typeDir(rootDir: string, type: string, layout: ContentLayout): string {
  return layout === 'valid-subdir' ? join(rootDir, type, 'valid') : join(rootDir, type);
}

function readJsonFiles(dir: string): unknown[] {
  return findJsonFiles(dir).map((file) => JSON.parse(readFileSync(file, 'utf8')));
}

function readFirstJsonFile(dir: string): unknown {
  const files = findJsonFiles(dir);
  const first = files[0];
  if (!first) throw new Error(`nenhum conteúdo válido encontrado em ${dir}`);
  return JSON.parse(readFileSync(first, 'utf8'));
}

// Adapter Node de `buildCatalog` (D2, M9): só lê o disco e entrega JSON já parseado pra
// função pura fazer a validação/indexação/fusão. Usado por `apps/server`, `sim-cli` e
// `tools/balance` — nenhum deles roda em browser.
export function loadCatalogFromDisk(options: LoadCatalogFromDiskOptions = {}): ContentCatalog {
  const root = options.rootDir ?? realContentDir();
  const layout = options.layout ?? 'flat';

  return buildCatalog({
    classes: readJsonFiles(typeDir(root, 'classes', layout)),
    characters: readJsonFiles(typeDir(root, 'characters', layout)),
    characterTalentTrees: readJsonFiles(typeDir(root, 'character-talent-trees', layout)),
    enemies: readJsonFiles(typeDir(root, 'enemies', layout)),
    skills: readJsonFiles(typeDir(root, 'skills', layout)),
    items: readJsonFiles(typeDir(root, 'items', layout)),
    itemSets: readJsonFiles(typeDir(root, 'item-sets', layout)),
    effects: readJsonFiles(typeDir(root, 'effects', layout)),
    valorSkills: readJsonFiles(typeDir(root, 'valor-skills', layout)),
    summonBlueprints: readJsonFiles(typeDir(root, 'summon-blueprints', layout)),
    comps: readJsonFiles(typeDir(root, 'comps', layout)),
    encounters: readJsonFiles(typeDir(root, 'encounters', layout)),
    maps: readJsonFiles(typeDir(root, 'maps', layout)),
    terrains: readJsonFiles(typeDir(root, 'terrains', layout)),
    weaponDuelRanges: readFirstJsonFile(typeDir(root, 'weapon-duel-ranges', layout)),
    // §10 (M14) — economia PvE.
    dungeons: readJsonFiles(typeDir(root, 'dungeons', layout)),
    dungeonEncounters: readJsonFiles(typeDir(root, 'dungeon-encounters', layout)),
    materials: readJsonFiles(typeDir(root, 'materials', layout)),
    // §10 (M18, 2/N) — os banners de invocação.
    banners: readJsonFiles(typeDir(root, 'banners', layout)),
    // §10 (M18, 4/N) — as fontes autoradas da moeda premium.
    achievements: readJsonFiles(typeDir(root, 'achievements', layout)),
    events: readJsonFiles(typeDir(root, 'events', layout)),
    economyRules: readJsonFiles(typeDir(root, 'economy-rules', layout)),
    substatWeights: readFirstJsonFile(typeDir(root, 'substat-weights', layout)),
    mainstatWeights: readFirstJsonFile(typeDir(root, 'mainstat-weights', layout)),
    enhanceRates: readFirstJsonFile(typeDir(root, 'enhance-rates', layout)),
  });
}
