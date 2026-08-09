import type { DuelResult } from '../duel/resolveDuel.js';
import { resolveAiTurns } from './aiTurn.js';
import { applyCommand } from './commands.js';
import { computeInitiativeOrder } from './initiative.js';
import { checkWinCondition, endRound, isRoundComplete } from './round.js';
import type { BattleCommand, BattleResult, BattleSetup, BattleState, Replay } from './types.js';

// floor(n/3) sem `/` cru (regra 2/CLAUDE.md — battle/ só soma/subtrai fora dos helpers
// de math/fixed.ts); tamanhos de batalha são pequenos, o loop é barato.
function integerDivideBy3(n: number): number {
  let count = 0;
  let remaining = n;
  while (remaining >= 3) {
    remaining -= 3;
    count += 1;
  }
  return count;
}

// §5.3 — "unidades no terço final da lista começam a batalha com +1 PP." Exportada para
// consumo interativo (M6): o cliente monta o BattleState uma vez e depois aplica um
// BattleCommand por vez via applyCommandAndAdvance, em vez de rodar um Replay em lote.
export function buildInitialState(setup: BattleSetup, seed: number): BattleState {
  const initiativeOrder = computeInitiativeOrder(
    setup.units.map((unit) => ({ id: unit.unitId, spd: unit.stats.spd })),
    seed,
  );

  const thirdSize = integerDivideBy3(initiativeOrder.length);
  const lateStartIndex = initiativeOrder.length - thirdSize;
  const lateUnitIds = new Set(initiativeOrder.slice(lateStartIndex).map((entry) => entry.unitId));

  const units = setup.units.map((unit) => (lateUnitIds.has(unit.unitId) ? { ...unit, pp: unit.pp + 1 } : unit));

  return resolveAiTurns({
    map: setup.map,
    units,
    initiativeOrder,
    round: 1,
    valor: setup.initialValor,
    distanceMovedThisTurn: {},
    freeAssistUsedThisRound: [],
    permadeath: setup.permadeath,
    winCondition: setup.winCondition,
    effectDefs: setup.effectDefs,
    outcome: 'ongoing',
    seed,
  });
}

export interface ApplyCommandAndAdvanceResult {
  readonly state: BattleState;
  readonly applied: boolean;
  readonly reason?: string;
  readonly duelResult?: DuelResult;
}

// Aplica UM comando e faz o mesmo bookkeeping que `simulate` faz por iteração (fecha o
// round quando todas as unidades vivas agiram, marca outcome quando a condição de
// vitória é atingida). Existe pra servir dois consumidores com a mesma lógica: `simulate`
// (lote, replay) e o cliente interativo de M6 (um comando por clique do jogador).
export function applyCommandAndAdvance(state: BattleState, command: BattleCommand): ApplyCommandAndAdvanceResult {
  if (state.outcome !== 'ongoing') {
    return { state, applied: false, reason: 'a batalha já terminou' };
  }

  const outcome = applyCommand(state, command);
  if (!outcome.applied) {
    return { state, applied: false, reason: outcome.reason, duelResult: outcome.duelResult };
  }

  let nextState = outcome.state;
  if (isRoundComplete(nextState)) {
    nextState = endRound(nextState);
  }

  const winStatus = checkWinCondition(nextState);
  if (winStatus !== 'ongoing') {
    nextState = { ...nextState, outcome: winStatus };
  }

  return { state: resolveAiTurns(nextState), applied: true, duelResult: outcome.duelResult };
}

// §01-fundacoes-tecnicas.md §3.3 — "O estado da batalha é derivado exclusivamente de
// initialState + seed + commands. simulate(replay) => BattleResult DEVE ser pura."
// Comandos inválidos são ignorados (revalidados por applyCommand), nunca travam a
// simulação — consistente com "nunca confie no cliente" (§5.2).
export function simulate(replay: Replay): BattleResult {
  let state = buildInitialState(replay.initialState, replay.seed);

  for (const command of replay.commands) {
    if (state.outcome !== 'ongoing') break;
    state = applyCommandAndAdvance(state, command).state;
  }

  return {
    outcome: state.outcome,
    roundsPlayed: state.round,
    finalUnits: state.units,
    finalValor: state.valor,
    initiativeOrder: state.initiativeOrder,
  };
}
