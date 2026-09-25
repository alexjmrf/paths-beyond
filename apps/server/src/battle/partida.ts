import {
  advanceWithoutAi,
  buildInitialStateLogged,
  resolveAiTurnsLogged,
  type BattleCommand,
  type BattleResult,
  type BattleState,
  type DuelResult,
  type Side,
} from '@paths-beyond/core';
import type { StoredMatch } from '../repository/types.js';
import { redigirEstado, type EstadoVisivel } from './visao.js';

// M36 2/N (D47) — A BATALHA VIVA: o motor do lado do servidor.
//
// **O que este arquivo é.** A ponte entre uma linha de `matches` (setup + seed + comandos) e o
// que o cliente pode ver. Ele não decide regra nenhuma — quem resolve duelo, movimento,
// iniciativa e condição de vitória continua sendo `packages/core`, intocado. O que muda é ONDE
// isso roda e O QUE atravessa a rede.
//
// **O estado não é guardado, é derivado.** Toda requisição reconstrói o `BattleState` a partir
// da linha, por §3.3 de `01-fundacoes-tecnicas.md`. Três coisas caem de graça disso:
//
//   1. **O replay de uma batalha viva reproduz o que ela produziu** — porque reproduzir é
//      literalmente o que o servidor faz a cada comando. Não são dois caminhos que precisam
//      concordar; é um caminho só.
//   2. **Reconectar não perde nem repete o duelo** (M22, que sobrevive a esta milestone): o
//      estado de quem voltou é o mesmo cálculo sobre a mesma linha.
//   3. **Nada de estado serializado desatualizando com `RULES_VERSION`** — a linha guarda a
//      receita, e a versão em que ela foi aberta está gravada ao lado dela.
//
// O custo é reexecutar os comandos por requisição. Uma batalha tem dezenas de comandos e o core
// resolve o replay canônico mil vezes em menos de um segundo (`crossRuntime.test.ts`); é o mesmo
// trabalho que `POST /campaign/:id/run` já fazia de uma vez só.

/** Um passo do turno da IA, já redigido: é o que o cliente ANIMA, e ele não simula nada. */
export interface PassoDaIa {
  /**
   * O comando que a IA jogou. `move` traz o caminho INTEIRO (as esquinas dobradas, M16 4/N),
   * `engage` traz o alvo. O que ele NÃO traz é por que ela escolheu isso: o script tático dela
   * é oculto (D47).
   */
  readonly command: BattleCommand;
  /**
   * O duelo, quando houve. Vai inteiro, de propósito: o nome da skill no instante em que ela
   * dispara é a única forma de o jogador APRENDER o que enfrentou (D47), e revelar o que já
   * aconteceu não é revelar o que o inimigo ainda tem.
   */
  readonly duelResult?: DuelResult;
  /** O estado ANTES deste passo, redigido: é de onde a animação tira geometria. */
  readonly estadoAntes: EstadoVisivel;
}

export interface JogadaResolvida {
  /** Completo, só-servidor. Quem o publica é `redigirEstado`, e mais ninguém. */
  readonly state: BattleState;
  readonly duelResult?: DuelResult;
  readonly passosDaIa: readonly PassoDaIa[];
}

export type RecusaDeComando = { readonly ok: false; readonly code: number; readonly error: string };
export type ResultadoDeComando = ({ readonly ok: true } & JogadaResolvida) | RecusaDeComando;

/**
 * O lado que o dono da partida joga. Hoje é sempre `player` — na campanha e na masmorra por
 * construção, na arena porque quem abre a partida é o atacante e ele entra como `player`. É
 * parâmetro, e não constante, porque o PvP síncrono é "trocar quem emite metade dos comandos" e
 * não vale a pena esconder isso atrás de um literal.
 */
export const LADO_DO_DONO: Side = 'player';

/**
 * Reconstrói o `BattleState` da partida. Puro: mesma linha, mesmo estado, sempre.
 *
 * Os passos de IA que o `buildInitialStateLogged` produz (o turno que acontece ANTES do primeiro
 * comando) saem junto, porque o cliente precisa deles para animar a abertura.
 */
export function estadoDaPartida(match: StoredMatch): { readonly state: BattleState; readonly aberturaDaIa: readonly PassoDaIa[] } {
  const inicial = buildInitialStateLogged(match.setup, match.seed);
  const aberturaDaIa = inicial.steps.map((passo) => ({
    command: passo.command,
    ...(passo.duelResult ? { duelResult: passo.duelResult } : {}),
    estadoAntes: redigirEstado(passo.stateBefore, LADO_DO_DONO),
  }));

  let state = inicial.state;
  for (const command of match.commands) {
    if (state.outcome !== 'ongoing') break;
    const avancado = advanceWithoutAi(state, command);
    // Comando gravado que não aplica mais seria um estado impossível: só entra na linha o que
    // já foi aceito. Se acontecer, parar é melhor que seguir com um estado inventado.
    if (!avancado.applied) break;
    state = resolveAiTurnsLogged(avancado.state).state;
  }

  return { state, aberturaDaIa };
}

/**
 * O comando do jogador, aplicado: avança sem IA, e só então deixa a IA jogar como passo próprio
 * com log. É para isto que a 1/N partiu `applyCommandAndAdvance` em duas.
 */
export function aplicarComando(state: BattleState, command: BattleCommand, ladoDoJogador: Side): ResultadoDeComando {
  // §9.4 — "nunca confie no cliente". O modelo antigo reexecutava os comandos no fim e nunca
  // perguntou de QUEM era a unidade: com a batalha resolvida em lote e a IA jogando o outro
  // lado, um comando para uma peça inimiga era um caso que não ocorria na prática. Na batalha
  // viva ele é uma rota aberta, e mover a peça do inimigo seria jogar pelos dois lados.
  if ('unitId' in command) {
    const unidade = state.units.find((u) => u.unitId === command.unitId);
    if (!unidade) return { ok: false, code: 400, error: 'unidade desconhecida' };
    if (unidade.side !== ladoDoJogador) return { ok: false, code: 403, error: 'essa unidade não é sua' };
  }

  const avancado = advanceWithoutAi(state, command);
  if (!avancado.applied) {
    return { ok: false, code: 400, error: `comando rejeitado: ${avancado.reason ?? 'inválido'}` };
  }

  const ia = resolveAiTurnsLogged(avancado.state);
  return {
    ok: true,
    state: ia.state,
    ...(avancado.duelResult ? { duelResult: avancado.duelResult } : {}),
    passosDaIa: ia.steps.map((passo) => ({
      command: passo.command,
      ...(passo.duelResult ? { duelResult: passo.duelResult } : {}),
      estadoAntes: redigirEstado(passo.stateBefore, ladoDoJogador),
    })),
  };
}

/**
 * O `BattleResult` da partida, para o replay. É a mesma forma que `simulate` devolve desde M3 —
 * o acervo de replays não fica com dois formatos por causa desta milestone.
 */
export function resultadoDaPartida(state: BattleState): BattleResult {
  return {
    outcome: state.outcome,
    roundsPlayed: state.round,
    finalUnits: state.units,
    finalValor: state.valor,
    initiativeOrder: state.initiativeOrder,
  };
}
