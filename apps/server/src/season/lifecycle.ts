import { DEFAULT_ELO, type PlayerRepository, type Season, type SeasonRepository } from '../repository/types.js';

// §9.1 — "ELO, temporadas de 14 dias." Valor dado literalmente pela spec, não um número
// de balanceamento.
const FOURTEEN_DAYS_MS = 14 * 24 * 60 * 60 * 1000;

// Decisão confirmada com o usuário (M8, sub-sessão 5): soft-reset, não reset total nem
// "sem reset" — cada jogador regride 50% na direção de DEFAULT_ELO no início de uma
// temporada nova. Preserva parte do mérito da temporada anterior sem congelar hierarquia
// pra sempre (padrão clássico de ladders competitivos).
const SOFT_RESET_REGRESSION_PCT = 0.5;

export interface EnsureCurrentSeasonOptions {
  readonly seasonRepository: SeasonRepository;
  readonly playerRepository: PlayerRepository;
  readonly now?: () => number;
}

// Mesmo idioma de `battle/rateLimit.ts`: sem cron/timer de fundo (nenhuma dependência de
// scheduler existe no projeto) — o rollover de temporada é um cálculo puro em função de
// `now()`, checado sob demanda por quem chamar esta função (hoje só `GET /season/current`,
// ver DECISIONS.md pro corte de escopo de não ligar isso a `/battles`/matchmaking ainda).
export async function ensureCurrentSeason(options: EnsureCurrentSeasonOptions): Promise<Season> {
  const now = options.now ?? Date.now;
  const nowMs = now();

  const current = await options.seasonRepository.getCurrentSeason();
  if (current && new Date(current.endsAt).getTime() > nowMs) {
    return current;
  }

  const nextSeasonNumber = current ? current.seasonNumber + 1 : 1;
  const created = await options.seasonRepository.createSeason({
    id: crypto.randomUUID(),
    seasonNumber: nextSeasonNumber,
    startedAt: new Date(nowMs).toISOString(),
    endsAt: new Date(nowMs + FOURTEEN_DAYS_MS).toISOString(),
  });

  // Só faz soft-reset quando havia uma temporada anterior de verdade (rollover) — a
  // criação da primeira temporada não tem nada pra resetar.
  if (current) {
    const players = await options.playerRepository.listAll();
    for (const player of players) {
      const softResetElo = Math.round(DEFAULT_ELO + (player.elo - DEFAULT_ELO) * SOFT_RESET_REGRESSION_PCT);
      if (softResetElo !== player.elo) {
        await options.playerRepository.updateElo(player.id, softResetElo);
      }
    }
  }

  return created;
}
