export type { Id } from './types.js';

export { RULES_VERSION } from './rulesVersion.js';

// §3.3 — hash canônico. Existia só como import relativo dentro de
// packages/core/tests/determinism/ (M8 sub-sessão 7); M9 precisa dele fora do pacote
// pela primeira vez (critério de aceite 4: "mesmo Hero produz o mesmo hash de
// StatSheet no cliente, no servidor e no sim-cli" — o análogo de §3.3 pra camada de
// conteúdo), então passa a ser exportado de verdade.
export { canonicalize, fnv1a32, hashState } from './determinism/hash.js';

export { FP_SCALE, fpDiv, fpMul, fpPct } from './math/fixed.js';

export { nextUint32, seedRng } from './rng/xoshiro128.js';
export type { RngResult, RngState } from './rng/xoshiro128.js';
export { rngFor } from './rng/rngFor.js';

export { STAT_KEYS } from './stats/types.js';
export type { StatKey, StatModifier, StatSheet } from './stats/types.js';
export { addFlat, aggregateStatSheet, multiplyByPctSum } from './stats/aggregate.js';
export type { AggregateStatsInput } from './stats/aggregate.js';

export type { EffectApplication, ReactionTrigger, SkillDef } from './skills/types.js';

export { evaluateCondition } from './tactics/evaluateCondition.js';
export { selectTacticsAction } from './tactics/selectTacticsAction.js';
export type {
  Condition,
  ConditionContext,
  ConditionUnitView,
  TacticsLine,
  TacticsScript,
  UnitType,
  WeaponType,
} from './tactics/types.js';
export type { SelectTacticsActionInput, TacticsDecision } from './tactics/selectTacticsAction.js';

export { ACC_BASELINE, computeHitChance } from './duel/accuracy.js';
export type { AccuracyInput } from './duel/accuracy.js';
export { ASSIST_DAMAGE_MULTIPLIER, resolveAssists } from './duel/assist.js';
export type { AssistCandidate, AssistResult } from './duel/assist.js';
export { computeDamage, isCriticalHit, rollCritRoll, rollDamageVariance } from './duel/damage.js';
export type { DamageInput, DamageSkillInput } from './duel/damage.js';
export {
  canAffordAp,
  canAffordPp,
  resetTrocaPpSpend,
  spendAp,
  spendPp,
} from './duel/economy.js';
export type { DuelEconomyState, ResourcePools } from './duel/economy.js';
export {
  applyActiveEffectsToStats,
  computeEffectApplicationChance,
  sumDamageDealtPct,
  sumDamageTakenReductionPct,
} from './duel/effects.js';
export type { EffectApplicationChanceInput } from './duel/effects.js';
export { computeEvasionFromSpd } from './duel/evasion.js';
export { selectReaction } from './duel/reactions.js';
export type { ReactionDecision, SelectReactionInput } from './duel/reactions.js';
export { resolveDuel } from './duel/resolveDuel.js';
export type { ActionLogEntry, DuelResult, ResolveDuelInput, TrocaLog } from './duel/resolveDuel.js';
export {
  MAGIC_CYCLE,
  PHYSICAL_CYCLE,
  armoredDamageMultiplier,
  combinedTypeDamageMultiplier,
  typeEffectivenessDamageMultiplier,
  weaponTriangleResult,
} from './duel/triangle.js';
export type { CombinedTypeDamageInput, TriangleResult } from './duel/triangle.js';
export { BASIC_ATTACK_SKILL } from './duel/types.js';
export type {
  ActiveEffect,
  DuelEngagementContext,
  DuelParticipant,
  EffectDef,
  ReactionLine,
} from './duel/types.js';

export {
  coordKey,
  coordsEqual,
  isInBounds,
  manhattanDistance,
  orthogonalNeighbors,
  tileAt,
} from './grid/types.js';
export type { Coord, GridMap, MoveType, Terrain, TerrainId, Tile } from './grid/types.js';
export { computeReachableTiles, validatePath } from './grid/pathfinding.js';
export type { PathfindingContext, PathValidationResult, ReachableTile } from './grid/pathfinding.js';

export { resolveAiTurns } from './battle/aiTurn.js';
export { buildBattleSetupFromHeroes, buildBattleUnit } from './battle/assemble.js';
export type { BuildBattleSetupFromHeroesInput, BuildBattleUnitInput, HeroPlacement } from './battle/assemble.js';
export { applyCommand } from './battle/commands.js';
export type { CommandOutcome } from './battle/commands.js';
export { computeInitiativeOrder } from './battle/initiative.js';
export type { InitiativeEntry, InitiativeUnit } from './battle/initiative.js';
export { GUARD_LEASH_TILES, decideMapAiCommand } from './battle/mapAi.js';
export type { DecideMapAiCommandInput, MapAiArchetype } from './battle/mapAi.js';
export { computePositionalModifiers } from './battle/positional.js';
export type { PositionalModifiers, PositionalModifiersInput } from './battle/positional.js';
export { checkWinCondition, endRound, isRoundComplete } from './battle/round.js';
export { applyCommandAndAdvance, buildInitialState, simulate } from './battle/simulate.js';
export type { ApplyCommandAndAdvanceResult } from './battle/simulate.js';
export type {
  BattleCommand,
  BattleResult,
  BattleSetup,
  BattleState,
  BattleUnit,
  PermadeathMode,
  Replay,
  Side,
  WinCondition,
} from './battle/types.js';

export { computeCombatPower } from './items/cp.js';
export { attemptEnhance } from './items/enhance.js';
export type { AttemptEnhanceInput, AttemptEnhanceResult } from './items/enhance.js';
export { generateItem } from './items/generate.js';
export type { GenerateItemInput } from './items/generate.js';
export { applyReforge } from './items/reforge.js';
export type { ApplyReforgeInput, ApplyReforgeResult } from './items/reforge.js';
export { resolveSetBonuses } from './items/sets.js';
export { ENHANCE_MILESTONES } from './items/types.js';
export type {
  EnhanceLevel,
  EnhanceRates,
  GearSlot,
  ItemInstance,
  ItemSet,
  MainstatWeightEntry,
  Rarity,
  SetEffect,
  SubstatWeightEntry,
  ValueRange,
} from './items/types.js';

export { MELEE_ASSIST_RANGE, resolveHeroCombatProfile } from './hero/combatProfile.js';
export type { HeroCombatProfile, ResolveHeroCombatProfileInput } from './hero/combatProfile.js';
export { resolveHeroStatSheet } from './hero/resolve.js';
export type { ResolveHeroStatSheetInput } from './hero/resolve.js';
export type { ClassDef, Hero } from './hero/types.js';

export { validateAllocation } from './talents/allocate.js';
export type { ValidateAllocationInput, ValidationIssue, ValidationResult } from './talents/allocate.js';
export { canPromote, promote } from './talents/promotion.js';
export type {
  CanPromoteInput,
  CanPromoteResult,
  PromoteInput,
  PromoteResult,
  PromotionRequirement,
} from './talents/promotion.js';
export { resetTree } from './talents/reset.js';
export { resolveTalentEffects } from './talents/resolve.js';
export type { ApRefundRule, ResolvedTalents } from './talents/resolve.js';
export type { TalentAllocation, TalentEffect, TalentNode, TalentTree } from './talents/types.js';
