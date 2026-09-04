export type { Id } from './types.js';

export { RULES_VERSION } from './rulesVersion.js';
// §3.3/§9.4 (M22, 1/N) — a política de compatibilidade de versão, uma só para servidor e
// cliente: quem recusa e quem reconhece a recusa leem o mesmo módulo.
export {
  RULES_VERSION_MISMATCH_CODE,
  checkRulesVersion,
  isRulesVersionMismatch,
  type RulesVersionMismatch,
} from './rulesVersionCompat.js';

// §3.3 — hash canônico. Existia só como import relativo dentro de
// packages/core/tests/determinism/ (M8 sub-sessão 7); M9 precisa dele fora do pacote
// pela primeira vez (critério de aceite 4: "mesmo Hero produz o mesmo hash de
// StatSheet no cliente, no servidor e no sim-cli" — o análogo de §3.3 pra camada de
// conteúdo), então passa a ser exportado de verdade.
export { canonicalize, fnv1a32, hashState } from './determinism/hash.js';

export { FP_SCALE, fpDiv, fpMul, fpPct, intDiv, intMul } from './math/fixed.js';

export { nextUint32, seedRng } from './rng/xoshiro128.js';
export type { RngResult, RngState } from './rng/xoshiro128.js';
export { rngFor } from './rng/rngFor.js';

export { STAT_KEYS } from './stats/types.js';
export type { StatKey, StatModifier, StatSheet } from './stats/types.js';
export { addFlat, aggregateStatSheet, multiplyByPctSum } from './stats/aggregate.js';
export type { AggregateStatsInput } from './stats/aggregate.js';

export type { EffectApplication, LethalUses, ReactionTrigger, SkillDef } from './skills/types.js';

export { evaluateCondition } from './tactics/evaluateCondition.js';
export { selectTacticsAction } from './tactics/selectTacticsAction.js';
// §6.3 (M18, 7/N) — os tetos do script tático, aplicados pela primeira vez. Validação de
// preparação, como `validateColumnAllocation`: não é chamada por `simulate`.
export {
  BASE_TACTICS_CONDITIONS,
  BASE_TACTICS_LINES,
  MAX_TACTICS_CONDITIONS,
  MAX_TACTICS_LINES,
  validateTacticsScript,
} from './tactics/validateTacticsScript.js';
export type {
  TacticsValidationIssue,
  TacticsValidationResult,
  ValidateTacticsScriptInput,
} from './tactics/validateTacticsScript.js';
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
export type { ActionLogEntry, DuelResult, LethalTriggerLog, ResolveDuelInput, TrocaLog } from './duel/resolveDuel.js';
export {
  LETHAL_SURVIVE_HP,
  LETHAL_SURVIVE_TAG,
  findLethalTriggerSkill,
  isLethalTriggerSkill,
  isSurviveLethalSkill,
  lethalUsesOf,
  persistentLethalTriggersUsed,
} from './duel/lethal.js';
export type { FindLethalTriggerInput } from './duel/lethal.js';
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
  isControlObject,
  isInBounds,
  manhattanDistance,
  orthogonalNeighbors,
  tileAt,
  DEFAULT_GATE,
  TILE_OBJECTS,
} from './grid/types.js';
export type { Coord, GateDef, GateOpensFor, GridMap, MoveType, Terrain, TerrainId, Tile, TileObject } from './grid/types.js';
export { computeReachableTiles, isBlockedByObject, isTilePassable, validatePath } from './grid/pathfinding.js';
export type { PathfindingContext, PathValidationResult, ReachableTile } from './grid/pathfinding.js';

export { resolveAiTurns, resolveAiTurnsLogged } from './battle/aiTurn.js';
export type { AiTurnStep, ResolveAiTurnsResult } from './battle/aiTurn.js';
export { buildBattleSetupFromHeroes, buildBattleUnit } from './battle/assemble.js';
export type {
  BuildBattleSetupFromHeroesInput,
  BuildBattleUnitInput,
  EnemyPlacement,
  HeroPlacement,
  Placement,
  SummonBlueprintPlacement,
} from './battle/assemble.js';
export { applyCommand } from './battle/commands.js';
export type { CommandOutcome } from './battle/commands.js';
export { computeInitiativeOrder, insertIntoInitiativeOrder, rollInitiative } from './battle/initiative.js';
export type { InitiativeEntry, InitiativeUnit } from './battle/initiative.js';
// §5.1 (M15 D3) — o cliente precisa dos mesmos portões abertos que o core usa para
// revalidar, senão desenharia um alcance de movimento que o motor recusa (regra 3).
export { gateDefAt, isGateOpen, openGateCoords } from './battle/gates.js';
export { GUARD_LEASH_TILES, decideMapAiCommand } from './battle/mapAi.js';
export type { DecideMapAiCommandInput, MapAiArchetype } from './battle/mapAi.js';
export { computePositionalModifiers } from './battle/positional.js';
export type { PositionalModifiers, PositionalModifiersInput } from './battle/positional.js';
export { endRound, isRoundComplete } from './battle/round.js';
export { unitsInArea } from './battle/area.js';
export { resolveValorSkill } from './battle/valor.js';
export type { ValorResolution, ValorSkillDef } from './battle/valor.js';
export { checkWinCondition } from './battle/winCondition.js';
export type { BattleOutcome } from './battle/winCondition.js';
export { applyCommandAndAdvance, buildInitialState, buildInitialStateLogged, simulate } from './battle/simulate.js';
export type { BuildInitialStateResult } from './battle/simulate.js';
export type { ApplyCommandAndAdvanceResult } from './battle/simulate.js';
export type {
  BattleCommand,
  BattleResult,
  BattleSetup,
  BattleState,
  BattleUnit,
  GateProgress,
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
export {
  SET_SPECIAL_DUELISTA,
  SET_SPECIAL_IMUNIDADE,
  SET_SPECIAL_RESERVA,
  SET_SPECIAL_SENTINELA,
  resolveSetBonuses,
  resolveSetSpecialEffects,
} from './items/sets.js';
export { HEAL_TAG, applyHeal, computeHeal, isHealingSkill, scalingStatOf } from './duel/heal.js';
export type { HealInput, HealSkillInput } from './duel/heal.js';
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

// §8.1 (M17, 3/N) — o caminho do inimigo autorado, o par de `resolveHeroCombatProfile`.
export { resolveEnemyCombatProfile } from './enemy/combatProfile.js';
export type { EnemyDef, ResolveEnemyCombatProfileInput } from './enemy/types.js';

export { MELEE_ASSIST_RANGE, resolveHeroCombatProfile } from './hero/combatProfile.js';
export type { HeroCombatProfile, ResolveHeroCombatProfileInput } from './hero/combatProfile.js';
export { resolveHeroStatSheet } from './hero/resolve.js';
export type { ResolveHeroStatSheetInput } from './hero/resolve.js';
export type { ClassDef, Hero } from './hero/types.js';

export { canPromote, promote } from './talents/promotion.js';
export type {
  CanPromoteInput,
  CanPromoteResult,
  PromoteInput,
  PromoteResult,
  PromotionRequirement,
} from './talents/promotion.js';
export { resetFromRow } from './talents/reset.js';
export {
  allocatedPath,
  validateColumnAllocation,
  validateColumnTree,
  MAX_DEPTH,
  MIN_DEPTH,
  TALENT_POINT_BUDGET,
} from './talents/columnTree.js';
export type {
  ColumnTalentNode,
  ColumnTalentTree,
  TalentColumn,
  ValidateColumnAllocationInput,
  ValidationIssue,
  ValidationResult,
} from './talents/columnTree.js';
export { resolveTalentEffects } from './talents/resolve.js';
export type { ApRefundRule, ResolvedTalents } from './talents/resolve.js';
export type { TalentAllocation, TalentEffect } from './talents/types.js';

// §10 (M14) — economia PvE: energia de conta, recompensa de masmorra, awakening e imprint.
// Tudo puro e sem relógio: quem sabe que horas são é o servidor, que passa `nowMs`.
export { resolveEnergy, spendEnergy } from './economy/energy.js';
export { civilFromDays, daysFromCivil, daysFromEpochMs, lastResetAtMs, weekdayFromDays } from './economy/calendar.js';
export { consumeEntry, entriesRemaining, resolveEntries } from './economy/entryLimit.js';
export {
  AUTO_BATTLE_COMMAND_BUDGET,
  DEFAULT_AUTO_ARCHETYPE,
  resolveAutoBattle,
} from './economy/autoBattle.js';
export type { AutoBattleResult, ResolveAutoBattleInput } from './economy/autoBattle.js';
export { rollDungeonRun } from './economy/drops.js';
export type { RollDungeonRunInput } from './economy/drops.js';
export { MAX_AWAKENING, awaken } from './economy/awakening.js';
export type { AwakenInput } from './economy/awakening.js';
export { MAX_IMPRINT, applyImprint } from './economy/imprint.js';
export type { ApplyImprintInput } from './economy/imprint.js';
export type {
  AwakenResult,
  AwakeningStep,
  CivilDate,
  ConsumeEntryResult,
  CurrencyKey,
  DungeonDifficulty,
  EnhanceCost,
  EntryLimitRule,
  EntryLimitState,
  ResetSchedule,
  DungeonDef,
  DungeonFocus,
  DungeonRunRewards,
  EconomyRules,
  EnergyRules,
  EnergyState,
  GearDropEntry,
  ImprintResult,
  ImprintStep,
  MaterialBag,
  MaterialDef,
  MaterialDropEntry,
  MaterialKind,
  SpendEnergyResult,
  Wallet,
} from './economy/types.js';
