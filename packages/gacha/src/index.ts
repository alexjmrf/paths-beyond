// §10 (M18) — aquisição de personagens. D15: a rolagem vive aqui e não em `packages/core`.
export { rollSummon } from './roll.js';
export { advancePity, isPityArmed } from './pity.js';
export type { PityTransition } from './pity.js';
export { rateOf, validateBanner } from './validate.js';
export type { BannerIssue, BannerIssueCode, BannerValidationContext } from './validate.js';
export { INITIAL_PITY } from './types.js';
export type {
  BannerDef,
  BannerEntry,
  PityState,
  SummonCharacter,
  SummonDuplicate,
  SummonInput,
  SummonOutcome,
  SummonResult,
} from './types.js';
