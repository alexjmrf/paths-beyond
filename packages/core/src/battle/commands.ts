import { fpDiv } from '../math/fixed.js';
import { rngFor } from '../rng/rngFor.js';
import { nextUint32 } from '../rng/xoshiro128.js';
import type { Id } from '../types.js';
import { manhattanDistance, tileAt, type Coord, type Terrain } from '../grid/types.js';
import { validatePath } from '../grid/pathfinding.js';
import type { ConditionUnitView } from '../tactics/types.js';
import { FP_SCALE } from '../math/fixed.js';
import { canAffordAp, spendAp, type DuelEconomyState } from '../duel/economy.js';
import { resolveDuel, type DuelResult } from '../duel/resolveDuel.js';
import { computeDamage, rollDamageVariance } from '../duel/damage.js';
import { combinedTypeDamageMultiplier } from '../duel/triangle.js';
import { applyHeal, computeHeal, isHealingSkill, scalingStatOf } from '../duel/heal.js';
import {
  applyActiveEffectsToStats,
  sumDamageDealtPct,
  sumDamageTakenReductionPct,
  upsertActiveEffect,
} from '../duel/effects.js';
import { unitsInArea } from './area.js';
import { resolveValorSkill } from './valor.js';
import type { AssistCandidate, AssistResult } from '../duel/assist.js';
import { effectivePpCost } from '../duel/reactions.js';
import { SET_SPECIAL_RESERVA, SET_SPECIAL_SENTINELA } from '../items/sets.js';
import type { DuelEngagementContext, DuelParticipant, EffectDef } from '../duel/types.js';
import { computePositionalModifiers } from './positional.js';
import type { BattleCommand, BattleState, BattleUnit, Side } from './types.js';

export interface CommandOutcome {
  readonly state: BattleState;
  readonly applied: boolean;
  readonly reason?: string;
  readonly duelResult?: DuelResult;
}

function findUnit(state: BattleState, unitId: Id): BattleUnit | undefined {
  return state.units.find((u) => u.unitId === unitId);
}

function replaceUnit(state: BattleState, unitId: Id, patch: Partial<BattleUnit>): BattleState {
  return { ...state, units: state.units.map((u) => (u.unitId === unitId ? { ...u, ...patch } : u)) };
}

function rejected(state: BattleState, reason: string): CommandOutcome {
  return { state, applied: false, reason };
}

function accepted(state: BattleState, duelResult?: DuelResult): CommandOutcome {
  return { state, applied: true, duelResult };
}

function coordsEqual(a: Coord, b: Coord): boolean {
  return a.x === b.x && a.y === b.y;
}

function canAct(unit: BattleUnit | undefined): unit is BattleUnit {
  return unit !== undefined && unit.hp > 0 && !unit.hasActedThisRound;
}

// §5.2 — "O caminho vem inteiro no comando move e é revalidado pelo simulador."
function applyMove(state: BattleState, cmd: Extract<BattleCommand, { t: 'move' }>): CommandOutcome {
  const unit = findUnit(state, cmd.unitId);
  if (!canAct(unit)) return rejected(state, 'unidade inexistente, morta ou já agiu neste round');
  if (cmd.path.length === 0 || !coordsEqual(cmd.path[0] as Coord, unit.pos)) {
    return rejected(state, 'caminho não começa na posição atual da unidade');
  }

  const allies = state.units.filter((u) => u.side === unit.side && u.unitId !== unit.unitId && u.hp > 0).map((u) => u.pos);
  const enemies = state.units.filter((u) => u.side !== unit.side && u.hp > 0).map((u) => u.pos);
  const remainingRange = unit.moveRange - (state.distanceMovedThisTurn[unit.unitId] ?? 0);

  const validation = validatePath(
    { map: state.map, moveType: unit.moveType, occupiedByAlly: allies, occupiedByEnemy: enemies },
    cmd.path,
    remainingRange,
  );
  if (!validation.valid) return rejected(state, validation.reason ?? 'caminho inválido');

  const destination = cmd.path[cmd.path.length - 1] as Coord;
  const destTile = tileAt(state.map, destination);
  if (!destTile) return rejected(state, 'destino fora do mapa');

  const nextDistance = {
    ...state.distanceMovedThisTurn,
    [unit.unitId]: (state.distanceMovedThisTurn[unit.unitId] ?? 0) + validation.cost,
  };
  return accepted(
    replaceUnit({ ...state, distanceMovedThisTurn: nextDistance }, unit.unitId, {
      pos: destination,
      height: destTile.height,
    }),
  );
}

// §5.4 — "não pode ter movido mais que metade do alcance. Recupera +1 AP e +1 PP."
// §7.4 Reserva — "`rest` recupera +2 AP": o set substitui o +1 de §5.4 por 2 no total (não
// soma 2 em cima do 1). O PP não é citado pelo set e continua em +1. Leitura registrada em
// DECISIONS.md. A pré-condição de movimento não muda — o set toca no ganho, não no gate.
const REST_AP_GAIN = 1;
const REST_AP_GAIN_RESERVA = 2;

function applyRest(state: BattleState, cmd: Extract<BattleCommand, { t: 'rest' }>): CommandOutcome {
  const unit = findUnit(state, cmd.unitId);
  if (!canAct(unit)) return rejected(state, 'unidade inexistente, morta ou já agiu neste round');

  const halfRange = unit.moveRange >> 1; // divisão inteira por 2 sem operador `/` cru (regra 2)
  const moved = state.distanceMovedThisTurn[unit.unitId] ?? 0;
  if (moved > halfRange) return rejected(state, 'rest exige não ter andado mais que metade do moveRange');

  const apGain = unit.setSpecialEffectIds?.includes(SET_SPECIAL_RESERVA) ? REST_AP_GAIN_RESERVA : REST_AP_GAIN;
  return accepted(replaceUnit(state, unit.unitId, { ap: unit.ap + apGain, pp: unit.pp + 1, hasActedThisRound: true }));
}

// §5.4 — "Encerra o turno. Se terminar sobre fort ou camp: +1 AP."
function applyWait(state: BattleState, cmd: Extract<BattleCommand, { t: 'wait' }>): CommandOutcome {
  const unit = findUnit(state, cmd.unitId);
  if (!canAct(unit)) return rejected(state, 'unidade inexistente, morta ou já agiu neste round');

  const tile = tileAt(state.map, unit.pos);
  const bonusAp = tile?.object === 'fort' || tile?.object === 'camp' ? 1 : 0;
  return accepted(replaceUnit(state, unit.unitId, { ap: unit.ap + bonusAp, hasActedThisRound: true }));
}

// §5.4 (M11, sub-sessão 2/N) — "cura em área, artilharia, buff de zona". Quem a área
// atinge é DERIVADO do que a skill faz, sem campo novo (decisão do usuário, ver
// DECISIONS.md): tag `heal` cura os aliados no raio, dano acerta os inimigos, e cada
// `skill.effects` escolhe o lado pelo `EffectDef.kind` que já existe. O
// `EffectApplication.target` ganha a leitura natural: 'self' = só o lançador (comportamento
// de M3, preservado byte a byte, inclusive o stream de RNG), 'target' = a área.
function applyMapSkill(state: BattleState, cmd: Extract<BattleCommand, { t: 'mapSkill' }>): CommandOutcome {
  const unit = findUnit(state, cmd.unitId);
  if (!canAct(unit)) return rejected(state, 'unidade inexistente, morta ou já agiu neste round');

  const skill = unit.knownSkills[cmd.skillId];
  if (!skill || skill.kind !== 'map') return rejected(state, 'skill de mapa desconhecida');

  // §5.4 — alcance de lançamento: `skill.duelRange` quando declarado, senão o da unidade
  // (mesma herança que a skill de duelo já segue). Sem isto o `target` do comando seria
  // ignorado e artilharia acertaria o mapa inteiro do próprio spawn.
  const castRange = skill.duelRange ?? unit.duelRange;
  if (manhattanDistance(unit.pos, cmd.target) > castRange) {
    return rejected(state, 'alvo fora do alcance de lançamento da skill');
  }

  const economy: DuelEconomyState = { pools: { ap: unit.ap, pp: unit.pp }, apSpentThisDuel: 0, ppSpentThisTroca: 0 };
  if (!canAffordAp(economy, skill.apCost)) return rejected(state, 'AP insuficiente');
  const spent = spendAp(economy, skill.apCost);

  const casterStats = applyActiveEffectsToStats(unit.stats, unit.effects, state.effectDefs);
  const targets = unitsInArea(state, cmd.target, skill.areaRadius ?? 0);
  const isHeal = isHealingSkill(skill);
  const hasDamage = !isHeal && (skill.multiplier > 0 || skill.flat > 0);

  // §6.6 sem os passos 7 (crítico) e sem rolagem de acerto, e com posicional neutro
  // (flanco/cerco/altura são modificadores de `engage`, não existem fora do duelo).
  // Decisão do usuário registrada em DECISIONS.md.
  const damageFor = (target: BattleUnit): number => {
    const targetStats = applyActiveEffectsToStats(target.stats, target.effects, state.effectDefs);
    return computeDamage({
      attackerAtk: casterStats.atk,
      attackerDef: casterStats.def,
      attackerHp: casterStats.hp,
      defenderDef: targetStats.def,
      skill: { multiplier: skill.multiplier, flat: skill.flat, scalesWith: skill.scalesWith },
      attackerPen: casterStats.pen,
      typeDamageMultiplier: combinedTypeDamageMultiplier({
        attackerWeapon: unit.weaponType,
        defenderWeapon: target.weaponType,
        defenderUnitType: target.unitType,
        skillTags: skill.tags,
      }),
      positionalMultiplier: FP_SCALE,
      isCriticalHit: false,
      criticalDamageMultiplier: casterStats.chd,
      damageDealtPctSum: sumDamageDealtPct(unit.effects, state.effectDefs),
      damageTakenReductionPctSum: sumDamageTakenReductionPct(target.effects, state.effectDefs),
      // Stream por ALVO: dois inimigos idênticos na mesma área não podem dividir a mesma
      // rolagem (seria a mesma variância sempre).
      varianceRoll: rollDamageVariance(
        nextUint32(rngFor(state.seed, state.round, unit.unitId, `mapskill-variance:${target.unitId}`)).value,
      ),
    });
  };

  // Cura é determinística desde M10 (sub-sessão 7/N): mesmo valor para todos os alvos.
  const healAmount = isHeal
    ? computeHeal({
        healerStat: scalingStatOf(casterStats, skill.scalesWith),
        skill: { multiplier: skill.multiplier, flat: skill.flat },
        healerHeal: casterStats.heal,
      })
    : 0;

  const targetIds = new Set(targets.map((t) => t.unitId));
  const nextUnits = state.units.map((u) => {
    const isCaster = u.unitId === unit.unitId;
    const inArea = targetIds.has(u.unitId);
    const isAlly = u.side === unit.side;

    let hp = u.hp;
    if (inArea && hasDamage && !isAlly) hp = Math.max(0, hp - damageFor(u));
    if (inArea && isHeal && isAlly) hp = applyHeal(hp, u.stats.hp, healAmount);

    let effects = u.effects;
    for (const application of skill.effects) {
      const def = state.effectDefs[application.effectId];
      if (!def) continue;

      // 'self' = só o lançador; 'target' = a área, e o lado sai do `kind` do efeito.
      const applies =
        application.target === 'self'
          ? isCaster
          : inArea && (def.kind === 'buff' ? isAlly : !isAlly);
      if (!applies) continue;

      // O stream de 'self' é o de M3, intocado; o de área é próprio e por alvo.
      const purpose =
        application.target === 'self'
          ? `mapskill:${application.effectId}`
          : `mapskill-area:${application.effectId}:${u.unitId}`;
      const roll = nextUint32(rngFor(state.seed, state.round, unit.unitId, purpose)).value % 1000;
      if (roll >= application.chance) continue;

      effects = upsertActiveEffect(effects, def, application);
    }

    if (!isCaster) return hp === u.hp && effects === u.effects ? u : { ...u, hp, effects };
    return { ...u, hp, effects, ap: spent.pools.ap, pp: spent.pools.pp, hasActedThisRound: true };
  });

  return accepted({ ...state, units: nextUnits });
}

// §5.6 (M11, sub-sessão 3/N) — Valor é recurso de exército: usar uma skill **não consome
// turno de nenhuma unidade** e não tem outro limite além do saldo (a spec não dá nenhum).
// Até M10 este comando ignorava o `skillId` e debitava um custo fixo de 1 sem aplicar
// efeito nenhum; agora resolve de verdade contra o catálogo (`valor.ts`).
function applyUseValor(state: BattleState, cmd: Extract<BattleCommand, { t: 'useValor' }>): CommandOutcome {
  const skill = state.valorSkills?.[cmd.skillId];
  if (!skill) return rejected(state, 'skill de valor desconhecida');
  if (state.valor < skill.cost) return rejected(state, 'valor insuficiente');

  const resolution = resolveValorSkill(state, skill, cmd.target);
  // Nada é cobrado quando a resolução falha: um `summonReinforcement` (ainda sem
  // implementação) ou um alvo inválido não podem consumir Valor em silêncio.
  if (!resolution.ok) return rejected(state, resolution.reason);

  return accepted({ ...state, units: resolution.units, valor: state.valor - skill.cost });
}

function terrainAt(state: BattleState, pos: Coord): Terrain | undefined {
  const tile = tileAt(state.map, pos);
  if (!tile) return undefined;
  return state.map.terrains[tile.terrain];
}

function toConditionView(unit: BattleUnit, effectDefs: Readonly<Record<Id, EffectDef>>): ConditionUnitView {
  const maxHp = unit.stats.hp;
  const currentHpPct = maxHp > 0 ? fpDiv(unit.hp, maxHp) : 0;
  const activeBuffIds: Id[] = [];
  const activeDebuffIds: Id[] = [];
  for (const active of unit.effects) {
    const def = effectDefs[active.id];
    if (!def) continue;
    (def.kind === 'buff' ? activeBuffIds : activeDebuffIds).push(active.id);
  }
  return {
    currentHpPct,
    ap: unit.ap,
    pp: unit.pp,
    unitType: unit.unitType,
    weaponType: unit.weaponType,
    activeBuffIds,
    activeDebuffIds,
  };
}

function toDuelParticipant(unit: BattleUnit, positionalMultiplier: number, criticalDamageBonus: number): DuelParticipant {
  return {
    id: unit.unitId,
    stats: { ...unit.stats, chd: unit.stats.chd + criticalDamageBonus },
    currentHp: unit.hp,
    ap: unit.ap,
    pp: unit.pp,
    unitType: unit.unitType,
    weaponType: unit.weaponType,
    duelRange: unit.duelRange,
    tacticsScript: unit.tacticsScript,
    reactionScript: unit.reactionScript,
    knownSkills: unit.knownSkills,
    cooldowns: unit.cooldowns,
    activeEffects: unit.effects,
    positionalMultiplier,
    setSpecialEffectIds: unit.setSpecialEffectIds,
    lethalTriggersUsed: unit.lethalTriggersUsed,
  };
}

// §6.5 — candidatos já filtrados por alcance e ordenados pela iniciativa fixa da
// batalha (a mesma ordem calculada 1x em initiative.ts, nunca recalculada).
function buildAssistCandidates(
  state: BattleState,
  side: Side,
  excludeUnitId: Id,
  opponentPos: Coord,
  opponentView: ConditionUnitView,
  isAttackerSide: boolean,
): AssistCandidate[] {
  const orderIndex = new Map(state.initiativeOrder.map((entry, index) => [entry.unitId, index]));
  const allies = state.units
    .filter((u) => u.side === side && u.unitId !== excludeUnitId && u.hp > 0)
    .filter((u) => manhattanDistance(u.pos, opponentPos) <= u.assistRange)
    .sort((a, b) => (orderIndex.get(a.unitId) ?? Infinity) - (orderIndex.get(b.unitId) ?? Infinity));

  return allies.map((ally): AssistCandidate => ({
    id: ally.unitId,
    reactionScript: ally.reactionScript,
    skills: ally.knownSkills,
    economy: { pools: { ap: ally.ap, pp: ally.pp }, apSpentThisDuel: 0, ppSpentThisTroca: 0 },
    // §7.4 Sentinela — janela gratuita ainda não usada NESTE round de mapa.
    freePp:
      ally.setSpecialEffectIds?.includes(SET_SPECIAL_SENTINELA) === true &&
      !state.freeAssistUsedThisRound.includes(ally.unitId),
    context: {
      self: toConditionView(ally, state.effectDefs),
      target: opponentView,
      isSelfAttacker: isAttackerSide,
      hasPositionalBonus: false,
      trocaNumber: 1,
      battleRound: state.round,
      alliesAdjacentCount: 0,
    },
    // §6.5.3 (M10) — necessário pra computar o dano de 50% quando a assistência é ofensiva.
    stats: ally.stats,
    unitType: ally.unitType,
    weaponType: ally.weaponType,
    activeEffects: ally.effects,
  }));
}

function spendAssistPp(units: readonly BattleUnit[], results: readonly AssistResult[]): readonly BattleUnit[] {
  let next = units;
  for (const result of results) {
    const assistant = next.find((u) => u.unitId === result.assistantId);
    const skill = assistant?.knownSkills[result.skillId];
    if (!assistant || !skill) continue;
    // §7.4 Sentinela — a assistência gratuita do round não debita nada.
    const cost = effectivePpCost(skill, result.freePp);
    next = next.map((u) => (u.unitId === assistant.unitId ? { ...u, pp: u.pp - cost } : u));
  }
  return next;
}

// §7.4 Sentinela — quem de fato consumiu a janela gratuita neste duelo. Vai para
// BattleState.freeAssistUsedThisRound, que endRound zera na virada do round.
function freeAssistantIds(...groups: readonly (readonly AssistResult[])[]): readonly Id[] {
  const ids: Id[] = [];
  for (const group of groups) {
    for (const result of group) {
      if (result.freePp && !ids.includes(result.assistantId)) ids.push(result.assistantId);
    }
  }
  return ids;
}

// §6.4 (M10 sub-sessão 8/N) — só escreve `lethalTriggersUsed` quando há o que escrever:
// gravar lista vazia em toda unidade que duela mudaria o estado serializado (e o hash de
// replay) sem nenhuma mudança de regra por trás.
function lethalTriggersPatch(unit: BattleUnit, used: readonly Id[]): Partial<BattleUnit> {
  if (used.length === 0 && unit.lethalTriggersUsed === undefined) return {};
  return { lethalTriggersUsed: used };
}

// §5.4 + §6 — abre um duelo de verdade via resolveDuel (M2), com modificadores
// posicionais (§5.5) e assistências (§6.5) resolvidos a partir do estado real do mapa.
function applyEngage(state: BattleState, cmd: Extract<BattleCommand, { t: 'engage' }>): CommandOutcome {
  const attacker = findUnit(state, cmd.unitId);
  const defender = findUnit(state, cmd.targetId);
  if (!attacker || attacker.hp <= 0) return rejected(state, 'atacante inválido');
  if (!defender || defender.hp <= 0) return rejected(state, 'alvo inválido');
  if (attacker.hasActedThisRound) return rejected(state, 'atacante já agiu neste round');
  if (attacker.side === defender.side) return rejected(state, 'não é possível engajar um aliado');

  const distance = manhattanDistance(attacker.pos, defender.pos);
  if (distance > attacker.duelRange) return rejected(state, 'alvo fora do alcance de duelo do atacante');

  const attackerAllyPositions = state.units
    .filter((u) => u.side === attacker.side && u.unitId !== attacker.unitId && u.hp > 0)
    .map((u) => u.pos);
  const defenderTerrain = terrainAt(state, defender.pos);

  const positional = computePositionalModifiers({
    defenderPos: defender.pos,
    attackerAllyPositions,
    attackerHeight: attacker.height,
    defenderHeight: defender.height,
    defenderTerrainDefBonus: defenderTerrain?.defBonus ?? 0,
    defenderTerrainEvaBonus: defenderTerrain?.evaBonus ?? 0,
    defenderPp: defender.pp,
  });

  const attackerParticipant = toDuelParticipant(attacker, positional.damageMultiplier, positional.criticalDamageBonus);
  const defenderParticipant = toDuelParticipant(defender, 1000, 0);

  const attackerView = toConditionView(attacker, state.effectDefs);
  const defenderView = toConditionView(defender, state.effectDefs);

  const attackerAssistCandidates = buildAssistCandidates(
    state,
    attacker.side,
    attacker.unitId,
    defender.pos,
    defenderView,
    true,
  );
  const defenderAssistCandidates = buildAssistCandidates(
    state,
    defender.side,
    defender.unitId,
    attacker.pos,
    attackerView,
    false,
  );

  const engagement: DuelEngagementContext = {
    engagementDistance: distance,
    terrainAccuracyModifier: 0,
    heightAccuracyModifier: positional.accuracyModifier,
    defenderEvasionModifier: positional.defenderEvasionModifier,
    battleRound: state.round,
  };

  const duelResult = resolveDuel({
    seed: state.seed,
    attacker: attackerParticipant,
    defender: defenderParticipant,
    effectDefs: state.effectDefs,
    engagement,
    attackerAssistCandidates,
    defenderAssistCandidates,
    ppLockedForTroca1: positional.ppLockedForTroca1 ? [defender.unitId] : [],
  });

  let nextUnits: readonly BattleUnit[] = state.units.map((u) => {
    if (u.unitId === attacker.unitId) {
      return {
        ...u,
        hp: duelResult.finalHpAttacker,
        ap: duelResult.finalApAttacker,
        pp: duelResult.finalPpAttacker,
        // §8.3/§6.9 (M10) — skill.effects aplicado dentro do duelo (resolveDuel.ts)
        // precisa persistir de volta no mapa, senão evapora ao sincronizar com o
        // BattleUnit (mesmo padrão de hp/ap/pp acima).
        effects: duelResult.finalActiveEffectsAttacker,
        // §6.4 (M10 sub-sessão 8/N) — gatilho de morte `perBattle` gasto no duelo precisa
        // sobreviver ao duelo, senão "uma vez por batalha" recarregaria a cada engajamento.
        ...lethalTriggersPatch(u, duelResult.finalLethalTriggersUsedAttacker),
        hasActedThisRound: true,
      };
    }
    if (u.unitId === defender.unitId) {
      // §5.4 — ser engajado NÃO consome o turno do defensor no mapa.
      return {
        ...u,
        hp: duelResult.finalHpDefender,
        ap: duelResult.finalApDefender,
        pp: duelResult.finalPpDefender,
        effects: duelResult.finalActiveEffectsDefender,
        ...lethalTriggersPatch(u, duelResult.finalLethalTriggersUsedDefender),
      };
    }
    return u;
  });

  // resolveDuel decide QUEM assistiu, mas não devolve os pools atualizados dos
  // assistentes (eles não são `attacker`/`defender` do duelo) — a camada de batalha
  // aplica o gasto de PP de volta.
  nextUnits = spendAssistPp(nextUnits, duelResult.attackerAssists);
  nextUnits = spendAssistPp(nextUnits, duelResult.defenderAssists);

  const usedFreeAssist = freeAssistantIds(duelResult.attackerAssists, duelResult.defenderAssists);
  const freeAssistUsedThisRound =
    usedFreeAssist.length > 0 ? [...state.freeAssistUsedThisRound, ...usedFreeAssist] : state.freeAssistUsedThisRound;

  return accepted({ ...state, units: nextUnits, freeAssistUsedThisRound }, duelResult);
}

export function applyCommand(state: BattleState, command: BattleCommand): CommandOutcome {
  switch (command.t) {
    case 'move':
      return applyMove(state, command);
    case 'rest':
      return applyRest(state, command);
    case 'wait':
      return applyWait(state, command);
    case 'mapSkill':
      return applyMapSkill(state, command);
    case 'useValor':
      return applyUseValor(state, command);
    case 'engage':
      return applyEngage(state, command);
  }
}
