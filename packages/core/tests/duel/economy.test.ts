import { describe, expect, it } from 'vitest';
import {
  canAffordAp,
  canAffordPp,
  resetTrocaPpSpend,
  spendAp,
  spendPp,
  type DuelEconomyState,
} from '../../src/duel/economy.js';

function state(overrides: Partial<DuelEconomyState> = {}): DuelEconomyState {
  return {
    pools: { ap: 3, pp: 2 },
    apSpentThisDuel: 0,
    ppSpentThisTroca: 0,
    ...overrides,
  };
}

describe('economy — AP/PP (§6.2, §6.4)', () => {
  it('ataque básico (custo 0 AP) está sempre disponível, mesmo com pools zeradas', () => {
    expect(canAffordAp(state({ pools: { ap: 0, pp: 0 } }), 0)).toBe(true);
    expect(canAffordAp(state({ apSpentThisDuel: 2, pools: { ap: 0, pp: 0 } }), 0)).toBe(true);
  });

  it('rejeita gasto de AP maior que o pool atual', () => {
    expect(canAffordAp(state({ pools: { ap: 1, pp: 2 } }), 2)).toBe(false);
  });

  it('rejeita gasto de AP que estouraria o teto de 2 por duelo, mesmo com pool suficiente', () => {
    expect(canAffordAp(state({ apSpentThisDuel: 2, pools: { ap: 5, pp: 2 } }), 1)).toBe(false);
    expect(canAffordAp(state({ apSpentThisDuel: 1, pools: { ap: 5, pp: 2 } }), 1)).toBe(true);
  });

  it('spendAp desconta do pool e soma ao total gasto no duelo, sem mutar o estado original', () => {
    const before = state({ pools: { ap: 3, pp: 2 } });
    const after = spendAp(before, 1);
    expect(after).toEqual({ pools: { ap: 2, pp: 2 }, apSpentThisDuel: 1, ppSpentThisTroca: 0 });
    expect(before).toEqual(state({ pools: { ap: 3, pp: 2 } }));
  });

  it('contra-atacar custa exatamente 1 PP — disponível com pool >= 1 e nenhum PP gasto na troca', () => {
    expect(canAffordPp(state({ pools: { ap: 3, pp: 1 } }), 1)).toBe(true);
    expect(canAffordPp(state({ pools: { ap: 3, pp: 0 } }), 1)).toBe(false);
  });

  it('rejeita PP se o teto de 1 PP por troca já foi atingido, mesmo com pool sobrando', () => {
    expect(canAffordPp(state({ pools: { ap: 3, pp: 5 }, ppSpentThisTroca: 1 }), 1)).toBe(false);
  });

  it('spendPp desconta do pool e soma ao gasto da troca, sem mutar o estado original', () => {
    const before = state({ pools: { ap: 3, pp: 2 } });
    const after = spendPp(before, 1);
    expect(after).toEqual({ pools: { ap: 3, pp: 1 }, apSpentThisDuel: 0, ppSpentThisTroca: 1 });
    expect(before).toEqual(state({ pools: { ap: 3, pp: 2 } }));
  });

  it('resetTrocaPpSpend zera o contador de PP da troca sem tocar no AP nem no pool', () => {
    const spent = spendPp(state(), 1);
    const reset = resetTrocaPpSpend(spent);
    expect(reset).toEqual({ pools: { ap: 3, pp: 1 }, apSpentThisDuel: 0, ppSpentThisTroca: 0 });
  });
});
