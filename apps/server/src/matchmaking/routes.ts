import type { FastifyPluginAsync } from 'fastify';
import type { ArenaDefenseRepository, Player, PlayerRepository } from '../repository/types.js';

// Corte de escopo desta sub-sessão (ver DECISIONS.md): faixa fixa, sem alargamento
// progressivo se não achar ninguém — suficiente pra provar o endpoint, não a política de
// matchmaking final.
const ELO_SEARCH_RANGE = 200;

export interface MatchmakingRoutesOptions {
  readonly repository: PlayerRepository;
  readonly arenaDefenseRepository: ArenaDefenseRepository;
}

function closestByElo(selfElo: number, candidates: readonly Player[]): Player | undefined {
  if (candidates.length === 0) return undefined;
  return [...candidates].sort((a, b) => {
    const diff = Math.abs(a.elo - selfElo) - Math.abs(b.elo - selfElo);
    if (diff !== 0) return diff;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0; // desempate determinístico, nunca aleatório
  })[0];
}

// Registrado como filho do mesmo escopo protegido de `/me`/`battleRoutes` em app.ts —
// mesmo raciocínio já documentado ali: `fp(authPlugin)` já vale pra qualquer plugin
// filho registrado no escopo pai, não precisa registrar de novo.
export const matchmakingRoutes: FastifyPluginAsync<MatchmakingRoutesOptions> = async (fastify, opts) => {
  fastify.get('/matchmaking/opponent', async (request, reply) => {
    if (!request.player) return reply.code(401).send({ error: 'missing player token' });
    const player = request.player;

    const candidates = await opts.repository.findOpponentsNearElo({
      excludePlayerId: player.id,
      eloMin: player.elo - ELO_SEARCH_RANGE,
      eloMax: player.elo + ELO_SEARCH_RANGE,
    });

    const withDefense: Player[] = [];
    for (const candidate of candidates) {
      const defense = await opts.arenaDefenseRepository.getDefenseByOwner(candidate.id);
      if (defense) withDefense.push(candidate);
    }

    const opponent = closestByElo(player.elo, withDefense);
    if (!opponent) {
      return reply.code(404).send({ error: 'nenhum oponente disponível dentro da faixa de ELO' });
    }

    const defense = await opts.arenaDefenseRepository.getDefenseByOwner(opponent.id);
    return { playerId: opponent.id, displayName: opponent.displayName, elo: opponent.elo, mapId: defense?.mapId };
  });
};
