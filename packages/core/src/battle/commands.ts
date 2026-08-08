import { fpDiv } from '../math/fixed.js';
import { rngFor } from '../rng/rngFor.js';
import { nextUint32 } from '../rng/xoshiro128.js';
import type { Id } from '../types.js';
import { manhattanDistance, tileAt, type Coord, type Terrain } from '../grid/types.js';
import { validatePath } from '../grid/pathfinding.js';
import type { ConditionUnitView } from '../tactics/types.js';
import { canAffordAp, spendAp, type DuelEconomyState } from '../duel/economy.js';
import { resolveDuel, type DuelResult } from '../duel/resolveDuel.js';
import { upsertActiveEffect } from '../duel/effects.js';
import type { AssistCandidate, AssistResult } from '../duel/assist.js';
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
function applyRest(state: BattleState, cmd: Extract<BattleCommand, { t: 'rest' }>): CommandOutcome {
  const unit = findUnit(state, cmd.unitId);
  if (!canAct(unit)) return rejected(state, 'unidade inexistente, morta ou já agiu neste round');

  const halfRange = unit.moveRange >> 1; // divisão inteira por 2 sem operador `/` cru (regra 2)
  const moved = state.distanceMovedThisTurn[unit.unitId] ?? 0;
  if (moved > halfRange) return rejected(state, 'rest exige não ter andado mais que metade do moveRange');

  return accepted(replaceUnit(state, unit.unitId, { ap: unit.ap + 1, pp: unit.pp + 1, hasActedThisRound: true }));
}

// §5.4 — "Encerra o turno. Se terminar sobre fort ou camp: +1 AP."
function applyWait(state: BattleState, cmd: Extract<BattleCommand, { t: 'wait' }>): CommandOutcome {
  const unit = findUnit(state, cmd.unitId);
  if (!canAct(unit)) return rejected(state, 'unidade inexistente, morta ou já agiu neste round');

  const tile = tileAt(state.map, unit.pos);
  const bonusAp = tile?.object === 'fort' || tile?.object === 'camp' ? 1 : 0;
  return accepted(replaceUnit(state, unit.unitId, { ap: unit.ap + bonusAp, hasActedThisRound: true }));
}

// §5.4 — "cura em área, artilharia, buff de zona". M3 corta escopo para alvo único (a
// própria unidade); AOE de verdade precisaria de um sistema de raio em tile — ver
// DECISIONS.md.
function applyMapSkill(state: BattleState, cmd: Extract<BattleCommand, { t: 'mapSkill' }>): CommandOutcome {
  const unit = findUnit(state, cmd.unitId);
  if (!canAct(unit)) return rejected(state, 'unidade inexistente, morta ou já agiu neste round');

  const skill = unit.knownSkills[cmd.skillId];
  if (!skill || skill.kind !== 'map') return rejected(state, 'skill de mapa desconhecida');

  const economy: DuelEconomyState = { pools: { ap: unit.ap, pp: unit.pp }, apSpentThisDuel: 0, ppSpentThisTroca: 0 };
  if (!canAffordAp(economy, skill.apCost)) return rejected(state, 'AP insuficiente');
  const spent = spendAp(economy, skill.apCost);

  let nextEffects = unit.effects;
  for (const application of skill.effects) {
    if (application.target !== 'self') continue; // alvo em área não suportado em M3
    const def = state.effectDefs[application.effectId];
    if (!def) continue;

    const roll = nextUint32(rngFor(state.seed, state.round, unit.unitId, `mapskill:${application.effectId}`)).value % 1000;
    if (roll >= application.chance) continue;

    nextEffects = upsertActiveEffect(nextEffects, def, application);
  }

  return accepted(
    replaceUnit(state, unit.unitId, {
      ap: spent.pools.ap,
      pp: spent.pools.pp,
      hasActedThisRound: true,
      effects: nextEffects,
    }),
  );
}

// §5.6 — Valor é recurso de exército; catálogo de `data/valor-skills/*.json` não está
// implementado em M3 (schema mínimo só, sem efeitos) — ver DECISIONS.md. `useValor` aqui
// só valida saldo e gasta um custo fixo, sem aplicar o efeito de fato.
const VALOR_COMMAND_COST = 1;

function applyUseValor(state: BattleState, _cmd: Extract<BattleCommand, { t: 'useValor' }>): CommandOutcome {
  if (state.valor < VALOR_COMMAND_COST) return rejected(state, 'valor insuficiente');
  return accepted({ ...state, valor: state.valor - VALOR_COMMAND_COST });
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
    next = next.map((u) => (u.unitId === assistant.unitId ? { ...u, pp: u.pp - (skill.ppCost ?? 0) } : u));
  }
  return next;
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
      };
    }
    return u;
  });

  // resolveDuel decide QUEM assistiu, mas não devolve os pools atualizados dos
  // assistentes (eles não são `attacker`/`defender` do duelo) — a camada de batalha
  // aplica o gasto de PP de volta.
  nextUnits = spendAssistPp(nextUnits, duelResult.attackerAssists);
  nextUnits = spendAssistPp(nextUnits, duelResult.defenderAssists);

  return accepted({ ...state, units: nextUnits }, duelResult);
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
