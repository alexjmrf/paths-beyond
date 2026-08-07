// Import por subpath direto no módulo isomórfico (`buildCatalog.js`/`types.js`), NUNCA
// pelo barrel `@paths-beyond/content` — o barrel reexporta `loadCatalogFromDisk`
// (`node:fs`/`node:path`/`node:url`), e isso puxaria tipos de Node pro programa TS
// inteiro do cliente (apps/client/tsconfig.json não declara `types:["node"]` de
// propósito — o cliente roda em browser). Mesmo padrão já usado por
// `tools/balance/src/loadContent.ts` (M8) pra importar schemas de `@paths-beyond/data`
// por subpath em vez de um barrel.
import { buildCatalog } from '@paths-beyond/content/src/buildCatalog.js';
import type { ContentCatalog } from '@paths-beyond/content/src/types.js';

// Adapter de browser de `buildCatalog` (D2, docs/milestones/M9-integracao-de-conteudo.md,
// sub-sessão 3) — o par de `loadCatalogFromDisk` (packages/content, adapter Node) que
// `apps/server`/`sim-cli`/`tools/balance` usam. `node:fs` não existe em browser, então
// este arquivo usa `import.meta.glob` do Vite (processado em build-time, sem requisição
// de rede extra em runtime com `eager: true`) pra juntar o mesmo JSON cru que o adapter
// Node lê do disco, e entrega pra `buildCatalog` fazer a validação/indexação/fusão —
// exatamente a mesma lógica isomórfica, sem duplicar nada aqui.
//
// Caminho relativo sobe de `apps/client/src/data/` até a raiz do monorepo (4 níveis:
// data → src → client → apps) e desce em `packages/data/<tipo>/*.json`. O Vite detecta
// automaticamente a raiz do workspace pnpm (por `pnpm-workspace.yaml`) e libera
// `server.fs` pra servir arquivos fora de `apps/client/` — padrão comum em monorepo.
function globJsonValues(globResult: Record<string, unknown>): unknown[] {
  return Object.values(globResult);
}

const classModules = import.meta.glob('../../../../packages/data/classes/*.json', { eager: true, import: 'default' });
const skillModules = import.meta.glob('../../../../packages/data/skills/*.json', { eager: true, import: 'default' });
const itemModules = import.meta.glob('../../../../packages/data/items/*.json', { eager: true, import: 'default' });
const itemSetModules = import.meta.glob('../../../../packages/data/item-sets/*.json', { eager: true, import: 'default' });
const compModules = import.meta.glob('../../../../packages/data/comps/*.json', { eager: true, import: 'default' });
const mapModules = import.meta.glob('../../../../packages/data/maps/*.json', { eager: true, import: 'default' });
const terrainModules = import.meta.glob('../../../../packages/data/terrains/*.json', { eager: true, import: 'default' });
const weaponDuelRangesModules = import.meta.glob('../../../../packages/data/weapon-duel-ranges/*.json', { eager: true, import: 'default' });

export function loadCatalogFromBrowser(): ContentCatalog {
  const weaponDuelRangesValues = globJsonValues(weaponDuelRangesModules);
  const weaponDuelRanges = weaponDuelRangesValues[0];
  if (!weaponDuelRanges) throw new Error('nenhuma tabela de weapon-duel-ranges encontrada em packages/data');

  return buildCatalog({
    classes: globJsonValues(classModules),
    skills: globJsonValues(skillModules),
    items: globJsonValues(itemModules),
    itemSets: globJsonValues(itemSetModules),
    comps: globJsonValues(compModules),
    maps: globJsonValues(mapModules),
    terrains: globJsonValues(terrainModules),
    weaponDuelRanges,
  });
}
