import { fpDiv, fpMul, FP_SCALE } from '../math/fixed.js';
import { rngFor } from '../rng/rngFor.js';
import { nextUint32 } from '../rng/xoshiro128.js';
import type { Id } from '../types.js';
import { computeHitChance } from './accuracy.js';
import { canAffordAp, canAffordPp, spendAp, spendPp, type DuelEconomyState } from './economy.js';
import { computeDamage, isCriticalHit, rollDamageVariance } from './damage.js';
import {
  applyActiveEffectsToStats,
  computeEffectApplicationChance,
  sumDamageDealtPct,
  sumDamageTakenReductionPct,
  upsertActiveEffect,
} from './effects.js';
import { selectReaction } from './reactions.js';
import { selectTacticsAction } from '../tactics/selectTacticsAction.js';
import { combinedTypeDamageMultiplier, weaponTriangleResult } from './triangle.js';
import { computeEvasionFromSpd } from './evasion.js';
import { applyAssistDamage, resolveAssists, type AppliedAssistResult, type AssistCandidate } from './assist.js';
import {
  BASIC_ATTACK_SKILL,
  type ActiveEffect,
  type DuelEngagementContext,
  type DuelParticipant,
  type EffectDef,
} from './types.js';
import type { ConditionContext, ConditionUnitView } from '../tactics/types.js';
import type { EffectApplication, SkillDef } from '../skills/types.js';
import type { StatSheet } from '../stats/types.js';

const MAX_TROCAS = 3;
// §6.7.2 — defensor preempta na troca 1 se spd_defensor >= spd_atacante × 1,15.
const PREEMPT_THRESHOLD_PCT = 1150;
// §6.4 — "Defender (1 PP, -40% de dano na troca)": número normativo dado na prosa da
// spec para as DUAS reações padrão, não um valor de balanceamento arbitrário por skill —
// aplica-se a qualquer reação onAttacked cuja skill não cause dano (multiplier=0, flat=0).
const DEFEND_DAMAGE_REDUCTION_PCT = 400;

export interface ResolveDuelInput {
  readonly seed: number;
  readonly attacker: DuelParticipant;
  readonly defender: DuelParticipant;
  readonly effectDefs: Readonly<Record<Id, EffectDef>>;
  readonly engagement: DuelEngagementContext;
  readonly attackerAssistCandidates?: readonly AssistCandidate[];
  readonly defenderAssistCandidates?: readonly AssistCandidate[];
  // §5.5 (M3) — Flanco: "defensor não pode gastar PP na primeira troca". Lista de
  // participantes travados; campo opcional/aditivo, não muda o comportamento de M2.
  readonly ppLockedForTroca1?: readonly Id[];
}

export interface ActionLogEntry {
  readonly actorId: Id;
  readonly targetId: Id;
  readonly decision: 'skill' | 'basicAttack' | 'none';
  readonly skillId: Id | null;
  readonly tacticsLineIndex: number | null;
  readonly hit: boolean | null;
  readonly isCrit: boolean;
  readonly damage: number;
  readonly reaction: { readonly skillId: Id; readonly lineIndex: number; readonly counterDamage: number | null } | null;
  // §8.3/§6.9 (M10) — effectIds de skill.effects que passaram na rolagem de chance nesta
  // ação. Só a skill do ator principal (tactics/pure-buff) aplica; reação/assistência não
  // (corte documentado em DECISIONS.md).
  readonly effectsApplied: readonly Id[];
}

export interface TrocaLog {
  readonly trocaNumber: 1 | 2 | 3;
  readonly firstMoverId: Id;
  readonly actions: readonly ActionLogEntry[];
}

export interface DuelResult {
  readonly attackerId: Id;
  readonly defenderId: Id;
  readonly trocas: readonly TrocaLog[];
  readonly winnerId: Id | null;
  readonly finalHpAttacker: number;
  readonly finalHpDefender: number;
  // AP/PP são pools de batalha inteira (§6.2) — a camada de batalha (M3) precisa saber
  // quanto sobrou para persistir de volta no UnitOnMap depois do duelo.
  readonly finalApAttacker: number;
  readonly finalPpAttacker: number;
  readonly finalApDefender: number;
  readonly finalPpDefender: number;
  readonly attackerAssists: readonly AppliedAssistResult[];
  readonly defenderAssists: readonly AppliedAssistResult[];
  // §8.3/§6.9 (M10) — estado final de activeEffects dos dois lados, incluindo o que
  // skill.effects aplicou dentro deste duelo. A camada de batalha (commands.ts) precisa
  // disto para persistir de volta no BattleUnit — sem isto, um efeito aplicado em duelo
  // evaporaria ao sincronizar com o mapa.
  readonly finalActiveEffectsAttacker: readonly ActiveEffect[];
  readonly finalActiveEffectsDefender: readonly ActiveEffect[];
}

function rngRoll(seed: number, troca: number, actorId: Id, purpose: string): number {
  return nextUint32(rngFor(seed, troca, actorId, purpose)).value;
}

function rollPercent(rngValue: number): number {
  return rngValue % FP_SCALE;
}

// §6.1 — só o defensor pode ficar impossibilitado de agir (assimetria ranged).
function canDefenderAct(attacker: DuelParticipant, defender: DuelParticipant, engagement: DuelEngagementContext): boolean {
  if (attacker.duelRange > defender.duelRange && engagement.engagementDistance > defender.duelRange) {
    return false;
  }
  return true;
}

function economyOf(p: DuelParticipant, apSpentThisDuel: number, ppSpentThisTroca: number): DuelEconomyState {
  return { pools: { ap: p.ap, pp: p.pp }, apSpentThisDuel, ppSpentThisTroca };
}

function buildConditionView(p: DuelParticipant, effectDefs: Readonly<Record<Id, EffectDef>>): ConditionUnitView {
  const maxHp = p.stats.hp;
  const currentHpPct = maxHp > 0 ? fpDiv(p.currentHp, maxHp) : 0;
  const activeBuffIds: Id[] = [];
  const activeDebuffIds: Id[] = [];
  for (const active of p.activeEffects) {
    const def = effectDefs[active.id];
    if (!def) continue;
    (def.kind === 'buff' ? activeBuffIds : activeDebuffIds).push(active.id);
  }
  return {
    currentHpPct,
    ap: p.ap,
    pp: p.pp,
    unitType: p.unitType,
    weaponType: p.weaponType,
    activeBuffIds,
    activeDebuffIds,
  };
}

function buildContext(
  self: DuelParticipant,
  target: DuelParticipant,
  isSelfAttacker: boolean,
  trocaNumber: 1 | 2 | 3,
  engagement: DuelEngagementContext,
  effectDefs: Readonly<Record<Id, EffectDef>>,
): ConditionContext {
  return {
    self: buildConditionView(self, effectDefs),
    target: buildConditionView(target, effectDefs),
    isSelfAttacker,
    hasPositionalBonus: self.positionalMultiplier > FP_SCALE,
    trocaNumber,
    battleRound: engagement.battleRound,
    alliesAdjacentCount: 0, // grid é M3 — nenhuma unidade adjacente resolvida em M2
  };
}

interface EffectApplicationOutcome {
  readonly actor: DuelParticipant;
  readonly opponent: DuelParticipant;
  readonly appliedEffectIds: readonly Id[];
}

// §8.3/§6.9 (M10) — aplica skill.effects da skill que o ATOR principal executou (tactics
// ou pure-buff/debuff). Reação/contra-ataque e assistência têm seus próprios `effects`
// declaráveis em SkillDef, mas não são resolvidos aqui — corte documentado em
// DECISIONS.md, pareado com o corte de reaction triggers além de onAttacked.
function applyEffectApplications(
  seed: number,
  trocaNumber: 1 | 2 | 3,
  actor: DuelParticipant,
  actorStats: StatSheet,
  opponent: DuelParticipant,
  opponentStats: StatSheet,
  applications: readonly EffectApplication[],
  effectDefs: Readonly<Record<Id, EffectDef>>,
): EffectApplicationOutcome {
  let nextActor = actor;
  let nextOpponent = opponent;
  const appliedEffectIds: Id[] = [];

  for (const application of applications) {
    const def = effectDefs[application.effectId];
    if (!def) continue;

    const targetStats = application.target === 'self' ? actorStats : opponentStats;
    const chance = computeEffectApplicationChance({
      baseChance: application.chance,
      attackerEff: actorStats.eff,
      defenderEfr: targetStats.efr,
    });
    const roll = rollPercent(rngRoll(seed, trocaNumber, actor.id, `effect-application:${application.effectId}`));
    if (roll >= chance) continue;

    if (application.target === 'self') {
      nextActor = { ...nextActor, activeEffects: upsertActiveEffect(nextActor.activeEffects, def, application) };
    } else {
      nextOpponent = { ...nextOpponent, activeEffects: upsertActiveEffect(nextOpponent.activeEffects, def, application) };
    }
    appliedEffectIds.push(application.effectId);
  }

  return { actor: nextActor, opponent: nextOpponent, appliedEffectIds };
}

interface ExchangeOutcome {
  readonly actor: DuelParticipant;
  readonly opponent: DuelParticipant;
  readonly apSpent: Record<Id, number>;
  readonly ppSpentTroca: Record<Id, number>;
  readonly log: ActionLogEntry;
}

function resolveExchange(
  seed: number,
  trocaNumber: 1 | 2 | 3,
  actorRole: 'attacker' | 'defender',
  attacker: DuelParticipant,
  defender: DuelParticipant,
  apSpent: Record<Id, number>,
  ppSpentTroca: Record<Id, number>,
  effectDefs: Readonly<Record<Id, EffectDef>>,
  engagement: DuelEngagementContext,
  ppLockedForTroca1: readonly Id[],
): ExchangeOutcome {
  let actor = actorRole === 'attacker' ? attacker : defender;
  let opponent = actorRole === 'attacker' ? defender : attacker;
  const nextApSpent = { ...apSpent };
  const nextPpSpentTroca = { ...ppSpentTroca };

  const noAction = (): ExchangeOutcome => ({
    actor,
    opponent,
    apSpent: nextApSpent,
    ppSpentTroca: nextPpSpentTroca,
    log: {
      actorId: actor.id,
      targetId: opponent.id,
      decision: 'none',
      skillId: null,
      tacticsLineIndex: null,
      hit: null,
      isCrit: false,
      damage: 0,
      reaction: null,
      effectsApplied: [],
    },
  });

  if (actor.currentHp <= 0 || opponent.currentHp <= 0) return noAction();
  if (actorRole === 'defender' && !canDefenderAct(attacker, defender, engagement)) return noAction();

  const context = buildContext(actor, opponent, actorRole === 'attacker', trocaNumber, engagement, effectDefs);
  const decision = selectTacticsAction({
    script: actor.tacticsScript,
    skills: actor.knownSkills,
    cooldowns: actor.cooldowns,
    apSpentThisDuel: nextApSpent[actor.id] ?? 0,
    context,
  });

  const skill: SkillDef =
    decision.kind === 'skill' ? (actor.knownSkills[decision.skillId] ?? BASIC_ATTACK_SKILL) : BASIC_ATTACK_SKILL;
  const tacticsLineIndex = decision.kind === 'skill' ? decision.lineIndex : null;

  const apEconomy = economyOf(actor, nextApSpent[actor.id] ?? 0, 0);
  if (canAffordAp(apEconomy, skill.apCost)) {
    const spent = spendAp(apEconomy, skill.apCost);
    actor = { ...actor, ap: spent.pools.ap };
    nextApSpent[actor.id] = spent.apSpentThisDuel;
  }

  const isOffensive = skill.multiplier > 0 || skill.flat > 0;
  if (!isOffensive) {
    // §8.3/§6.9 — skill sem componente de dano (multiplier=0/flat=0): o "efeito" dela É
    // o skill.effects, e não passa por rolagem de acerto (só ataques ofensivos usam
    // accuracy — buffs/debuffs puros não têm o que "errar" contra si mesmo).
    const effectiveActorStats = applyActiveEffectsToStats(actor.stats, actor.activeEffects, effectDefs);
    const effectiveOpponentStats = applyActiveEffectsToStats(opponent.stats, opponent.activeEffects, effectDefs);
    const applied = applyEffectApplications(
      seed,
      trocaNumber,
      actor,
      effectiveActorStats,
      opponent,
      effectiveOpponentStats,
      skill.effects,
      effectDefs,
    );
    return {
      actor: applied.actor,
      opponent: applied.opponent,
      apSpent: nextApSpent,
      ppSpentTroca: nextPpSpentTroca,
      log: {
        actorId: actor.id,
        targetId: opponent.id,
        decision: decision.kind,
        skillId: skill.id,
        tacticsLineIndex,
        hit: null,
        isCrit: false,
        damage: 0,
        reaction: null,
        effectsApplied: applied.appliedEffectIds,
      },
    };
  }

  const triangleDamageMultiplier = combinedTypeDamageMultiplier({
    attackerWeapon: actor.weaponType,
    defenderWeapon: opponent.weaponType,
    defenderUnitType: opponent.unitType,
    skillTags: skill.tags,
  });
  const triangleAccuracyModifier = weaponTriangleResult(actor.weaponType, opponent.weaponType).accuracyModifier;

  const evasion = computeEvasionFromSpd(opponent.stats.spd) + engagement.defenderEvasionModifier;
  const hitChance = computeHitChance({
    triangleAccuracyModifier,
    defenderEvasion: evasion,
    terrainAccuracyModifier: engagement.terrainAccuracyModifier,
    heightAccuracyModifier: engagement.heightAccuracyModifier,
  });

  const hitRoll = rollPercent(rngRoll(seed, trocaNumber, actor.id, 'hit'));
  const hit = hitRoll < hitChance;

  if (!hit) {
    return {
      actor,
      opponent,
      apSpent: nextApSpent,
      ppSpentTroca: nextPpSpentTroca,
      log: {
        actorId: actor.id,
        targetId: opponent.id,
        decision: decision.kind,
        skillId: skill.id,
        tacticsLineIndex,
        hit: false,
        isCrit: false,
        damage: 0,
        reaction: null,
        effectsApplied: [],
      },
    };
  }

  const effectiveActorStats = applyActiveEffectsToStats(actor.stats, actor.activeEffects, effectDefs);
  const effectiveOpponentStats = applyActiveEffectsToStats(opponent.stats, opponent.activeEffects, effectDefs);

  const critRoll = rollPercent(rngRoll(seed, trocaNumber, actor.id, 'crit'));
  const isCrit = isCriticalHit(critRoll, effectiveActorStats.chc);
  const varianceRoll = rollDamageVariance(rngRoll(seed, trocaNumber, actor.id, 'damage-variance'));

  // §6.4 — reação onAttacked do oponente, resolvida ANTES de fechar o dano (Defender
  // precisa poder reduzir o dano desta mesma troca).
  const opponentEconomy = economyOf(opponent, nextApSpent[opponent.id] ?? 0, nextPpSpentTroca[opponent.id] ?? 0);
  const opponentContext = buildContext(
    opponent,
    actor,
    actorRole !== 'attacker',
    trocaNumber,
    engagement,
    effectDefs,
  );
  // §5.5 (M3) — Flanco trava o PP do defensor só na troca 1.
  const opponentPpLocked = trocaNumber === 1 && ppLockedForTroca1.includes(opponent.id);
  const reactionDecision = opponentPpLocked
    ? ({ kind: 'none' } as const)
    : selectReaction({
        reactionScript: opponent.reactionScript,
        skills: opponent.knownSkills,
        trigger: 'onAttacked',
        economy: opponentEconomy,
        context: opponentContext,
      });

  let extraReduction = 0;
  let counterSkill: SkillDef | null = null;
  let reactionLog: ActionLogEntry['reaction'] = null;

  if (reactionDecision.kind === 'reaction') {
    const reactionSkill = opponent.knownSkills[reactionDecision.skillId];
    if (reactionSkill && canAffordPp(opponentEconomy, reactionSkill.ppCost ?? 0)) {
      const spent = spendPp(opponentEconomy, reactionSkill.ppCost ?? 0);
      opponent = { ...opponent, pp: spent.pools.pp };
      nextPpSpentTroca[opponent.id] = spent.ppSpentThisTroca;

      if (reactionSkill.multiplier === 0 && reactionSkill.flat === 0) {
        extraReduction = DEFEND_DAMAGE_REDUCTION_PCT;
      } else {
        counterSkill = reactionSkill;
      }
      reactionLog = { skillId: reactionSkill.id, lineIndex: reactionDecision.lineIndex, counterDamage: null };
    }
  }

  const damageDealtPctSum = sumDamageDealtPct(actor.activeEffects, effectDefs);
  const damageTakenReductionPctSum = sumDamageTakenReductionPct(opponent.activeEffects, effectDefs) + extraReduction;

  const damage = computeDamage({
    attackerAtk: effectiveActorStats.atk,
    attackerDef: effectiveActorStats.def,
    attackerHp: effectiveActorStats.hp,
    defenderDef: effectiveOpponentStats.def,
    skill: { multiplier: skill.multiplier, flat: skill.flat, scalesWith: skill.scalesWith },
    attackerPen: effectiveActorStats.pen,
    typeDamageMultiplier: triangleDamageMultiplier,
    positionalMultiplier: actor.positionalMultiplier,
    isCriticalHit: isCrit,
    criticalDamageMultiplier: effectiveActorStats.chd,
    damageDealtPctSum,
    damageTakenReductionPctSum,
    varianceRoll,
  });

  opponent = { ...opponent, currentHp: Math.max(0, opponent.currentHp - damage) };

  // §8.3/§6.9 — a skill do ator aplica seus efeitos como parte da própria ação, depois
  // do dano principal e antes do contra-ataque do oponente (que usa seu próprio script,
  // não o desta skill).
  const effectApplicationResult = applyEffectApplications(
    seed,
    trocaNumber,
    actor,
    effectiveActorStats,
    opponent,
    effectiveOpponentStats,
    skill.effects,
    effectDefs,
  );
  actor = effectApplicationResult.actor;
  opponent = effectApplicationResult.opponent;

  if (counterSkill && opponent.currentHp > 0) {
    const counterTriangle = combinedTypeDamageMultiplier({
      attackerWeapon: opponent.weaponType,
      defenderWeapon: actor.weaponType,
      defenderUnitType: actor.unitType,
      skillTags: counterSkill.tags,
    });
    const counterCritRoll = rollPercent(rngRoll(seed, trocaNumber, opponent.id, 'counter-crit'));
    const counterIsCrit = isCriticalHit(counterCritRoll, effectiveOpponentStats.chc);
    const counterVariance = rollDamageVariance(rngRoll(seed, trocaNumber, opponent.id, 'counter-damage-variance'));

    const counterDamage = computeDamage({
      attackerAtk: effectiveOpponentStats.atk,
      attackerDef: effectiveOpponentStats.def,
      attackerHp: effectiveOpponentStats.hp,
      defenderDef: effectiveActorStats.def,
      skill: { multiplier: counterSkill.multiplier, flat: counterSkill.flat, scalesWith: counterSkill.scalesWith },
      attackerPen: effectiveOpponentStats.pen,
      typeDamageMultiplier: counterTriangle,
      positionalMultiplier: opponent.positionalMultiplier,
      isCriticalHit: counterIsCrit,
      criticalDamageMultiplier: effectiveOpponentStats.chd,
      damageDealtPctSum: 0,
      damageTakenReductionPctSum: 0,
      varianceRoll: counterVariance,
    });

    actor = { ...actor, currentHp: Math.max(0, actor.currentHp - counterDamage) };
    reactionLog = reactionLog && { ...reactionLog, counterDamage };
  }

  return {
    actor,
    opponent,
    apSpent: nextApSpent,
    ppSpentTroca: nextPpSpentTroca,
    log: {
      actorId: actor.id,
      targetId: opponent.id,
      decision: decision.kind,
      skillId: skill.id,
      tacticsLineIndex,
      hit: true,
      isCrit,
      damage,
      reaction: reactionLog,
      effectsApplied: effectApplicationResult.appliedEffectIds,
    },
  };
}

export function resolveDuel(input: ResolveDuelInput): DuelResult {
  const { seed, effectDefs, engagement } = input;

  let attacker = input.attacker;
  let defender = input.defender;

  // §6.5.3 (M10) — "depois que o duelo é declarado e antes da primeira troca": dano de
  // assistência aplicado a HP de verdade aqui, antes do loop de trocas. Aliado do
  // atacante mira o defensor; aliado do defensor mira o atacante.
  const attackerAssistDecisions = resolveAssists(input.attackerAssistCandidates ?? []);
  const attackerAssistOutcome = applyAssistDamage({
    seed,
    sideLabel: 'attacker-assist',
    results: attackerAssistDecisions,
    candidates: input.attackerAssistCandidates ?? [],
    target: { stats: defender.stats, unitType: defender.unitType, weaponType: defender.weaponType, activeEffects: defender.activeEffects },
    effectDefs,
  });
  defender = { ...defender, currentHp: Math.max(0, defender.currentHp - attackerAssistOutcome.totalDamage) };

  const defenderAssistDecisions = resolveAssists(input.defenderAssistCandidates ?? []);
  const defenderAssistOutcome = applyAssistDamage({
    seed,
    sideLabel: 'defender-assist',
    results: defenderAssistDecisions,
    candidates: input.defenderAssistCandidates ?? [],
    target: { stats: attacker.stats, unitType: attacker.unitType, weaponType: attacker.weaponType, activeEffects: attacker.activeEffects },
    effectDefs,
  });
  attacker = { ...attacker, currentHp: Math.max(0, attacker.currentHp - defenderAssistOutcome.totalDamage) };

  const attackerAssists = attackerAssistOutcome.results;
  const defenderAssists = defenderAssistOutcome.results;

  let apSpent: Record<Id, number> = { [attacker.id]: 0, [defender.id]: 0 };
  const ppLockedForTroca1 = input.ppLockedForTroca1 ?? [];

  const trocas: TrocaLog[] = [];

  for (let trocaNumber = 1; trocaNumber <= MAX_TROCAS; trocaNumber++) {
    if (attacker.currentHp <= 0 || defender.currentHp <= 0) break;

    let ppSpentTroca: Record<Id, number> = { [attacker.id]: 0, [defender.id]: 0 };

    const defenderPreempts =
      trocaNumber === 1 && defender.stats.spd >= fpMul(attacker.stats.spd, PREEMPT_THRESHOLD_PCT);
    const order: Array<'attacker' | 'defender'> = defenderPreempts
      ? ['defender', 'attacker']
      : ['attacker', 'defender'];

    const actions: ActionLogEntry[] = [];
    for (const role of order) {
      const outcome = resolveExchange(
        seed,
        trocaNumber as 1 | 2 | 3,
        role,
        attacker,
        defender,
        apSpent,
        ppSpentTroca,
        effectDefs,
        engagement,
        ppLockedForTroca1,
      );
      attacker = role === 'attacker' ? outcome.actor : outcome.opponent;
      defender = role === 'attacker' ? outcome.opponent : outcome.actor;
      apSpent = outcome.apSpent;
      ppSpentTroca = outcome.ppSpentTroca;
      actions.push(outcome.log);
    }

    trocas.push({ trocaNumber: trocaNumber as 1 | 2 | 3, firstMoverId: order[0] === 'attacker' ? attacker.id : defender.id, actions });
  }

  let winnerId: Id | null = null;
  if (attacker.currentHp <= 0 && defender.currentHp > 0) winnerId = defender.id;
  else if (defender.currentHp <= 0 && attacker.currentHp > 0) winnerId = attacker.id;

  return {
    attackerId: attacker.id,
    defenderId: defender.id,
    trocas,
    winnerId,
    finalHpAttacker: attacker.currentHp,
    finalHpDefender: defender.currentHp,
    finalApAttacker: attacker.ap,
    finalPpAttacker: attacker.pp,
    finalApDefender: defender.ap,
    finalPpDefender: defender.pp,
    attackerAssists,
    defenderAssists,
    finalActiveEffectsAttacker: attacker.activeEffects,
    finalActiveEffectsDefender: defender.activeEffects,
  };
}
