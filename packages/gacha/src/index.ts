// §10 (M18) — aquisição de personagens. D15: a rolagem vive aqui e não em `packages/core`.
// M38 3/N — e de artefatos: soft pity, rotativos, o token de 1,5·P e a escolha do genérico.
export { outcomeFor, rollSummon } from './roll.js';
export { softRate } from './softPity.js';
export { advancePity, isPityArmed, pityScopeOf, rankGarantido, ranksSemEntrada } from './pity.js';
export type { PityTransition } from './pity.js';
export { INITIAL_TOKEN, advanceToken, resolvePendingToken, tokenOutcome } from './token.js';
export type { TokenAdvance, TokenState, TokenStatus } from './token.js';
export { INITIAL_CHOICE, advanceChoice, choosableEntries, redeemChoice } from './escolha.js';
export type { ChoiceRedemption, ChoiceState } from './escolha.js';
export { rateOf, validateBanner } from './validate.js';
export type { BannerIssue, BannerIssueCode, BannerValidationContext } from './validate.js';
export { BANNER_KINDS, INITIAL_PITY, entryId, isArtifactEntry, outcomeId } from './types.js';
export type {
  ArtifactEntry,
  BannerDef,
  BannerEntry,
  BannerKind,
  BannerToken,
  CharacterEntry,
  GenericBanner,
  PityState,
  RotatingArtifactBanner,
  RotatingCharacterBanner,
  SoftPityCurve,
  SummonArtifact,
  SummonArtifactDuplicate,
  SummonCharacter,
  SummonDuplicate,
  SummonInput,
  SummonOutcome,
  SummonResult,
} from './types.js';
