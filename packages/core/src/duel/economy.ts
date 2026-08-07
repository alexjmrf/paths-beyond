// §6.2 — teto duro: no máximo 2 AP gastos por uma unidade em um mesmo duelo.
const DUEL_AP_CAP = 2;
// §6.4 — uma unidade gasta no máximo 1 PP por troca.
const TROCA_PP_CAP = 1;

export interface ResourcePools {
  readonly ap: number;
  readonly pp: number;
}

export interface DuelEconomyState {
  readonly pools: ResourcePools; // pool atual (de batalha inteira), desce conforme gasta
  readonly apSpentThisDuel: number;
  readonly ppSpentThisTroca: number; // reseta a cada troca via resetTrocaPpSpend
}

export function canAffordAp(state: DuelEconomyState, cost: number): boolean {
  return state.pools.ap >= cost && state.apSpentThisDuel + cost <= DUEL_AP_CAP;
}

export function canAffordPp(state: DuelEconomyState, cost: number): boolean {
  return state.pools.pp >= cost && state.ppSpentThisTroca + cost <= TROCA_PP_CAP;
}

export function spendAp(state: DuelEconomyState, cost: number): DuelEconomyState {
  return {
    pools: { ap: state.pools.ap - cost, pp: state.pools.pp },
    apSpentThisDuel: state.apSpentThisDuel + cost,
    ppSpentThisTroca: state.ppSpentThisTroca,
  };
}

export function spendPp(state: DuelEconomyState, cost: number): DuelEconomyState {
  return {
    pools: { ap: state.pools.ap, pp: state.pools.pp - cost },
    apSpentThisDuel: state.apSpentThisDuel,
    ppSpentThisTroca: state.ppSpentThisTroca + cost,
  };
}

export function resetTrocaPpSpend(state: DuelEconomyState): DuelEconomyState {
  return { pools: state.pools, apSpentThisDuel: state.apSpentThisDuel, ppSpentThisTroca: 0 };
}
