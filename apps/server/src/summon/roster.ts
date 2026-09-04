import { toStartingHero, type ContentCatalog } from '@paths-beyond/content';
import type { CharacterOwnershipRepository, HeroRepository, StoredHero } from '../repository/types.js';
import { ownedCharacterIds } from './ownership.js';

// §10/D14 (M18, sub-sessão 6/N) — de POSSE para HERÓI.
//
// A 3/N respondeu "o jogador tem este personagem?" e parou aí, o que bastava para o
// anti-cheat de §9.4 e não basta para o critério de aceite 1: ele pede que o invocado seja
// JOGÁVEL. Posse é uma linha (ou o catálogo, no caso do núcleo); jogar exige a INSTÂNCIA —
// o `Hero` com nível, arma e skills que a batalha monta.
//
// Até esta fatia toda instância do projeto nasceu de seed de banco ou de fixture de teste.
// Uma conta nova de verdade abria o jogo sem ninguém para levar ao mapa.
//
// A materialização é PREGUIÇOSA e idempotente, e isso é decisão: não existe rota de
// criação de conta no projeto (os jogadores são semeados), então não há um "momento zero"
// onde pendurar a concessão. Derivar no primeiro acesso ao roster tem a mesma propriedade
// que fez `ownedCharacterIds` derivar o núcleo em vez de guardá-lo: um personagem de
// história acrescentado amanhã ganha instância sozinho, sem migração.

// O id é DERIVADO do par jogador+personagem, e não sorteado. Duas razões: `createHero` é
// chamado de dois lugares (o roster e o summon) e um id sorteado deixaria a segunda
// chamada criar uma cópia; e um id legível é o que se lê num relatório de batalha.
export function startingHeroId(playerId: string, characterId: string): string {
  return `${playerId}-${characterId}`;
}

export function buildStoredHero(catalog: ContentCatalog, playerId: string, characterId: string): StoredHero {
  const character = catalog.characters[characterId];
  // Falha alto: um personagem possuído que não está no catálogo é dado corrompido, e
  // seguir em frente daria ao jogador um roster silenciosamente menor do que ele tem.
  if (!character) throw new Error(`personagem desconhecido no catálogo: ${characterId}`);

  const hero = toStartingHero(character, startingHeroId(playerId, characterId));
  const equippedItems = Object.values(hero.equipment)
    .filter((id): id is string => id !== null)
    .map((id) => catalog.items[id])
    .filter((item): item is NonNullable<typeof item> => item !== undefined);

  return { ownerPlayerId: playerId, hero, equippedItems };
}

// O roster de heróis do jogador, com o que faltava criado antes de responder. Idempotente
// de propósito: só cria o que ainda não existe, e a comparação é pelo PERSONAGEM e não
// pelo id do herói — um herói que o jogador renomeou ou que veio de seed continua sendo a
// instância daquele personagem, e criar outra ao lado seria dar dois Aren à mesma conta.
export async function ensureOwnedHeroes(
  heroRepository: HeroRepository,
  ownershipRepository: CharacterOwnershipRepository,
  catalog: ContentCatalog,
  playerId: string,
): Promise<readonly StoredHero[]> {
  const existentes = await heroRepository.listHeroesByOwner(playerId);
  const jaTem = new Set(existentes.map((stored) => stored.hero.characterId).filter((id): id is string => !!id));

  const owned = await ownedCharacterIds(ownershipRepository, catalog, playerId);
  const faltando = [...owned].filter((characterId) => !jaTem.has(characterId)).sort();
  if (faltando.length === 0) return existentes;

  for (const characterId of faltando) {
    await heroRepository.createHero(buildStoredHero(catalog, playerId, characterId));
  }
  return heroRepository.listHeroesByOwner(playerId);
}
