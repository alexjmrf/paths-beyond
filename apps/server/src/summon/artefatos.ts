import { validateSoul, type EquippedArtifact, type SoulInstance } from '@paths-beyond/core';
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

// M39 4/N (D61) — a Soul que um herói leva para a batalha, da conta do DONO do herói. Mesmo papel
// e mesma política de `artefatoEquipado`: toda montagem a usa, e dado corrompido falha alto —
// inclusive uma Soul que o `validateSoul` recusa contra o catálogo (mainstat que não é daquele
// personagem, valor fora da faixa), que é a trava por personagem como FORMA no caminho da batalha.
export async function soulEquipada(
  ownershipRepository: CharacterOwnershipRepository,
  catalog: ContentCatalog,
  stored: StoredHero,
): Promise<SoulInstance | undefined> {
  const soulId = stored.hero.soul;
  if (!soulId) return undefined;

  const soul = (await ownershipRepository.listSouls(stored.ownerPlayerId)).find((s) => s.id === soulId);
  if (!soul) throw new Error(`herói ${stored.hero.id} aponta para a Soul ${soulId}, que não está na conta do dono`);
  const def = catalog.characterSouls[soul.soulOf];
  const rules = catalog.economyRules.soul;
  if (!def || !rules) throw new Error(`a Soul ${soul.id} é de ${soul.soulOf}, que não tem Soul no catálogo`);
  const erros = validateSoul(soul, def, rules);
  if (erros.length > 0) throw new Error(`Soul ${soul.id} inválida: ${erros.join('; ')}`);
  return soul;
}
