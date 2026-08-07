// §9.1 — "ELO, temporadas de 14 dias." A spec nomeia ELO mas não dá fórmula nem
// K-factor — 32 é o padrão clássico do sistema Elo (xadrez), não um número dado pela
// spec. Decisão registrada em DECISIONS.md (M7, sub-sessão 8): default razoável,
// ajustável depois (não é conteúdo de simulação de combate, então dados.md não se
// aplica aqui — isto é config de matchmaking em apps/server, não regra de
// packages/core).
export const DEFAULT_K_FACTOR = 32;

export interface EloUpdateResult {
  readonly winnerElo: number;
  readonly loserElo: number;
}

// Fórmula clássica do Elo. Ponto flutuante é aceitável aqui — não é packages/core, não
// precisa reproduzir bytes idênticos entre plataformas, só arredondar pra um inteiro no
// final.
export function computeEloUpdate(winnerElo: number, loserElo: number, kFactor: number = DEFAULT_K_FACTOR): EloUpdateResult {
  const expectedWinner = 1 / (1 + 10 ** ((loserElo - winnerElo) / 400));
  const expectedLoser = 1 - expectedWinner;

  return {
    winnerElo: Math.round(winnerElo + kFactor * (1 - expectedWinner)),
    loserElo: Math.round(loserElo + kFactor * (0 - expectedLoser)),
  };
}
