import { fpDiv, fpMul, fpPct, FP_SCALE } from '../math/fixed.js';
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
import { applyHeal, computeHeal, isHealingSkill, scalingStatOf } from './heal.js';
import {
  LETHAL_SURVIVE_HP,
  findLethalTriggerSkill,
  isSurviveLethalSkill,
  persistentLethalTriggersUsed,
} from './lethal.js';
import { effectivePpCost, selectReaction } from './reactions.js';
import { SET_SPECIAL_DUELISTA, SET_SPECIAL_IMUNIDADE } from '../items/sets.js';
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
import type { EffectApplication, ReactionTrigger, SkillDef } from '../skills/types.js';
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
  // §6.5.3 (M10 sub-sessão 7/N) — cura que o ATOR aplicou em si mesmo nesta ação (skill de
  // duelo com a tag `heal`). Num 1v1 não há aliado pra mirar, então auto-cura é o único
  // alvo coerente. 0 para toda ação que não é de cura.
  readonly heal: number;
  // §6.4 — no máximo UMA reação por troca chega a disparar (teto de 1 PP por troca), então
  // um campo único basta; `trigger` diz qual gatilho venceu (M10 sub-sessão 5/N).
  readonly reaction: {
    readonly skillId: Id;
    readonly lineIndex: number;
    readonly counterDamage: number | null;
    // §6.4 (M10 sub-sessão 7/N) — "Cura de emergência": reação com a tag `heal` cura o
    // próprio reagente em vez de contra-atacar. `null` quando a reação não é de cura,
    // simétrico a `counterDamage`.
    readonly healDone: number | null;
    readonly trigger: ReactionTrigger;
  } | null;
  // §8.3/§6.9 (M10) — effectIds de skill.effects que passaram na rolagem de chance nesta
  // ação. Só a skill do ator principal (tactics/pure-buff) aplica; reação/assistência não
  // (corte documentado em DECISIONS.md).
  readonly effectsApplied: readonly Id[];
}

// §6.4 (M10 sub-sessão 8/N) — um disparo de gatilho de morte. Fica fora de `ActionLogEntry`
// porque nem todo disparo acontece dentro de uma troca: a janela de assistências (§6.5)
// também mata, e ali não existe ação de troca a que anexar o registro.
export interface LethalTriggerLog {
  readonly unitId: Id; // quem estava morrendo
  readonly skillId: Id;
  readonly survived: boolean; // variante `survive` (previne) vs. efeito ao morrer
  readonly damageToKiller: number | null; // null quando não há dano — simétrico a counterDamage
  readonly effectsApplied: readonly Id[];
  readonly trocaNumber: 1 | 2 | 3 | null; // null = janela de assistências, antes da troca 1
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
  // §6.4 (M10 sub-sessão 8/N) — todo gatilho de morte que disparou neste duelo, na ordem
  // cronológica (assistências primeiro, depois as trocas).
  readonly lethalTriggers: readonly LethalTriggerLog[];
  // Só o que é `lethalUses:'perBattle'` — a camada de batalha persiste isto de volta no
  // BattleUnit, pelo mesmo caminho de `finalActiveEffects*`. O que é `perDuel` fica de fora
  // de propósito: recarrega no duelo seguinte.
  readonly finalLethalTriggersUsedAttacker: readonly Id[];
  readonly finalLethalTriggersUsedDefender: readonly Id[];
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

// §7.4 — efeitos `special` de set que o duelo interpreta (Duelista, Imunidade).
function hasSetSpecial(p: DuelParticipant, effectId: Id): boolean {
  return p.setSpecialEffectIds?.includes(effectId) === true;
}

// §6.4 — "Cura de emergência": uma reação com a tag `heal` cura quem reagiu. Escala com o
// stat efetivo do próprio reagente, como qualquer outra cura (ver heal.ts).
function healReactor(
  skill: SkillDef,
  reactor: DuelParticipant,
  effectDefs: Readonly<Record<Id, EffectDef>>,
): number {
  const stats = applyActiveEffectsToStats(reactor.stats, reactor.activeEffects, effectDefs);
  return computeHeal({
    healerStat: scalingStatOf(stats, skill.scalesWith),
    skill: { multiplier: skill.multiplier, flat: skill.flat },
    healerHeal: stats.heal,
  });
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
  // §6.4 (M10 sub-sessão 5/N) — o gatilho `onDebuffed` precisa distinguir "um debuff caiu
  // no OPONENTE" de "o ator se buffou": `appliedEffectIds` sozinho não diz o alvo.
  readonly debuffedOpponent: boolean;
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
  // Prefixo do stream de RNG. O gatilho de morte passa o seu próprio: adicionar uma
  // rolagem em um sistema não pode deslocar as rolagens de outro, e sem isto a aplicação
  // de efeito da skill do ator e a do gatilho de morte dele dividiriam o mesmo stream.
  purposePrefix = 'effect-application',
): EffectApplicationOutcome {
  let nextActor = actor;
  let nextOpponent = opponent;
  const appliedEffectIds: Id[] = [];
  let debuffedOpponent = false;

  for (const application of applications) {
    const def = effectDefs[application.effectId];
    if (!def) continue;

    // §7.4 Imunidade — "imune a debuffs na troca 1 do duelo". Barrado ANTES da rolagem de
    // chance: imunidade não é resistência, não há o que rolar. Vale para quem RECEBE o
    // efeito (não para quem aplica) e só para `kind:'debuff'` — buff passa normalmente.
    const recipient = application.target === 'self' ? nextActor : nextOpponent;
    if (trocaNumber === 1 && def.kind === 'debuff' && hasSetSpecial(recipient, SET_SPECIAL_IMUNIDADE)) continue;

    const targetStats = application.target === 'self' ? actorStats : opponentStats;
    const chance = computeEffectApplicationChance({
      baseChance: application.chance,
      attackerEff: actorStats.eff,
      defenderEfr: targetStats.efr,
    });
    const roll = rollPercent(rngRoll(seed, trocaNumber, actor.id, `${purposePrefix}:${application.effectId}`));
    if (roll >= chance) continue;

    if (application.target === 'self') {
      nextActor = { ...nextActor, activeEffects: upsertActiveEffect(nextActor.activeEffects, def, application) };
    } else {
      nextOpponent = { ...nextOpponent, activeEffects: upsertActiveEffect(nextOpponent.activeEffects, def, application) };
      if (def.kind === 'debuff') debuffedOpponent = true;
    }
    appliedEffectIds.push(application.effectId);
  }

  return { actor: nextActor, opponent: nextOpponent, appliedEffectIds, debuffedOpponent };
}

interface LethalDamageInput {
  readonly seed: number;
  readonly trocaNumber: 1 | 2 | 3 | null; // null = janela de assistências (§6.5)
  readonly victim: DuelParticipant;
  readonly damage: number;
  readonly effectDefs: Readonly<Record<Id, EffectDef>>;
  // Ausente = sem matador identificável (dano de assistência: quem assiste não é
  // participante do duelo). Nesse caminho só a variante `survive` tem o que fazer.
  readonly killer?: { readonly participant: DuelParticipant; readonly stats: StatSheet };
}

interface LethalDamageOutcome {
  readonly victim: DuelParticipant;
  readonly killer: DuelParticipant | null;
  readonly log: LethalTriggerLog | null;
}

// §6.4 (M10 sub-sessão 8/N) — ÚNICO ponto por onde dano vira HP dentro do duelo. Existiam
// quatro (`golpe principal`, contra-ataque e as duas assistências); todos passam por aqui
// pra o gatilho de morte não depender de por qual caminho o dano veio.
// §4.1 `lifesteal` (M15 D1) — cura de quem BATE, como fração do dano EFETIVAMENTE aplicado a
// HP: um golpe de 5000 num alvo com 30 de vida vampiriza sobre 30, não sobre 5000. Nunca
// passa do HP máximo e o excesso é descartado (nada de escudo — sistema que a spec não
// descreve). Sem rolagem: vampirismo é consequência do dano, não uma segunda chance.
//
// Fica aqui, no ponto único por onde dano vira HP dentro do duelo, e não em cada chamador,
// exatamente pelo motivo que criou este helper em M10 8/N: golpe principal e contra-ataque
// passam pelos dois caminhos, e duplicar a regra garantiria divergência. Dano de assistência
// não vampiriza porque quem assiste não é participante do duelo — seu HP não existe aqui
// (mesma limitação declarada em M12 2/N; ver DECISIONS.md).
function applyLifesteal(killer: DuelParticipant, killerStats: StatSheet, damageAppliedToHp: number): DuelParticipant {
  if (damageAppliedToHp <= 0 || killerStats.lifesteal <= 0) return killer;
  const healed = applyHeal(killer.currentHp, killer.stats.hp, fpPct(damageAppliedToHp, killerStats.lifesteal));
  return healed === killer.currentHp ? killer : { ...killer, currentHp: healed };
}

function applyDamageWithLethalTrigger(input: LethalDamageInput): LethalDamageOutcome {
  const { seed, trocaNumber, damage, effectDefs } = input;
  const killerInput = input.killer;

  const wasAlive = input.victim.currentHp > 0;
  const hpAfterDamage = input.victim.currentHp - damage;
  const victim: DuelParticipant = { ...input.victim, currentHp: Math.max(0, hpAfterDamage) };

  // O dano que de fato chegou a HP: o golpe truncado no que a vítima ainda tinha.
  const damageAppliedToHp = wasAlive ? input.victim.currentHp - victim.currentHp : 0;
  const killer = killerInput
    ? applyLifesteal(killerInput.participant, killerInput.stats, damageAppliedToHp)
    : null;

  if (!wasAlive || hpAfterDamage > 0) return { victim, killer, log: null };

  const skill = findLethalTriggerSkill({
    knownSkills: victim.knownSkills,
    usedSkillIds: victim.lethalTriggersUsed,
    cooldowns: victim.cooldowns,
    requireSurvive: killerInput === undefined,
  });
  if (!skill) return { victim, killer, log: null };

  const used = [...(victim.lethalTriggersUsed ?? []), skill.id];

  if (isSurviveLethalSkill(skill)) {
    return {
      victim: { ...victim, currentHp: LETHAL_SURVIVE_HP, lethalTriggersUsed: used },
      killer,
      log: {
        unitId: victim.id,
        skillId: skill.id,
        survived: true,
        damageToKiller: null,
        effectsApplied: [],
        trocaNumber,
      },
    };
  }

  // Variante "efeito ao morrer": a morte acontece; a skill acerta quem deu o golpe fatal.
  // `findLethalTriggerSkill` já garante que há matador (requireSurvive), e todo caminho com
  // matador acontece dentro de uma troca — o TypeScript é que não sabe disso.
  if (!killerInput || trocaNumber === null) return { victim, killer, log: null };

  const deadVictim: DuelParticipant = { ...victim, lethalTriggersUsed: used };
  const victimStats = applyActiveEffectsToStats(victim.stats, victim.activeEffects, effectDefs);

  const hasDamageComponent = skill.multiplier > 0 || skill.flat > 0;
  let damageToKiller: number | null = null;
  // O matador já com o vampirismo do próprio golpe aplicado (`killer` não é nulo aqui: o
  // guard acima garante `killerInput`).
  let struckKiller = killer ?? killerInput.participant;

  if (hasDamageComponent) {
    const critRoll = rollPercent(rngRoll(seed, trocaNumber, victim.id, 'lethal-crit'));
    const variance = rollDamageVariance(rngRoll(seed, trocaNumber, victim.id, 'lethal-damage-variance'));
    damageToKiller = computeDamage({
      attackerAtk: victimStats.atk,
      attackerDef: victimStats.def,
      attackerHp: victimStats.hp,
      defenderDef: killerInput.stats.def,
      skill: { multiplier: skill.multiplier, flat: skill.flat, scalesWith: skill.scalesWith },
      attackerPen: victimStats.pen,
      typeDamageMultiplier: combinedTypeDamageMultiplier({
        attackerWeapon: victim.weaponType,
        defenderWeapon: killerInput.participant.weaponType,
        defenderUnitType: killerInput.participant.unitType,
        skillTags: skill.tags,
      }),
      positionalMultiplier: victim.positionalMultiplier,
      isCriticalHit: isCriticalHit(critRoll, victimStats.chc),
      criticalDamageMultiplier: victimStats.chd,
      // Mesma simplificação do contra-ataque: buffs de %dano/%redução não entram.
      damageDealtPctSum: 0,
      damageTakenReductionPctSum: 0,
      varianceRoll: variance,
    });
    // NÃO encadeia: se este dano matar o matador, o gatilho DELE não dispara. Chamar o
    // helper recursivamente aqui seria um laço sem fim entre duas unidades com o gatilho.
    struckKiller = { ...struckKiller, currentHp: Math.max(0, struckKiller.currentHp - damageToKiller) };
  }

  const applied = applyEffectApplications(
    seed,
    trocaNumber,
    deadVictim,
    victimStats,
    struckKiller,
    applyActiveEffectsToStats(struckKiller.stats, struckKiller.activeEffects, effectDefs),
    skill.effects,
    effectDefs,
    'lethal-effect-application',
  );

  return {
    victim: applied.actor,
    killer: applied.opponent,
    log: {
      unitId: victim.id,
      skillId: skill.id,
      survived: false,
      damageToKiller,
      effectsApplied: applied.appliedEffectIds,
      trocaNumber,
    },
  };
}

interface ExchangeOutcome {
  readonly actor: DuelParticipant;
  readonly opponent: DuelParticipant;
  readonly apSpent: Record<Id, number>;
  readonly ppSpentTroca: Record<Id, number>;
  readonly log: ActionLogEntry;
  // 0..2 por troca: o golpe principal e o contra-ataque são dois caminhos de dano letal.
  readonly lethalTriggers: readonly LethalTriggerLog[];
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
    lethalTriggers: [],
    log: {
      actorId: actor.id,
      targetId: opponent.id,
      decision: 'none',
      skillId: null,
      tacticsLineIndex: null,
      hit: null,
      isCrit: false,
      damage: 0,
      heal: 0,
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

  // §6.5.3 (M10 sub-sessão 7/N) — uma skill com a tag `heal` não bate: num 1v1 o único
  // alvo coerente é o próprio ator. Cai no mesmo ramo das skills sem dano (sem rolagem de
  // acerto: não há o que "errar" curando a si mesmo), só que aplicando a cura.
  const isHeal = isHealingSkill(skill);
  const isOffensive = !isHeal && (skill.multiplier > 0 || skill.flat > 0);
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

    const heal = isHeal
      ? computeHeal({
          healerStat: scalingStatOf(effectiveActorStats, skill.scalesWith),
          skill: { multiplier: skill.multiplier, flat: skill.flat },
          healerHeal: effectiveActorStats.heal,
        })
      : 0;
    const healedActor =
      heal > 0
        ? { ...applied.actor, currentHp: applyHeal(applied.actor.currentHp, applied.actor.stats.hp, heal) }
        : applied.actor;

    return {
      actor: healedActor,
      opponent: applied.opponent,
      apSpent: nextApSpent,
      ppSpentTroca: nextPpSpentTroca,
      lethalTriggers: [],
      log: {
        actorId: actor.id,
        targetId: opponent.id,
        decision: decision.kind,
        skillId: skill.id,
        tacticsLineIndex,
        hit: null,
        isCrit: false,
        damage: 0,
        heal,
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
      lethalTriggers: [],
      log: {
        actorId: actor.id,
        targetId: opponent.id,
        decision: decision.kind,
        skillId: skill.id,
        tacticsLineIndex,
        hit: false,
        isCrit: false,
        damage: 0,
        heal: 0,
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
  // §7.4 Duelista — "Contra-atacar custa 0 PP na primeira troca". O core não pode fixar o
  // id `skill-contra-atacar` (regra 4: conteúdo vive em packages/data), então a gratuidade
  // vale para a reação `onAttacked` da troca 1 — que, pela lista fechada de §6.4, são
  // exatamente as duas reações universais. Leitura registrada em DECISIONS.md.
  const duelistaFreeCounter = trocaNumber === 1 && hasSetSpecial(opponent, SET_SPECIAL_DUELISTA);
  const reactionDecision = opponentPpLocked
    ? ({ kind: 'none' } as const)
    : selectReaction({
        reactionScript: opponent.reactionScript,
        skills: opponent.knownSkills,
        trigger: 'onAttacked',
        economy: opponentEconomy,
        context: opponentContext,
        freePp: duelistaFreeCounter,
      });

  let extraReduction = 0;
  let counterSkill: SkillDef | null = null;
  let reactionLog: ActionLogEntry['reaction'] = null;

  if (reactionDecision.kind === 'reaction') {
    const reactionSkill = opponent.knownSkills[reactionDecision.skillId];
    const reactionPpCost = reactionSkill ? effectivePpCost(reactionSkill, duelistaFreeCounter) : 0;
    if (reactionSkill && canAffordPp(opponentEconomy, reactionPpCost)) {
      const spent = spendPp(opponentEconomy, reactionPpCost);
      opponent = { ...opponent, pp: spent.pools.pp };
      nextPpSpentTroca[opponent.id] = spent.ppSpentThisTroca;

      // §6.4 (M10 sub-sessão 7/N) — três classes de reação, nesta ordem: cura ("Cura de
      // emergência"), Defender (sem componente nenhum → -40% na troca), contra-ataque.
      // A cura vem primeiro porque uma skill de cura tem multiplier > 0 e cairia no ramo
      // de contra-ataque, virando dano.
      let reactionHeal: number | null = null;
      if (isHealingSkill(reactionSkill)) {
        reactionHeal = healReactor(reactionSkill, opponent, effectDefs);
        opponent = { ...opponent, currentHp: applyHeal(opponent.currentHp, opponent.stats.hp, reactionHeal) };
      } else if (reactionSkill.multiplier === 0 && reactionSkill.flat === 0) {
        extraReduction = DEFEND_DAMAGE_REDUCTION_PCT;
      } else {
        counterSkill = reactionSkill;
      }
      reactionLog = {
        skillId: reactionSkill.id,
        lineIndex: reactionDecision.lineIndex,
        counterDamage: null,
        healDone: reactionHeal,
        trigger: 'onAttacked',
      };
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

  // §6.4 — o dano principal passa pelo gatilho de morte: o oponente pode sobreviver com 1
  // HP, ou morrer e acertar o ator de volta.
  const lethalTriggers: LethalTriggerLog[] = [];
  const mainLethal = applyDamageWithLethalTrigger({
    seed,
    trocaNumber,
    victim: opponent,
    damage,
    effectDefs,
    killer: { participant: actor, stats: effectiveActorStats },
  });
  opponent = mainLethal.victim;
  if (mainLethal.killer) actor = mainLethal.killer;
  if (mainLethal.log) lethalTriggers.push(mainLethal.log);

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

  // §6.4 (M10, sub-sessão 5/N) — gatilhos posteriores ao golpe. `onAttacked` já foi
  // resolvido lá em cima (antes do dano, porque Defender precisa reduzir ESTA troca);
  // `onDamaged` e `onDebuffed` só fazem sentido DEPOIS que o dano entrou e os efeitos da
  // skill foram aplicados. Na prática no máximo um dos três chega a disparar: o teto de 1
  // PP por troca (§6.4, `canAffordPp`) faz o primeiro que passar consumir o recurso — a
  // ordem aqui é a ordem cronológica dos eventos, não uma prioridade arbitrária.
  function tryLateReaction(trigger: ReactionTrigger): void {
    if (reactionLog !== null || opponent.currentHp <= 0 || opponentPpLocked) return;

    const economy = economyOf(opponent, nextApSpent[opponent.id] ?? 0, nextPpSpentTroca[opponent.id] ?? 0);
    // Contexto reconstruído aqui (e não reaproveitado do onAttacked) porque o HP dos dois
    // lados e os efeitos ativos mudaram desde então — uma condition como `selfHpBelow`
    // precisa enxergar o estado pós-dano.
    const decision = selectReaction({
      reactionScript: opponent.reactionScript,
      skills: opponent.knownSkills,
      trigger,
      economy,
      context: buildContext(opponent, actor, actorRole !== 'attacker', trocaNumber, engagement, effectDefs),
    });
    if (decision.kind !== 'reaction') return;

    const skillDef = opponent.knownSkills[decision.skillId];
    if (!skillDef || !canAffordPp(economy, skillDef.ppCost ?? 0)) return;

    const spent = spendPp(economy, skillDef.ppCost ?? 0);
    opponent = { ...opponent, pp: spent.pools.pp };
    nextPpSpentTroca[opponent.id] = spent.ppSpentThisTroca;

    // Diferente de `onAttacked`, aqui não há dano a reduzir — o golpe já entrou. Uma
    // reação sem componente de dano gasta o PP e não faz mais nada (o `-40%` de Defender
    // é específico de `onAttacked`, §6.4). Cura, porém, funciona igual nos três gatilhos:
    // reagir a ter levado dano curando-se é justamente o caso de "Cura de emergência".
    let reactionHeal: number | null = null;
    if (isHealingSkill(skillDef)) {
      reactionHeal = healReactor(skillDef, opponent, effectDefs);
      opponent = { ...opponent, currentHp: applyHeal(opponent.currentHp, opponent.stats.hp, reactionHeal) };
    } else if (skillDef.multiplier > 0 || skillDef.flat > 0) {
      counterSkill = skillDef;
    }
    reactionLog = {
      skillId: skillDef.id,
      lineIndex: decision.lineIndex,
      counterDamage: null,
      healDone: reactionHeal,
      trigger,
    };
  }

  if (damage > 0) tryLateReaction('onDamaged');
  if (effectApplicationResult.debuffedOpponent) tryLateReaction('onDebuffed');

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

    // §6.4 — o contra-ataque também pode ser o golpe fatal, e o gatilho vale igual.
    const counterLethal = applyDamageWithLethalTrigger({
      seed,
      trocaNumber,
      victim: actor,
      damage: counterDamage,
      effectDefs,
      killer: { participant: opponent, stats: effectiveOpponentStats },
    });
    actor = counterLethal.victim;
    if (counterLethal.killer) opponent = counterLethal.killer;
    if (counterLethal.log) lethalTriggers.push(counterLethal.log);
    reactionLog = reactionLog && { ...reactionLog, counterDamage };
  }

  return {
    actor,
    opponent,
    apSpent: nextApSpent,
    ppSpentTroca: nextPpSpentTroca,
    lethalTriggers,
    log: {
      actorId: actor.id,
      targetId: opponent.id,
      decision: decision.kind,
      skillId: skill.id,
      tacticsLineIndex,
      hit: true,
      isCrit,
      damage,
      heal: 0, // ação ofensiva: cura do ator só existe no ramo da tag `heal`, acima
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
  const lethalTriggers: LethalTriggerLog[] = [];
  // §6.4 (M10 sub-sessão 8/N) — morte por dano de assistência: quem matou não é
  // participante do duelo, então só a variante `survive` do gatilho tem o que fazer.
  const defenderAssistLethal = applyDamageWithLethalTrigger({
    seed,
    trocaNumber: null,
    victim: defender,
    damage: attackerAssistOutcome.totalDamage,
    effectDefs,
  });
  defender = defenderAssistLethal.victim;
  if (defenderAssistLethal.log) lethalTriggers.push(defenderAssistLethal.log);
  // §6.5.3 (M10 sub-sessão 7/N) — assistência de cura mira o ALIADO duelista, não o inimigo:
  // quem o aliado do atacante socorre é o atacante.
  attacker = { ...attacker, currentHp: applyHeal(attacker.currentHp, attacker.stats.hp, attackerAssistOutcome.totalHeal) };

  const defenderAssistDecisions = resolveAssists(input.defenderAssistCandidates ?? []);
  const defenderAssistOutcome = applyAssistDamage({
    seed,
    sideLabel: 'defender-assist',
    results: defenderAssistDecisions,
    candidates: input.defenderAssistCandidates ?? [],
    target: { stats: attacker.stats, unitType: attacker.unitType, weaponType: attacker.weaponType, activeEffects: attacker.activeEffects },
    effectDefs,
  });
  const attackerAssistLethal = applyDamageWithLethalTrigger({
    seed,
    trocaNumber: null,
    victim: attacker,
    damage: defenderAssistOutcome.totalDamage,
    effectDefs,
  });
  attacker = attackerAssistLethal.victim;
  if (attackerAssistLethal.log) lethalTriggers.push(attackerAssistLethal.log);
  defender = { ...defender, currentHp: applyHeal(defender.currentHp, defender.stats.hp, defenderAssistOutcome.totalHeal) };

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
      lethalTriggers.push(...outcome.lethalTriggers);
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
    lethalTriggers,
    finalLethalTriggersUsedAttacker: persistentLethalTriggersUsed(
      attacker.lethalTriggersUsed ?? [],
      attacker.knownSkills,
    ),
    finalLethalTriggersUsedDefender: persistentLethalTriggersUsed(
      defender.lethalTriggersUsed ?? [],
      defender.knownSkills,
    ),
  };
}
