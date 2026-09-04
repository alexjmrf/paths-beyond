import type { FastifyPluginAsync } from 'fastify';
import fp from 'fastify-plugin';
import type { IdentityValidator } from './identity/types.js';
import type { Player, PlayerRepository } from './repository/types.js';

declare module 'fastify' {
  interface FastifyRequest {
    player?: Player;
  }
}

// §9.4 (M20) — o header do TICKET DE PLATAFORMA, no lugar do token digitado.
export const PLATFORM_TICKET_HEADER = 'x-platform-ticket';

export interface AuthPluginOptions {
  repository: PlayerRepository;
  identityValidator: IdentityValidator;
}

// A autenticação deixou de ser "quem sabe o token é a pessoa" (stub de M7) e passou a ser
// "a plataforma confirma quem é". O que o servidor recebe vale por segundos e não serve para
// nada depois; nenhuma credencial nossa existe para vazar.
//
// **Autenticar não cria conta.** Ticket válido de conta inexistente é 401, não um cadastro
// silencioso: a criação é explícita em `POST /accounts/session`, e é a decisão que tirou do
// projeto o "leitura que escreve" que a M18 6/N tinha introduzido em `GET /me/heroes`.
//
// Envolvido em fp() (fastify-plugin) para o hook `onRequest` escapar da encapsulação do
// próprio plugin e valer para as rotas irmãs registradas no mesmo escopo pai — sem isso o
// hook só se aplicaria a rotas registradas dentro do próprio `authPlugin`, nenhuma.
const authPluginImpl: FastifyPluginAsync<AuthPluginOptions> = async (fastify, opts) => {
  fastify.addHook('onRequest', async (request, reply) => {
    const ticket = request.headers[PLATFORM_TICKET_HEADER];
    if (typeof ticket !== 'string' || ticket.length === 0) {
      await reply.code(401).send({ error: 'missing platform ticket' });
      return;
    }

    const identity = await opts.identityValidator.validate(ticket);
    if (!identity) {
      // Ticket expirado, de outro jogo, ou plataforma fora do ar: os três são "não sei quem
      // é você", e nenhum deles é erro do servidor.
      await reply.code(401).send({ error: 'invalid platform ticket' });
      return;
    }

    const player = await opts.repository.getPlayerByPlatformIdentity(identity.provider, identity.platformId);
    if (!player) {
      await reply.code(401).send({ error: 'no account for this identity' });
      return;
    }

    request.player = player;
  });
};

export const authPlugin = fp(authPluginImpl);
