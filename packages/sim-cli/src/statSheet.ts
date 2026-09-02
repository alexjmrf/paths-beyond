import { readFileSync } from 'node:fs';
import {
  STAT_KEYS,
  hashState,
  resolveHeroStatSheet,
  type ColumnTalentNode,
  type Hero,
  type ItemInstance,
} from '@paths-beyond/core';
import { loadCatalogFromDisk, type ContentLayout } from '@paths-beyond/content';
import heroSchema from '@paths-beyond/data/schemas/heroes.schema.js';

export type ReadFile = (path: string) => string;

// M9, sub-sessão 4/4: sim-cli passa a poder carregar do catálogo real (antes só lia um
// BattleSetup/DuelParticipant já resolvido, nunca um Hero cru). `sim stat-sheet` é o
// terceiro dos três consumidores do critério de aceite 4 do milestone ("o mesmo Hero
// produz o mesmo hash de StatSheet no cliente, no servidor e no sim-cli") — os outros
// dois (servidor via `resolveHeroCombatProfile`, que chama `resolveHeroStatSheet` por
// dentro; cliente via `loadCatalogFromBrowser`) são cobertos em
// `packages/content/tests/heroStatSheetCrossConsumer.test.ts`.
export function loadHero(readFile: ReadFile, path: string): Hero {
  const raw = readFile(path);
  const parsed = heroSchema.parse(JSON.parse(raw));
  // Mesmo descompasso Zod-vs-core de sempre (tacticsScript.conditions.not recursivo) —
  // schema.parse já validou de verdade, o cast só ponte os dois sistemas de tipo.
  return parsed as unknown as Hero;
}

export interface RunStatSheetCommandArgs {
  readonly heroFile: string;
  readonly catalogDir?: string;
  readonly catalogLayout?: ContentLayout;
}

export function runStatSheetCommand(
  args: RunStatSheetCommandArgs,
  readFile: ReadFile = (path) => readFileSync(path, 'utf8'),
): string {
  const hero = loadHero(readFile, args.heroFile);
  const catalog = loadCatalogFromDisk({ rootDir: args.catalogDir, layout: args.catalogLayout });

  const classDef = catalog.classes[hero.classId];
  if (!classDef) throw new Error(`classe desconhecida no catálogo: ${hero.classId}`);

  const equippedItems: ItemInstance[] = [];
  for (const itemId of Object.values(hero.equipment)) {
    if (itemId === null) continue;
    const item = catalog.items[itemId];
    if (!item) throw new Error(`item desconhecido no catálogo: ${itemId}`);
    equippedItems.push(item);
  }

  // §8.1 (M17, 2/N) — a árvore é do PERSONAGEM, não da classe. `characterId` ausente é
  // legítimo e resolve com zero talento (inimigo de fase ainda é `Hero` até a 3/N), mas
  // `characterId` que o catálogo não conhece é o mesmo defeito de arquivo que uma classe
  // ou um item desconhecido logo acima — e falha do mesmo jeito, alto, em vez de devolver
  // uma folha de status silenciosamente sem talento nenhum.
  let talentTree: readonly ColumnTalentNode[] = [];
  if (hero.characterId !== undefined) {
    const tree = catalog.characterTalentTrees[hero.characterId];
    if (!tree) throw new Error(`personagem desconhecido no catálogo: ${hero.characterId}`);
    talentTree = tree.nodes;
  }

  const stats = resolveHeroStatSheet({ hero, classDef, equippedItems, itemSets: catalog.itemSets, talentTree });

  const lines = [`Herói: ${hero.id} (${hero.classId})`];
  for (const key of STAT_KEYS) lines.push(`  ${key}: ${stats[key]}`);
  lines.push(`Hash: ${hashState(stats)}`);
  return lines.join('\n');
}
