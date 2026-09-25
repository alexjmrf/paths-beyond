import type { EquippedArtifact } from '@paths-beyond/core';
import type { ContentCatalog } from '@paths-beyond/content';
import type { CharacterOwnershipRepository, StoredHero } from '../repository/types.js';

// M38 4/N — o artefato que um herói leva para a batalha: a definição do catálogo e a instância
// da conta do DONO do herói, já buscadas. É o que `HeroPlacement.artifact` espera (D53).
//
// Usado por TODA montagem de batalha (campanha, masmorra, arena dos dois lados): o artefato
// que só chegasse a uma delas seria poder que depende de onde se joga.
//
// **Falha alto** quando o herói aponta para uma instância que não existe ou para um artefato
// fora do catálogo: é dado corrompido, e seguir sem ele mudaria a batalha em silêncio.
export async function artefatoEquipado(
  ownershipRepository: CharacterOwnershipRepository,
  catalog: ContentCatalog,
  stored: StoredHero,
): Promise<EquippedArtifact | undefined> {
  const instanceId = stored.hero.artifact;
  if (!instanceId) return undefined;

  const instance = (await ownershipRepository.listArtifacts(stored.ownerPlayerId)).find((a) => a.id === instanceId);
  if (!instance) throw new Error(`herói ${stored.hero.id} aponta para o artefato ${instanceId}, que não está na conta do dono`);
  const def = catalog.artifacts[instance.artifactId];
  if (!def) throw new Error(`artefato ${instance.artifactId} não existe no catálogo`);
  return { def, instance };
}
