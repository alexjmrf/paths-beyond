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
// §8.1 (M17, 2/N) — o ELENCO e as árvores dele. Os dois entram juntos e pelo mesmo motivo
// que `buildCatalog` os exige sem `?? []`: catálogo sem árvore não é "partida sem talento",
// é o talento de todo personagem sumindo em silêncio. Sem esta dupla o adapter de browser
// deixaria de ter paridade com o de disco — o descompasso que este arquivo existe para
// evitar, e que o cliente só descobriria em runtime.
const characterModules = import.meta.glob('../../../../packages/data/characters/*.json', { eager: true, import: 'default' });
const characterTalentTreeModules = import.meta.glob('../../../../packages/data/character-talent-trees/*.json', {
  eager: true,
  import: 'default',
});
// §8.1 (M17, 3/N) — os inimigos de fase autorados. Mesma paridade com o adapter de disco:
// sem eles o cliente montaria a campanha com `enemyId` que não resolve.
const enemyModules = import.meta.glob('../../../../packages/data/enemies/*.json', { eager: true, import: 'default' });
const skillModules = import.meta.glob('../../../../packages/data/skills/*.json', { eager: true, import: 'default' });
const itemModules = import.meta.glob('../../../../packages/data/items/*.json', { eager: true, import: 'default' });
const itemSetModules = import.meta.glob('../../../../packages/data/item-sets/*.json', { eager: true, import: 'default' });
const effectModules = import.meta.glob('../../../../packages/data/effects/*.json', { eager: true, import: 'default' });
const valorSkillModules = import.meta.glob('../../../../packages/data/valor-skills/*.json', { eager: true, import: 'default' });
// §5.6 (M15 D2) — os reforços invocáveis. Sem isto o cliente montaria a campanha com a
// valor-skill de invocação no catálogo e sem a unidade que ela invoca: o comando existiria
// no HUD e seria rejeitado no clique.
const summonBlueprintModules = import.meta.glob('../../../../packages/data/summon-blueprints/*.json', { eager: true, import: 'default' });
const compModules = import.meta.glob('../../../../packages/data/comps/*.json', { eager: true, import: 'default' });
const encounterModules = import.meta.glob('../../../../packages/data/encounters/*.json', { eager: true, import: 'default' });
const mapModules = import.meta.glob('../../../../packages/data/maps/*.json', { eager: true, import: 'default' });
const terrainModules = import.meta.glob('../../../../packages/data/terrains/*.json', { eager: true, import: 'default' });
const weaponDuelRangesModules = import.meta.glob('../../../../packages/data/weapon-duel-ranges/*.json', { eager: true, import: 'default' });
// §10 (M14) — economia PvE. O cliente ainda não tem tela de masmorra (é a fatia 5/N), mas
// o catálogo é um só: carregar aqui mantém os dois adaptadores em paridade, que é o que
// impede o cliente de descobrir a diferença tarde, em runtime.
const dungeonModules = import.meta.glob('../../../../packages/data/dungeons/*.json', { eager: true, import: 'default' });
const dungeonEncounterModules = import.meta.glob('../../../../packages/data/dungeon-encounters/*.json', { eager: true, import: 'default' });
const materialModules = import.meta.glob('../../../../packages/data/materials/*.json', { eager: true, import: 'default' });
// §10 (M18, 2/N) — os banners de invocação. O cliente ainda não tem tela de summon (é a
// 6/N), e carregar aqui é a mesma paridade que os outros: um adapter que conhece menos
// tipos de conteúdo que o outro é um descompasso descoberto em runtime.
const bannerModules = import.meta.glob('../../../../packages/data/banners/*.json', { eager: true, import: 'default' });
const economyRulesModules = import.meta.glob('../../../../packages/data/economy-rules/*.json', { eager: true, import: 'default' });
const substatWeightsModules = import.meta.glob('../../../../packages/data/substat-weights/*.json', { eager: true, import: 'default' });
const mainstatWeightsModules = import.meta.glob('../../../../packages/data/mainstat-weights/*.json', { eager: true, import: 'default' });
const enhanceRatesModules = import.meta.glob('../../../../packages/data/enhance-rates/*.json', { eager: true, import: 'default' });

export function loadCatalogFromBrowser(): ContentCatalog {
  const weaponDuelRangesValues = globJsonValues(weaponDuelRangesModules);
  const weaponDuelRanges = weaponDuelRangesValues[0];
  if (!weaponDuelRanges) throw new Error('nenhuma tabela de weapon-duel-ranges encontrada em packages/data');

  return buildCatalog({
    classes: globJsonValues(classModules),
    characters: globJsonValues(characterModules),
    banners: globJsonValues(bannerModules),
    characterTalentTrees: globJsonValues(characterTalentTreeModules),
    enemies: globJsonValues(enemyModules),
    skills: globJsonValues(skillModules),
    items: globJsonValues(itemModules),
    itemSets: globJsonValues(itemSetModules),
    effects: globJsonValues(effectModules),
    valorSkills: globJsonValues(valorSkillModules),
    summonBlueprints: globJsonValues(summonBlueprintModules),
    comps: globJsonValues(compModules),
    encounters: globJsonValues(encounterModules),
    maps: globJsonValues(mapModules),
    terrains: globJsonValues(terrainModules),
    weaponDuelRanges,
    dungeons: globJsonValues(dungeonModules),
    dungeonEncounters: globJsonValues(dungeonEncounterModules),
    materials: globJsonValues(materialModules),
    economyRules: globJsonValues(economyRulesModules),
    substatWeights: globJsonValues(substatWeightsModules)[0],
    mainstatWeights: globJsonValues(mainstatWeightsModules)[0],
    enhanceRates: globJsonValues(enhanceRatesModules)[0],
  });
}
