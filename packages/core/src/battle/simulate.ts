import type { DuelResult } from '../duel/resolveDuel.js';
import { resolveAiTurnsLogged, type AiTurnStep } from './aiTurn.js';
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
  return buildInitialStateLogged(setup, seed).state;
}

export interface BuildInitialStateResult {
  readonly state: BattleState;
  // O turno de IA que acontece ANTES do primeiro comando. Era o único turno da batalha sem
  // relato depois de M16 4/N, e ficou de fora de propósito lá: para o cliente não há "antes"
  // que o jogador tenha visto, então não existe teletransporte a corrigir. Não é lacuna de
  // animação; é lacuna de MEDIÇÃO. No torneio de `tools/balance` (§9.2, Coliseu) os dois lados
  // são IA, então a batalha INTEIRA resolve aqui dentro — sem este relato, nada fora do core
  // consegue observar um duelo do torneio, e "as assistências disparam?" fica sem resposta.
  //
  // Relato puro, como o de `resolveAiTurnsLogged`: `buildInitialState` é esta função com os
  // passos jogados fora, e as duas devolvem exatamente o mesmo estado (travado por teste).
  // Nenhuma regra muda, `RULES_VERSION` não sobe.
  readonly steps: readonly AiTurnStep[];
}

export function buildInitialStateLogged(setup: BattleSetup, seed: number): BuildInitialStateResult {
  const initiativeOrder = computeInitiativeOrder(
    setup.units.map((unit) => ({ id: unit.unitId, spd: unit.stats.spd })),
    seed,
  );

  const thirdSize = integerDivideBy3(initiativeOrder.length);
  const lateStartIndex = initiativeOrder.length - thirdSize;
  const lateUnitIds = new Set(initiativeOrder.slice(lateStartIndex).map((entry) => entry.unitId));

  const units = setup.units.map((unit) => (lateUnitIds.has(unit.unitId) ? { ...unit, pp: unit.pp + 1 } : unit));

  return resolveAiTurnsLogged({
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
    valorSkills: setup.valorSkills,
    summonBlueprints: setup.summonBlueprints,
    outcome: 'ongoing',
    seed,
  });
}

export interface AdvanceWithoutAiResult {
  readonly state: BattleState;
  readonly applied: boolean;
  readonly reason?: string;
  readonly duelResult?: DuelResult;
}

// M36 1/N (D47) — AVANÇAR, e só isso: aplica UM comando e faz o mesmo bookkeeping que
// `simulate` faz por iteração (fecha o round quando todas as unidades vivas agiram, marca
// outcome quando a condição de vitória é atingida). Para antes da IA.
//
// **Por que virou função própria.** Até aqui isto era o corpo de `applyCommandAndAdvance`, e
// "avançar" e "a IA joga" eram inseparáveis. A batalha viva no servidor precisa das duas
// metades em momentos diferentes: o comando do jogador chega por uma rota e é respondido, e o
// turno da IA é um passo com log próprio — que o servidor redige antes de mandar, porque os
// scripts dela são ocultos (D47). Extrair, não reescrever: `applyCommandAndAdvance` abaixo é
// esta função seguida de `resolveAiTurnsLogged`, exatamente como antes, e nenhuma regra muda.
export function advanceWithoutAi(state: BattleState, command: BattleCommand): AdvanceWithoutAiResult {
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

  return { state: nextState, applied: true, duelResult: outcome.duelResult };
}

export interface ApplyCommandAndAdvanceResult extends AdvanceWithoutAiResult {
  // M16 4/N — o que a IA fez DEPOIS deste comando, na ordem em que fez. Sempre uma lista (vazia
  // quando nenhuma unidade de IA agiu), nunca `undefined`: "a IA não jogou" e "ninguém me contou
  // o que ela jogou" são coisas diferentes, e quem anima precisa distinguir as duas. Relato puro
  // — o estado devolvido é o mesmo com ou sem ele.
  readonly aiSteps: readonly AiTurnStep[];
}

// Avançar e deixar a IA jogar, numa chamada só. Serve `simulate` (lote, replay) e o torneio de
// `tools/balance`, que jogam os dois lados com dados completos e não têm o que redigir.
export function applyCommandAndAdvance(state: BattleState, command: BattleCommand): ApplyCommandAndAdvanceResult {
  const avancado = advanceWithoutAi(state, command);
  if (!avancado.applied) return { ...avancado, aiSteps: [] };

  const ia = resolveAiTurnsLogged(avancado.state);
  return { state: ia.state, applied: true, duelResult: avancado.duelResult, aiSteps: ia.steps };
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
