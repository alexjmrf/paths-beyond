import type { Coord } from '../grid/types.js';
import type { BattleState, BattleUnit } from './types.js';

// §5.7 (M11, sub-sessão 1/N) — "Data-driven por mapa: rout, seize, survive N rounds,
// escort, defend." A spec nomeia as cinco e não define nenhuma; as leituras abaixo foram
// decididas com o usuário e estão registradas em DECISIONS.md. Até M10 só `rout` era
// resolvido, o que obrigava todo mapa a ser "mate todo mundo".

export type BattleOutcome = 'ongoing' | 'victory' | 'defeat';

function coordsEqual(a: Coord, b: Coord): boolean {
  return a.x === b.x && a.y === b.y;
}

function isAliveAt(unit: BattleUnit, side: BattleUnit['side'], pos: Coord): boolean {
  return unit.side === side && unit.hp > 0 && coordsEqual(unit.pos, pos);
}

export function checkWinCondition(state: BattleState): BattleOutcome {
  // Derrota universal, válida para TODA condição: sem unidade viva não há partida a
  // continuar. É a única regra que não vem da condição declarada pelo mapa.
  if (!state.units.some((u) => u.side === 'player' && u.hp > 0)) return 'defeat';

  const condition = state.winCondition;
  switch (condition.t) {
    case 'rout':
      return state.units.some((u) => u.side === 'enemy' && u.hp > 0) ? 'ongoing' : 'victory';

    case 'seize':
      // "Qualquer unidade viva do jogador sobre o tile" (decisão do usuário). O que
      // distingue `seize` de `escort` é exatamente isto: lá a unidade é nomeada.
      return state.units.some((u) => isAliveAt(u, 'player', condition.target)) ? 'victory' : 'ongoing';

    case 'surviveRounds':
      // `round` já é o round CORRENTE e só vira n+1 quando o round n fecha (`endRound`),
      // então `>` é o que significa "sobreviveu aos n rounds".
      return state.round > condition.n ? 'victory' : 'ongoing';

    case 'escort': {
      const escorted = state.units.find((u) => u.unitId === condition.unitId);
      // Perder o escoltado é derrota imediata (decisão do usuário): sem isso, `escort`
      // seria só um `seize` que exige uma unidade específica. Um `unitId` que não existe
      // no mapa é erro de conteúdo — resolve como derrota em vez de deixar a partida sem
      // desfecho possível.
      if (!escorted || escorted.hp <= 0) return 'defeat';
      return coordsEqual(escorted.pos, condition.target) ? 'victory' : 'ongoing';
    }

    case 'defend': {
      // O inimigo tomar o tile decide antes da contagem de rounds: a derrota é imediata,
      // e cumprir os N rounds não a desfaz.
      if (state.units.some((u) => isAliveAt(u, 'enemy', condition.target))) return 'defeat';
      return state.round > condition.rounds ? 'victory' : 'ongoing';
    }
  }
}
