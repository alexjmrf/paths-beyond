import { fpDiv } from '@paths-beyond/core';
import type { Id } from '@paths-beyond/core';
import type { BannerDef } from './types.js';

// Validação de quem AUTORA o banner, e só dela. É o mesmo par que M17 1/N estabeleceu para
// a árvore de talentos (`validateColumnTree` para o autor, `validateColumnAllocation` para
// quem joga): os dois erros têm autores diferentes e não devem compartilhar função.
//
// O que valida quem JOGA não mora aqui — "o jogador tem premium suficiente?" e "este
// personagem é dele?" são perguntas do servidor, com o banco na mão.

export type BannerIssueCode =
  | 'pool-vazio'
  | 'peso-invalido'
  | 'personagem-repetido'
  | 'personagem-nao-adquirivel'
  | 'pity-invalido'
  | 'fragmento-ausente';

export interface BannerIssue {
  readonly code: BannerIssueCode;
  readonly message: string;
}

export interface BannerValidationContext {
  // Quem D14 marcou como adquirível. Chega de fora porque é conteúdo: o pacote não conhece
  // o elenco, e é o que o mantém fora da regra 4.
  readonly acquirableCharacterIds: readonly Id[];
}

export function validateBanner(banner: BannerDef, context: BannerValidationContext): readonly BannerIssue[] {
  const issues: BannerIssue[] = [];

  if (banner.pool.length === 0) {
    issues.push({ code: 'pool-vazio', message: `Banner '${banner.id}' não tem nenhum personagem no pool.` });
  }

  if (!Number.isInteger(banner.pityThreshold) || banner.pityThreshold < 1) {
    issues.push({
      code: 'pity-invalido',
      message: `Banner '${banner.id}' tem pityThreshold '${banner.pityThreshold}': precisa ser inteiro >= 1.`,
    });
  }

  const acquirable = new Set(context.acquirableCharacterIds);
  const seen = new Set<Id>();

  for (const entry of banner.pool) {
    if (!Number.isInteger(entry.weight) || entry.weight < 1) {
      issues.push({
        code: 'peso-invalido',
        message: `Banner '${banner.id}': peso '${entry.weight}' de '${entry.characterId}' precisa ser inteiro >= 1.`,
      });
    }

    if (seen.has(entry.characterId)) {
      issues.push({
        code: 'personagem-repetido',
        message: `Banner '${banner.id}': '${entry.characterId}' aparece mais de uma vez no pool.`,
      });
    }
    seen.add(entry.characterId);

    if (!acquirable.has(entry.characterId)) {
      // D14 — um personagem de núcleo de história dentro do banner seria uma rolagem que
      // nunca pode dar personagem novo: ela nasce duplicata para todo jogador.
      issues.push({
        code: 'personagem-nao-adquirivel',
        message: `Banner '${banner.id}': '${entry.characterId}' não é adquirível (núcleo de história ou id inexistente).`,
      });
    }

    if (entry.fragmentMaterialId.length === 0) {
      issues.push({
        code: 'fragmento-ausente',
        message: `Banner '${banner.id}': '${entry.characterId}' não declara fragmento, e a duplicata não teria o que pagar.`,
      });
    }
  }

  return issues;
}

// A chance de um personagem, em escala 1000 (regra 2). Existe para a tela poder mostrar a
// taxa sem recalcular peso — e para que mostrar a taxa nunca use um float.
export function rateOf(banner: BannerDef, characterId: Id): number {
  const total = banner.pool.reduce((sum, entry) => sum + entry.weight, 0);
  if (total <= 0) return 0;

  const entry = banner.pool.find((candidate) => candidate.characterId === characterId);
  if (!entry) return 0;

  return fpDiv(entry.weight, total);
}
