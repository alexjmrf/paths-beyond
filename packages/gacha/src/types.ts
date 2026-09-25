import type { BaseRank, Id } from '@paths-beyond/core';

// §10 (M18) — a aquisição de personagens. D15: esta regra NÃO mora em `packages/core`.
//
// O que este pacote é: a MECÂNICA da rolagem — peso, garantia e duplicata. O que ele não
// é: conteúdo. Nenhum id de personagem, material ou banner aparece aqui; todos chegam pelo
// `BannerDef`, que é dado validado por Zod em `packages/data` (regra 4).
//
// A seta de dependência aponta para dentro: este pacote importa `@paths-beyond/core` (RNG,
// ponto fixo e o vocabulário de rank) e o core continua não importando nada além de si
// mesmo (regra 1).

// M38 3/N (D54/D55) — o pool passou a oferecer ARTEFATOS além de personagens. As duas
// entradas se distinguem pelo id que carregam, que é também a forma do JSON: uma entrada com
// `characterId` é personagem, uma com `artifactId` é artefato. O `never` do lado oposto é o
// que impede uma entrada de ser as duas coisas.
interface EntryBase {
  // D49/D50 (M37, 2/N) — o rank de BASE daquilo que sai, que é o que decide de qual
  // garantia ele paga. **Derivado, não autorado:** `packages/content` o preenche cruzando o
  // pool com o elenco e com o catálogo de artefatos.
  readonly rank: BaseRank;
  // Peso relativo DENTRO DO RANK. INTEIRO, e é isso que mantém o sorteio livre de ponto
  // flutuante (regra 2): a escolha é `valor % total`, sem uma divisão sequer.
  //
  // Desde o M38 o peso não decide mais QUAL rank sai — quem decide é a curva de soft pity.
  // Ele decide quem sai dentro do rank que a curva escolheu.
  readonly weight: number;
  // O que a duplicata paga. Declarado na entrada, e não derivado do id por convenção de
  // nome: derivar seria o motor inventando um id de conteúdo (regra 4).
  readonly fragmentMaterialId: Id;
}

export interface CharacterEntry extends EntryBase {
  readonly characterId: Id;
  readonly artifactId?: never;
}

export interface ArtifactEntry extends EntryBase {
  readonly artifactId: Id;
  readonly characterId?: never;
}

export type BannerEntry = CharacterEntry | ArtifactEntry;

/** O id do que a entrada entrega, seja personagem ou artefato. */
export function entryId(entry: BannerEntry): Id {
  return entry.characterId ?? entry.artifactId!;
}

export function isArtifactEntry(entry: BannerEntry): entry is ArtifactEntry {
  return entry.artifactId !== undefined;
}

/**
 * D54 — a curva de SOFT PITY, na forma da de Genshin: a chance de um `Hero` é `baseRate` até
 * a rolagem `softStart - 1`; a partir da `softStart`, soma `step` por rolagem; e no teto duro
 * (`pityThresholds.hero`) é 1000.
 *
 * Tudo em MILÉSIMOS INTEIROS (regra 2): 6 é 0,6%, 60 é +6%. O sorteio é `uint32 % 1000 <
 * taxa`, sem uma divisão.
 */
export interface SoftPityCurve {
  readonly baseRate: number;
  readonly softStart: number;
  readonly step: number;
}

// D54 — os três tipos de banner. O TIPO é também a chave do contador de pity: o pity é
// guardado ENTRE banners, por (jogador, tipo), e não mais por (jogador, banner).
export const BANNER_KINDS = ['rotatingCharacter', 'rotatingArtifact', 'generic'] as const;
export type BannerKind = (typeof BANNER_KINDS)[number];

interface BannerBase {
  readonly id: Id;
  readonly pool: readonly BannerEntry[];
  // D50 (M37) — o pity de DOIS ANDARES: um limiar por rank. O de `hero` é o TETO duro da
  // curva de soft pity; o de `adventurer` continua duro e sozinho.
  readonly pityThresholds: Readonly<Record<BaseRank, number>>;
  readonly softPity: SoftPityCurve;
}

/**
 * O token de 1,5·P (roadmap do M38; D55). Por BANNER, não por tipo: é o que o jogador ganha
 * por ter rolado `threshold` vezes NAQUELE rotativo, e entrega o artefato assinatura do Hero em
 * destaque. Derivado do catálogo em `packages/content` — o JSON só declara o limiar.
 */
export interface BannerToken {
  readonly threshold: number;
  readonly artifactId: Id;
  readonly fragmentMaterialId: Id;
}

export interface RotatingCharacterBanner extends BannerBase {
  readonly kind: 'rotatingCharacter';
  // O Hero em destaque, e o ÚNICO `Hero` do pool (D54: não existe 50/50).
  readonly featuredCharacterId: Id;
  readonly token: BannerToken;
}

export interface RotatingArtifactBanner extends BannerBase {
  readonly kind: 'rotatingArtifact';
  // O artefato do Hero em destaque, e o único artefato `hero` do pool.
  readonly featuredArtifactId: Id;
}

export interface GenericBanner extends BannerBase {
  readonly kind: 'generic';
  // D54 — a cada `choiceEvery` rolagens, uma escolha de qualquer entrada `hero` do pool.
  readonly choiceEvery: number;
}

export type BannerDef = RotatingCharacterBanner | RotatingArtifactBanner | GenericBanner;

/**
 * D50 — quantas rolagens se passaram desde o último prêmio de cada rank.
 *
 * **Um contador por rank, e INDEPENDENTES** (decisão do usuário): um `Hero` zera o contador
 * de `Hero` e só.
 *
 * D54 — o contador mora na conta do jogador por (jogador, TIPO de banner): o pity é guardado
 * entre banners do mesmo tipo.
 */
export type PityState = Readonly<Record<BaseRank, number>>;

export const INITIAL_PITY: PityState = { adventurer: 0, hero: 0 };

export interface SummonInput {
  readonly banner: BannerDef;
  // Quem o jogador já possui. Decide entre prêmio e duplicata — e SÓ isso.
  readonly owned: readonly Id[];
  // M38 3/N — os ARTEFATOS (ids de definição) que o jogador já possui. Mesma função.
  readonly ownedArtifacts: readonly Id[];
  readonly pity: PityState;
  readonly seed: number;
  // Identifica ESTA rolagem. Duas rolagens da mesma seed precisam diferir.
  readonly rollId: string;
}

export interface SummonCharacter {
  readonly kind: 'character';
  readonly characterId: Id;
  readonly rank: BaseRank;
}

export interface SummonDuplicate {
  readonly kind: 'duplicate';
  readonly characterId: Id;
  readonly rank: BaseRank;
  readonly fragmentMaterialId: Id;
}

export interface SummonArtifact {
  readonly kind: 'artifact';
  readonly artifactId: Id;
  readonly rank: BaseRank;
}

export interface SummonArtifactDuplicate {
  readonly kind: 'artifactDuplicate';
  readonly artifactId: Id;
  readonly rank: BaseRank;
  readonly fragmentMaterialId: Id;
}

export type SummonOutcome = SummonCharacter | SummonDuplicate | SummonArtifact | SummonArtifactDuplicate;

export interface SummonResult {
  readonly outcome: SummonOutcome;
  // Qual garantia DURA disparou nesta rolagem, se alguma. Um `Hero` que saiu pela rampa do
  // soft pity antes do teto não é garantia: é sorte com a taxa maior.
  readonly guaranteed: BaseRank | null;
  // O contador DEPOIS desta rolagem. Quem chama persiste; o motor não guarda nada.
  readonly pity: PityState;
}

/** O id do que a rolagem entregou, seja personagem ou artefato, prêmio ou duplicata. */
export function outcomeId(outcome: SummonOutcome): Id {
  return outcome.kind === 'character' || outcome.kind === 'duplicate' ? outcome.characterId : outcome.artifactId;
}
