import type { ContentCatalog } from '@paths-beyond/content';
import type { CharacterOwnershipRepository } from '../repository/types.js';

// §10/D14 (M18, 3/N) — quem o jogador possui.
//
// A resposta é a UNIÃO de duas coisas de naturezas diferentes: o **núcleo de história**,
// que é derivado do catálogo e igual para todo mundo, e o **adquirido**, que é linha no
// banco. Uma função só, num lugar só, porque toda pergunta de posse no servidor tem de
// dar a mesma resposta — e porque a alternativa (cada rota unindo por conta própria) é o
// modo de falha que M17 2/N encontrou em duas rotas de uma vez.
//
// Derivar o núcleo em vez de guardá-lo não é economia de tabela: é o que faz
// "garantido a todo jogador" ser verdade por construção. Um personagem de história
// acrescentado amanhã já é de todos, sem migração e sem passo de concessão em conta nova.
export function storyCharacterIds(catalog: ContentCatalog): readonly string[] {
  return Object.values(catalog.characters)
    .filter((character) => character.acquisition === 'story')
    .map((character) => character.id);
}

export async function ownedCharacterIds(
  ownership: CharacterOwnershipRepository,
  catalog: ContentCatalog,
  playerId: string,
): Promise<ReadonlySet<string>> {
  const acquired = await ownership.listAcquired(playerId);
  return new Set([...storyCharacterIds(catalog), ...acquired]);
}

// §9.4 — "o servidor recalcula o estado a partir do banco; nunca aceita o do cliente."
// Aplicado à posse: um cliente adulterado que mande o id de um herói cujo personagem ele
// nunca puxou tem de ser recusado, e até M18 nada perguntava isso.
//
// Devolve os `characterId` NÃO possuídos, para a rota poder dizer quais. Um herói sem
// `characterId` passa: é ficha de cenário (blueprint de reforço, vaga de masmorra), e
// posse não se aplica a ele.
export function unownedAmong(
  heroes: readonly { readonly hero: { readonly characterId?: string } }[],
  owned: ReadonlySet<string>,
): readonly string[] {
  const faltando = new Set<string>();
  for (const stored of heroes) {
    const characterId = stored.hero.characterId;
    if (characterId !== undefined && !owned.has(characterId)) faltando.add(characterId);
  }
  return [...faltando].sort();
}
