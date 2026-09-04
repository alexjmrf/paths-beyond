import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { IdempotencyRepository } from './repository/types.js';

// §9.4 (M22, sub-sessão 2/N) — a RECONEXÃO, e por que ela é um hook e não código de rota.
//
// **O buraco, exatamente.** O nonce já existia em três tabelas e já impedia a segunda
// cobrança; o que ele não fazia é devolver o que aconteceu na primeira. Uma queda de conexão
// no meio de `POST /dungeons/:id/run` deixava o jogador assim: a energia foi debitada, a
// batalha foi resolvida, a resposta se perdeu no cabo — e o reenvio levava
// `409 esta run já foi resolvida`. Do ponto de vista dele, a run comeu a energia e sumiu.
//
// **Por que hook global e não um `if` em cada rota.** São nove rotas que aceitam nonce hoje,
// em cinco arquivos, e a próxima rota que cobrar recurso vai nascer amanhã. Escrito por
// rota, o comportamento existe onde alguém lembrou de escrever; escrito aqui, ele existe
// porque a requisição tem nonce.
//
// **O que este hook NÃO resolve, dito com todas as letras:** duas requisições SIMULTÂNEAS
// com o mesmo nonce podem passar as duas pela consulta antes de qualquer uma gravar. Contra
// isso quem protege são as chaves primárias que já existem (`replays.nonce`,
// `dungeon_runs.nonce`, `economy_actions.nonce`) — e elas continuam no lugar. O problema
// desta fatia é outro: o reenvio SEQUENCIAL de quem perdeu a conexão.

export interface IdempotencyOptions {
  readonly repository: IdempotencyRepository;
  readonly now?: () => number;
}

// A marca de "esta resposta já veio do armazém": sem ela, o `onSend` regravaria a resposta
// repetida por cima da original a cada reenvio.
const REPETIDA = Symbol('resposta repetida');

function nonceDoCorpo(request: FastifyRequest): string | null {
  const body = request.body;
  if (typeof body !== 'object' || body === null) return null;
  const nonce = (body as { nonce?: unknown }).nonce;
  return typeof nonce === 'string' && nonce.length > 0 ? nonce : null;
}

// Método + rota declarada (`POST /dungeons/:id/run`), e não a URL concreta: duas masmorras
// diferentes são a mesma rota, e o que se quer distinguir é a PERGUNTA, não o parâmetro.
function chaveDaRota(request: FastifyRequest): string {
  return `${request.method} ${request.routeOptions?.url ?? request.url}`;
}

export function registerIdempotency(app: FastifyInstance, opts: IdempotencyOptions): void {
  const now = opts.now ?? Date.now;

  app.addHook('preHandler', async (request: FastifyRequest, reply: FastifyReply) => {
    const nonce = nonceDoCorpo(request);
    if (!nonce || !request.player) return;

    const guardada = await opts.repository.get(request.player.id, nonce);
    if (!guardada) return;

    // Mesmo nonce em rota diferente é cliente confuso ou cliente hostil: repetir a resposta
    // de uma masmorra para um pedido de invocação seria responder outra pergunta.
    if (guardada.route !== chaveDaRota(request)) {
      return reply.code(409).send({ error: 'este nonce já foi usado em outra rota' });
    }

    (request as unknown as Record<symbol, boolean>)[REPETIDA] = true;
    return reply.code(guardada.status).send(guardada.body);
  });

  app.addHook('onSend', async (request: FastifyRequest, reply: FastifyReply, payload: unknown) => {
    if ((request as unknown as Record<symbol, boolean>)[REPETIDA]) return payload;

    const nonce = nonceDoCorpo(request);
    if (!nonce || !request.player) return payload;

    // **Só resposta de SUCESSO é guardada.** Uma recusa por energia insuficiente, por
    // limite de requisições ou por versão de regras precisa poder ser tentada de novo — o
    // jogador compra energia, espera a janela, atualiza o jogo. Guardar a recusa a
    // congelaria para sempre naquele nonce.
    if (reply.statusCode < 200 || reply.statusCode >= 300) return payload;
    if (typeof payload !== 'string') return payload;

    let body: unknown;
    try {
      body = JSON.parse(payload);
    } catch {
      // Resposta que não é JSON não é resposta deste servidor; deixa passar sem guardar.
      return payload;
    }

    await opts.repository.save({
      nonce,
      playerId: request.player.id,
      route: chaveDaRota(request),
      status: reply.statusCode,
      body,
      createdAt: new Date(now()).toISOString(),
    });

    return payload;
  });
}
