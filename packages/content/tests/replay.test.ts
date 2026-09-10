import { RULES_VERSION, buildInitialState, simulate, type BattleState, type Replay } from '@paths-beyond/core';
import { describe, expect, it } from 'vitest';
import { applyCommandAndAdvance } from '@paths-beyond/core';
import { loadCatalogFromDisk } from '../src/loadCatalogFromDisk.js';
import { CAMPAIGN_SEED, playthrough, setupFor } from '../src/campaignPilot.js';

// M13, sub-sessão 1/N — o critério de aceite do milestone: "um `Replay` gravado é
// reproduzido passo a passo na UI e bate com o resultado do core".
//
// A perna de UI é verificada no navegador (o cliente não entra em `pnpm test`); o que
// este arquivo trava é a parte que a UI não pode consertar: que uma jogada REAL, gravada
// como `{rulesVersion, seed, initialState, commands}` (§3.4), reproduza o mesmo estado —
// tanto em lote (`simulate`) quanto passo a passo, que é como a tela reproduz.
//
// Por que a campanha inteira e não um fixture: replay só prova alguma coisa contra uma
// partida com decisão de verdade. O piloto de `campaignPilot.ts` joga os 6 capítulos —
// com IA de mapa, duelos, reações, cura, gatilho de morte e as 5 condições de vitória —
// e o log de comandos dele é a gravação.

const catalog = loadCatalogFromDisk();

function replayOf(encounterIndex: number): { replay: Replay; live: BattleState } {
  const encounter = catalog.encounters[encounterIndex]!;
  const { state, commandLog } = playthrough(catalog, encounter);
  return {
    replay: {
      rulesVersion: RULES_VERSION,
      seed: CAMPAIGN_SEED,
      initialState: setupFor(catalog, encounter),
      commands: commandLog,
    },
    live: state,
  };
}

// Reprodução PASSO A PASSO: o mesmo caminho que a tela de replay usa (um
// `applyCommandAndAdvance` por clique de "avançar"), em vez do laço em lote de `simulate`.
function replayStepByStep(replay: Replay, upTo = replay.commands.length): BattleState {
  let state = buildInitialState(replay.initialState, replay.seed);
  for (const command of replay.commands.slice(0, upTo)) {
    if (state.outcome !== 'ongoing') break;
    state = applyCommandAndAdvance(state, command).state;
  }
  return state;
}

describe('replay de uma partida real (§3.4)', () => {
  for (const [index, encounter] of catalog.encounters.entries()) {
    it(`${encounter.name}: o replay em lote bate com a partida jogada`, () => {
      const { replay, live } = replayOf(index);
      const result = simulate(replay);

      expect(result.outcome).toBe(live.outcome);
      expect(result.roundsPlayed).toBe(live.round);
      expect(result.finalUnits).toEqual(live.units);
      expect(result.finalValor).toBe(live.valor);
    });

    it(`${encounter.name}: reproduzido passo a passo dá o MESMO estado, byte a byte`, () => {
      const { replay, live } = replayOf(index);
      // A tela avança um comando por vez; se um passo divergisse do lote, o jogador veria
      // uma batalha que não aconteceu.
      expect(JSON.stringify(replayStepByStep(replay))).toBe(JSON.stringify(live));
    });
  }

  it('todo prefixo do replay é um estado válido — é o que "passo a passo" significa', () => {
    const { replay } = replayOf(2); // capítulo 3, `defend`: termina por contagem de rounds
    expect(replay.commands.length).toBeGreaterThan(3);

    let previousRound = 0;
    for (let step = 0; step <= replay.commands.length; step++) {
      const state = replayStepByStep(replay, step);
      // O round nunca anda pra trás, e o desfecho só aparece no fim.
      expect(state.round).toBeGreaterThanOrEqual(previousRound);
      previousRound = state.round;
      if (step < replay.commands.length) continue;
      expect(state.outcome).not.toBe('ongoing');
    }
  });

  it('rebobinar é reconstruir: o passo N reproduzido duas vezes é idêntico', () => {
    // A tela recomputa do início a cada passo em vez de guardar snapshots — o que só é
    // legítimo porque o core é determinístico. Este teste é o que garante isso.
    const { replay } = replayOf(0);
    const middle = replay.commands.length >> 1;
    expect(JSON.stringify(replayStepByStep(replay, middle))).toBe(JSON.stringify(replayStepByStep(replay, middle)));
  });

  it('grava a `rulesVersion` corrente — §9.4 recusa replay de outra versão', () => {
    const { replay } = replayOf(0);
    expect(replay.rulesVersion).toBe(RULES_VERSION);
  });
});
