import { resolveHeroStatSheet, type EquippedArtifact, type Hero, type ItemInstance, type SoulInstance } from '@paths-beyond/core';
import type { ArtifactInstanceView } from '../data/api.js';
import { catalog } from '../data/catalog.js';
import { soulDoHeroi } from './soul.js';

// O "poder" mostrado ao lado do herói: o stat sheet resolvido pelo core a partir do que o
// SERVIDOR devolveu (herói + itens equipados). É o número que precisa subir no fim do ciclo
// farm → drop → enhance → equipar — e é o mesmo cálculo que a batalha usa, não uma métrica de
// vitrine. §8.1 (M17, 2/N): a árvore é do personagem, e o poder inclui o talento pelo mesmo
// motivo. M38 4/N: o artefato entra (passos 3/4). M39 5/N: a Soul entra (passo 3).
// Saiu de `PersonagensPanel` para poder ser testado sem montar a tela.

// M38 4/N — o artefato equipado, montado a partir do que o servidor devolveu (a instância) e
// do catálogo (a definição). Ausente ou inconsistente = sem artefato na conta da tela.
function artefatoDoHeroi(
  heroArtifact: string | null | undefined,
  artefatos: readonly ArtifactInstanceView[],
): EquippedArtifact | undefined {
  const instance = artefatos.find((a) => a.id === heroArtifact);
  const def = instance ? catalog.artifacts[instance.artifactId] : undefined;
  return instance && def ? { def, instance } : undefined;
}

export function poderDoHeroi(
  entry: { readonly hero: Hero; readonly equippedItems: readonly ItemInstance[] },
  artefatos: readonly ArtifactInstanceView[],
  souls: readonly SoulInstance[],
): number | null {
  const classDef = catalog.classes[entry.hero.classId];
  if (!classDef) return null;
  const artifact = artefatoDoHeroi(entry.hero.artifact, artefatos);
  const soul = soulDoHeroi(entry.hero, souls);
  const sheet = resolveHeroStatSheet({
    hero: entry.hero,
    classDef,
    equippedItems: entry.equippedItems,
    itemSets: catalog.itemSets,
    talentTree: entry.hero.characterId ? (catalog.characterTalentTrees[entry.hero.characterId]?.nodes ?? []) : [],
    ...(artifact && artifact.def.classId === classDef.id ? { artifact } : {}),
    ...(soul ? { soul } : {}),
  });
  return Object.values(sheet).reduce((total, value) => total + value, 0);
}
