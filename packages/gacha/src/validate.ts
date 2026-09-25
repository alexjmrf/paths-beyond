import { RANKS_DE_BASE, fpDiv } from '@paths-beyond/core';
import type { Id } from '@paths-beyond/core';
import { entryId, isArtifactEntry, type BannerDef } from './types.js';

// Validação de quem AUTORA o banner, e só dela. É o mesmo par que M17 1/N estabeleceu para
// a árvore de talentos (`validateColumnTree` para o autor, `validateColumnAllocation` para
// quem joga): os dois erros têm autores diferentes e não devem compartilhar função.
//
// O que valida quem JOGA não mora aqui — "o jogador tem premium suficiente?" e "este
// personagem é dele?" são perguntas do servidor, com o banco na mão.

export type BannerIssueCode =
  | 'pool-vazio'
  | 'peso-invalido'
  | 'entrada-repetida'
  | 'personagem-nao-adquirivel'
  | 'artefato-desconhecido'
  | 'pity-invalido'
  | 'soft-pity-invalido'
  | 'banner-sem-hero'
  | 'banner-sem-preenchimento'
  | 'fragmento-ausente'
  | 'entrada-de-tipo-errado'
  | 'destaque-fora-do-pool'
  | 'rotativo-com-outro-hero'
  | 'token-invalido'
  | 'escolha-invalida';

export interface BannerIssue {
  readonly code: BannerIssueCode;
  readonly message: string;
}

export interface BannerValidationContext {
  // Quem D14 marcou como adquirível. Chega de fora porque é conteúdo: o pacote não conhece
  // o elenco, e é o que o mantém fora da regra 4.
  readonly acquirableCharacterIds: readonly Id[];
  // M38 3/N — os artefatos do catálogo, pelo mesmo motivo.
  readonly knownArtifactIds: readonly Id[];
}

const inteiroMin = (valor: number, min: number) => Number.isInteger(valor) && valor >= min;

export function validateBanner(banner: BannerDef, context: BannerValidationContext): readonly BannerIssue[] {
  const issues: BannerIssue[] = [];
  const push = (code: BannerIssueCode, message: string) => issues.push({ code, message: `Banner '${banner.id}': ${message}` });

  if (banner.pool.length === 0) push('pool-vazio', 'não tem nenhuma entrada no pool.');

  // D50 (M37) — um limiar por rank, e os dois conferidos separadamente: com uma mensagem
  // só, quem autorasse os dois errados consertaria um e continuaria quebrado.
  for (const rank of RANKS_DE_BASE) {
    const limiar = banner.pityThresholds[rank];
    if (!inteiroMin(limiar, 1)) push('pity-invalido', `pityThresholds.${rank} '${limiar}' precisa ser inteiro >= 1.`);
  }

  // D54 — a curva. A rampa começa dentro do teto, senão ela nunca apareceria.
  const { baseRate, softStart, step } = banner.softPity;
  if (!inteiroMin(baseRate, 0) || !inteiroMin(step, 0) || !inteiroMin(softStart, 1) || softStart > banner.pityThresholds.hero) {
    push('soft-pity-invalido', `a curva ${JSON.stringify(banner.softPity)} precisa de base e rampa inteiras >= 0 e início entre 1 e o teto.`);
  }

  // D49 §1 (M37) — **o `Adventurer` não tem banner próprio.**
  const heroes = banner.pool.filter((entry) => entry.rank === 'hero');
  if (banner.pool.length > 0 && heroes.length === 0) {
    push('banner-sem-hero', "não oferece nenhum 'hero': o tier de baixo não tem banner próprio.");
  }
  // D54 — e o recíproco: com a curva decidindo o rank, a rolagem que não sai `Hero` precisa
  // ter o que entregar.
  if (banner.pool.length > 0 && !banner.pool.some((entry) => entry.rank === 'adventurer')) {
    push('banner-sem-preenchimento', "não oferece nenhum 'adventurer' para preencher o caminho até o 'hero'.");
  }

  const acquirable = new Set(context.acquirableCharacterIds);
  const artifacts = new Set(context.knownArtifactIds);
  const seen = new Set<Id>();

  for (const entry of banner.pool) {
    const id = entryId(entry);
    if (!inteiroMin(entry.weight, 1)) push('peso-invalido', `peso '${entry.weight}' de '${id}' precisa ser inteiro >= 1.`);
    if (seen.has(id)) push('entrada-repetida', `'${id}' aparece mais de uma vez no pool.`);
    seen.add(id);

    if (isArtifactEntry(entry)) {
      if (!artifacts.has(entry.artifactId)) push('artefato-desconhecido', `'${id}' não é um artefato do catálogo.`);
    } else if (!acquirable.has(entry.characterId)) {
      // D14 — um personagem de núcleo de história dentro do banner seria uma rolagem que
      // nunca pode dar personagem novo: ela nasce duplicata para todo jogador.
      push('personagem-nao-adquirivel', `'${id}' não é adquirível (núcleo de história ou id inexistente).`);
    }

    if (entry.fragmentMaterialId.length === 0) {
      push('fragmento-ausente', `'${id}' não declara fragmento, e a duplicata não teria o que pagar.`);
    }
  }

  // D54 — o que cada tipo exige.
  if (banner.kind === 'rotatingCharacter' || banner.kind === 'rotatingArtifact') {
    const deArtefato = banner.kind === 'rotatingArtifact';
    const destaque = deArtefato ? banner.featuredArtifactId : banner.featuredCharacterId;

    for (const entry of banner.pool) {
      if (isArtifactEntry(entry) !== deArtefato) {
        push('entrada-de-tipo-errado', `'${entryId(entry)}' não cabe num rotativo ${deArtefato ? 'de artefato' : 'de personagem'}.`);
      }
    }
    if (!heroes.some((entry) => entryId(entry) === destaque)) {
      push('destaque-fora-do-pool', `o destaque '${destaque}' não está no pool como 'hero'.`);
    }
    // Não existe 50/50: o `Hero` do rotativo é sempre o destaque.
    for (const entry of heroes) {
      if (entryId(entry) !== destaque) push('rotativo-com-outro-hero', `'${entryId(entry)}' é 'hero' e não é o destaque.`);
    }
  }

  if (banner.kind === 'rotatingCharacter') {
    const { threshold, artifactId } = banner.token;
    if (!inteiroMin(threshold, 1) || !artifacts.has(artifactId)) {
      push('token-invalido', `o token (limiar '${threshold}', artefato '${artifactId}') precisa de limiar inteiro >= 1 e artefato do catálogo.`);
    }
  }

  if (banner.kind === 'generic' && !inteiroMin(banner.choiceEvery, 1)) {
    push('escolha-invalida', `choiceEvery '${banner.choiceEvery}' precisa ser inteiro >= 1.`);
  }

  return issues;
}

// M38 3/N — a chance de uma entrada DENTRO DO RANK dela, em escala 1000 (regra 2). Desde a
// curva de soft pity, o peso decide quem sai dentro do rank que a curva escolheu; qual rank
// sai é `softRate`. Existe para a tela mostrar a taxa sem nunca usar um float.
export function rateOf(banner: BannerDef, id: Id): number {
  const entry = banner.pool.find((candidate) => entryId(candidate) === id);
  if (!entry) return 0;

  const total = banner.pool.filter((candidate) => candidate.rank === entry.rank).reduce((sum, e) => sum + e.weight, 0);
  if (total <= 0) return 0;

  return fpDiv(entry.weight, total);
}
