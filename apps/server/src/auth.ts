import type { FastifyPluginAsync } from 'fastify';
import fp from 'fastify-plugin';
import type { Player, PlayerRepository } from './repository/types.js';

declare module 'fastify' {
  interface FastifyRequest {
    player?: Player;
  }
}

const PLAYER_TOKEN_HEADER = 'x-player-token';

export interface AuthPluginOptions {
  repository: PlayerRepository;
}

// Auth stub decidido em DECISIONS.md (M7 kickoff): identidade por token opaco,
// sem senha/cadastro — não é login real.
//
// Envolvido em fp() (fastify-plugin) para o hook `onRequest` escapar da
// encapsulação do próprio plugin e valer para as rotas irmãs registradas no
// mesmo escopo pai (ex.: `/me`) — sem isso o hook só se aplicaria a rotas
// registradas dentro do próprio `authPlugin`, nenhuma. O escopo pai continua
// encapsulado normalmente, então rotas fora dele (ex.: `/health`) não são
// afetadas.
const authPluginImpl: FastifyPluginAsync<AuthPluginOptions> = async (fastify, opts) => {
  fastify.addHook('onRequest', async (request, reply) => {
    const token = request.headers[PLAYER_TOKEN_HEADER];
    if (typeof token !== 'string') {
      await reply.code(401).send({ error: 'missing player token' });
      return;
    }

    const player = await opts.repository.getPlayerByToken(token);
    if (!player) {
      await reply.code(401).send({ error: 'unknown player token' });
      return;
    }

    request.player = player;
  });
};

export const authPlugin = fp(authPluginImpl);
