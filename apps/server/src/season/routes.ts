import type { FastifyPluginAsync } from 'fastify';
import type { PlayerRepository, SeasonRepository } from '../repository/types.js';
import { ensureCurrentSeason } from './lifecycle.js';

export interface SeasonRoutesOptions {
  readonly seasonRepository: SeasonRepository;
  readonly playerRepository: PlayerRepository;
  readonly now?: () => number;
}

export const seasonRoutes: FastifyPluginAsync<SeasonRoutesOptions> = async (fastify, opts) => {
  fastify.get('/season/current', async (request, reply) => {
    if (!request.player) return reply.code(401).send({ error: 'missing player token' });

    const season = await ensureCurrentSeason({
      seasonRepository: opts.seasonRepository,
      playerRepository: opts.playerRepository,
      now: opts.now,
    });

    return { seasonNumber: season.seasonNumber, startedAt: season.startedAt, endsAt: season.endsAt };
  });
};
