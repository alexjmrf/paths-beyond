import { fpMul } from '../math/fixed.js';
import { rngFor } from '../rng/rngFor.js';
import { nextUint32 } from '../rng/xoshiro128.js';
import type { Id } from '../types.js';
import type { SkillDef } from '../skills/types.js';
import type { UnitType, WeaponType } from '../tactics/types.js';
import type { ConditionContext } from '../tactics/types.js';
import { computeDamage, isCriticalHit, rollDamageVariance } from './damage.js';
import {
  applyActiveEffectsToStats,
  sumDamageDealtPct,
  sumDamageTakenReductionPct,
} from './effects.js';
import type { DuelEconomyState } from './economy.js';
import { selectReaction } from './reactions.js';
import { combinedTypeDamageMultiplier } from './triangle.js';
import type { ActiveEffect, EffectDef } from './types.js';
import type { ReactionLine } from './types.js';
import type { StatSheet } from '../stats/types.js';

// §6.5 — máximo de 2 assistências por lado, por duelo.
const MAX_ASSISTS_PER_SIDE = 2;

// §6.5.3 — dano de assistência é 50% do dano da skill; cura/buff aplicam integral
// (essa distinção é decidida por quem resolve o efeito, não aqui).
export const ASSIST_DAMAGE_MULTIPLIER = 500;

export interface AssistCandidate {
  readonly id: Id;
  readonly reactionScript: readonly ReactionLine[];
  readonly skills: Readonly<Record<Id, SkillDef>>;
  readonly economy: DuelEconomyState;
  readonly context: ConditionContext; // self = o aliado; target = o inimigo do duelo
  // §6.5.3 (M10) — necessário pra computar o dano de 50% quando a assistência é ofensiva.
  readonly stats: StatSheet;
  readonly unitType: UnitType;
  readonly weaponType: WeaponType;
  readonly activeEffects: readonly ActiveEffect[];
  // §7.4 Sentinela (M10 sub-sessão 6/N) — este candidato tem a janela de assistência
  // gratuita do round disponível. Quem sabe disso é a camada de batalha (o escopo é o
  // round de mapa, não o duelo), então chega aqui já resolvido.
  readonly freePp?: boolean;
}

export interface AssistResult {
  readonly assistantId: Id;
  readonly skillId: Id;
  // Ecoa de volta se ESTA assistência saiu de graça — a camada de batalha precisa saber
  // pra não debitar PP e pra marcar a janela do round como consumida.
  readonly freePp: boolean;
}

// Candidatos já vêm filtrados por alcance e ordenados por iniciativa (grid é M3) —
// aqui só decide, por ordem de prioridade, quem realmente assiste, até o teto de 2.
export function resolveAssists(candidates: readonly AssistCandidate[]): readonly AssistResult[] {
  const results: AssistResult[] = [];

  for (const candidate of candidates) {
    if (results.length >= MAX_ASSISTS_PER_SIDE) break;

    const decision = selectReaction({
      reactionScript: candidate.reactionScript,
      skills: candidate.skills,
      trigger: 'onAllyEngagedNearby',
      economy: candidate.economy,
      context: candidate.context,
      freePp: candidate.freePp,
    });

    if (decision.kind === 'reaction') {
      // A janela do round só é consumida se ela de fato pagou alguma coisa: uma
      // assistência que já custava 0 PP não gasta a gratuidade de Sentinela.
      const ppCost = candidate.skills[decision.skillId]?.ppCost ?? 0;
      results.push({
        assistantId: candidate.id,
        skillId: decision.skillId,
        freePp: candidate.freePp === true && ppCost > 0,
      });
    }
  }

  return results;
}

function rngRoll(seed: number, unitId: Id, purpose: string): number {
  return nextUint32(rngFor(seed, 0, unitId, purpose)).value;
}

function rollPercent(rngValue: number): number {
  return rngValue % 1000;
}

export interface AppliedAssistResult extends AssistResult {
  readonly damageDealt: number;
}

export interface AssistDamageTarget {
  readonly stats: StatSheet;
  readonly unitType: UnitType;
  readonly weaponType: WeaponType;
  readonly activeEffects: readonly ActiveEffect[];
}

export interface ApplyAssistDamageInput {
  readonly seed: number;
  // Chave de rng (purpose) — distingue os streams do lado atacante e do lado defensor,
  // e de qualquer outro `purpose` usado dentro do mesmo duelo (regra de core: nenhuma
  // rolagem nova pode deslocar as de outro sistema).
  readonly sideLabel: string;
  readonly results: readonly AssistResult[];
  readonly candidates: readonly AssistCandidate[];
  readonly target: AssistDamageTarget;
  readonly effectDefs: Readonly<Record<Id, EffectDef>>;
}

export interface ApplyAssistDamageOutcome {
  readonly totalDamage: number;
  readonly results: readonly AppliedAssistResult[];
}

// §6.5.3 — "dano de assistência é 50% do dano da skill". Reusa a mesma matemática de
// computeDamage (§6.6), com posicional neutro (o assistente não tem posição própria
// resolvida no duelo — simplificação documentada em DECISIONS.md) e SEM rolagem de
// acerto própria (mesma convenção já adotada para contra-ataques em resolveDuel.ts:
// "Contra-ataques sempre acertam"). Corte explícito: assistências que não causam dano
// (heal/buff, tag 'heal' ou skill.effects) contribuem 0 aqui — a mecânica de cura ainda
// não existe no motor (nenhuma fórmula normativa pra §4.1 "Cura dada/recebida") e
// skill.effects de assistência continua fora de escopo (mesmo corte de reação/M10
// sub-sessão 1).
export function applyAssistDamage(input: ApplyAssistDamageInput): ApplyAssistDamageOutcome {
  const targetEffectiveStats = applyActiveEffectsToStats(input.target.stats, input.target.activeEffects, input.effectDefs);
  const damageTakenReductionPctSum = sumDamageTakenReductionPct(input.target.activeEffects, input.effectDefs);

  const results: AppliedAssistResult[] = [];
  let totalDamage = 0;

  for (const result of input.results) {
    const candidate = input.candidates.find((c) => c.id === result.assistantId);
    const skill = candidate?.skills[result.skillId];
    if (!candidate || !skill) {
      results.push({ ...result, damageDealt: 0 });
      continue;
    }

    const isOffensive = skill.multiplier > 0 || skill.flat > 0;
    if (!isOffensive) {
      results.push({ ...result, damageDealt: 0 });
      continue;
    }

    const assistantEffectiveStats = applyActiveEffectsToStats(candidate.stats, candidate.activeEffects, input.effectDefs);
    const triangleDamageMultiplier = combinedTypeDamageMultiplier({
      attackerWeapon: candidate.weaponType,
      defenderWeapon: input.target.weaponType,
      defenderUnitType: input.target.unitType,
      skillTags: skill.tags,
    });

    const critRoll = rollPercent(rngRoll(input.seed, candidate.id, `${input.sideLabel}:crit`));
    const isCrit = isCriticalHit(critRoll, assistantEffectiveStats.chc);
    const varianceRoll = rollDamageVariance(rngRoll(input.seed, candidate.id, `${input.sideLabel}:damage-variance`));

    const rawDamage = computeDamage({
      attackerAtk: assistantEffectiveStats.atk,
      attackerDef: assistantEffectiveStats.def,
      attackerHp: assistantEffectiveStats.hp,
      defenderDef: targetEffectiveStats.def,
      skill: { multiplier: skill.multiplier, flat: skill.flat, scalesWith: skill.scalesWith },
      attackerPen: assistantEffectiveStats.pen,
      typeDamageMultiplier: triangleDamageMultiplier,
      positionalMultiplier: 1000,
      isCriticalHit: isCrit,
      criticalDamageMultiplier: assistantEffectiveStats.chd,
      damageDealtPctSum: sumDamageDealtPct(candidate.activeEffects, input.effectDefs),
      damageTakenReductionPctSum,
      varianceRoll,
    });

    const damageDealt = Math.max(1, fpMul(rawDamage, ASSIST_DAMAGE_MULTIPLIER));
    results.push({ ...result, damageDealt });
    totalDamage += damageDealt;
  }

  return { totalDamage, results };
}
