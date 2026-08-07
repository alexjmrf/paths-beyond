import { describe, expect, it } from 'vitest';
import { DEFAULT_K_FACTOR, computeEloUpdate } from '../src/matchmaking/elo.js';

describe('computeEloUpdate', () => {
  it('elo igual: vencedor ganha K/2, perdedor perde K/2 (calculado à mão: esperado = 0.5)', () => {
    const result = computeEloUpdate(1200, 1200);
    expect(result.winnerElo).toBe(1200 + DEFAULT_K_FACTOR / 2);
    expect(result.loserElo).toBe(1200 - DEFAULT_K_FACTOR / 2);
  });

  it('azarão vence favorito: ganha mais que K/2', () => {
    const result = computeEloUpdate(1200, 1400);
    expect(result.winnerElo - 1200).toBeGreaterThan(DEFAULT_K_FACTOR / 2);
  });

  it('favorito vence azarão: ganha menos que K/2', () => {
    const result = computeEloUpdate(1400, 1200);
    expect(result.winnerElo - 1400).toBeLessThan(DEFAULT_K_FACTOR / 2);
  });

  it('perdedor sempre perde elo, vencedor sempre ganha', () => {
    const result = computeEloUpdate(1000, 1600);
    expect(result.winnerElo).toBeGreaterThan(1000);
    expect(result.loserElo).toBeLessThan(1600);
  });

  it('aceita um kFactor customizado', () => {
    const result = computeEloUpdate(1200, 1200, 16);
    expect(result.winnerElo).toBe(1208);
    expect(result.loserElo).toBe(1192);
  });
});
