import type { DuelResult } from '../duel/resolveDuel.js';
import { applyCommand } from './commands.js';
import { decideMapAiCommand } from './mapAi.js';
import { checkWinCondition, endRound, isRoundComplete } from './round.js';
import type { BattleCommand, BattleState, BattleUnit } from './types.js';

// Primeira unidade viva, ainda não agiu neste round, com `aiArchetype` definido, na
// ordem FIXA de iniciativa (§5.3) — nunca aleatória, pra garantir que múltiplas unidades
// de IA pendentes ao mesmo tempo resolvam sempre na mesma ordem (determinismo: duas
// unidades de IA mirando o mesmo alvo têm que decidir sempre na mesma sequência).
function findNextPendingAiUnit(state: BattleState): BattleUnit | undefined {
  for (const entry of state.initiativeOrder) {
    const unit = state.units.find((u) => u.unitId === entry.unitId);
    if (!unit || unit.hp <= 0 || unit.hasActedThisRound) continue;
    if (unit.aiArchetype) return unit;
  }
  return undefined;
}

// §9.1 — "o atacante joga a camada de grid manualmente contra essa defesa [...] todos os
// duelos resolvem automaticamente pelos scripts dos dois lados." Drena todo turno de
// unidade com `aiArchetype` que esteja pronta pra agir, repetindo `decideMapAiCommand`
// pra mesma unidade quando o comando devolvido não encerra o turno (`move`), até não
// sobrar nenhuma unidade de IA pendente no round atual (aí é vez de uma unidade humana, e
// a função devolve o controle) ou a batalha terminar. Cruza fronteira de round livremente
// quando só resta IA dos dois lados (Modo 2/Coliseu, M8) — a única coisa que trava o
// avanço é `isRoundComplete` exigir TODAS as unidades vivas, IA ou não.
//
// Chamada automaticamente por `buildInitialState`/`applyCommandAndAdvance` — nenhum
// chamador (cliente OU servidor) precisa saber que uma unidade é IA. Decisão registrada
// em DECISIONS.md (M7, sub-sessão 6): isso elimina o risco de cliente e servidor
// implementarem o loop de IA de formas diferentes e divergirem (§9.1: "divergência =
// bug crítico").
export function resolveAiTurns(state: BattleState): BattleState {
  return resolveAiTurnsLogged(state).state;
}

// M16, sub-sessão 4/N — o RELATO do turno da IA. Um passo é um comando que a IA aplicou, o
// estado imediatamente antes dele e, quando o comando foi um `engage`, o `DuelResult` que ele
// produziu. Nada aqui decide coisa alguma: `resolveAiTurns` é esta função com o relato jogado
// fora, e as duas devolvem exatamente o mesmo estado (travado por teste). Nenhuma regra muda,
// `RULES_VERSION` não sobe.
//
// Por que isto existe: até M16 3/N os inimigos TELEPORTAVAM no cliente. `applyCommandAndAdvance`
// drenava o turno inteiro por dentro e devolvia só o estado final, então os caminhos andados e
// os duelos que a IA abriu eram descartados no caminho — e uma animação não tem como contar o
// que ninguém lhe contou. As duas alternativas que dispensariam esta adição foram recusadas
// (DECISIONS.md, M16 4/N): diffar dois estados faria a animação INFERIR o caminho, e reexecutar
// o laço no cliente duplicaria lá o que M7 6/N centralizou aqui para cliente e servidor não
// divergirem. Quem não quer o relato chama `resolveAiTurns` e não paga nada por ele.
export interface AiTurnStep {
  // O estado ANTES do comando. É de onde a animação tira geometria (onde a peça estava, quem
  // estava vivo) sem reaplicar comando nenhum. Barato: os estados já são imutáveis e criados
  // novos a cada passo, então guardar a referência não copia nada.
  readonly stateBefore: BattleState;
  readonly command: BattleCommand;
  readonly duelResult?: DuelResult;
}

export interface ResolveAiTurnsResult {
  readonly state: BattleState;
  readonly steps: readonly AiTurnStep[];
}

export function resolveAiTurnsLogged(state: BattleState): ResolveAiTurnsResult {
  let current = state;
  const steps: AiTurnStep[] = [];

  while (current.outcome === 'ongoing') {
    const unit = findNextPendingAiUnit(current);
    if (!unit?.aiArchetype) break;

    const command = decideMapAiCommand({ state: current, unitId: unit.unitId, archetype: unit.aiArchetype });
    const outcome = applyCommand(current, command);
    if (!outcome.applied) break; // defensivo: decideMapAiCommand é testado pra sempre devolver um comando válido

    steps.push({ stateBefore: current, command, duelResult: outcome.duelResult });

    let next = outcome.state;
    if (isRoundComplete(next)) next = endRound(next);

    const winStatus = checkWinCondition(next);
    if (winStatus !== 'ongoing') next = { ...next, outcome: winStatus };

    current = next;
  }

  return { state: current, steps };
}
