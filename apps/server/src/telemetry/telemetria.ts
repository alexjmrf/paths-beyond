import type { FastifyPluginAsync } from 'fastify';
import { CAMPOS_COLETADOS, type MissionOutcome, type TelemetryRepository } from '../repository/types.js';

// M34 1/N (D45) — o SERVIÇO de telemetria: a única porta pela qual as rotas de jogo medem.
//
// A recusa mora aqui, e não em cada rota: quem chama `missaoIniciada` não precisa saber se a
// conta recusou — o serviço olha a escolha e não grava. Três verbos, um por evento que o
// aceite pede: o sign-in (último visto), o ticket (a missão começou) e a run (terminou).
//
// Sem repositório, o serviço é inerte: o servidor montado sem telemetria é exatamente o de
// antes, e é assim que a suíte inteira que já existia continua sem saber que isto existe.
//
// Medir nunca pode custar a partida: nenhum verbo lança. Uma falha de banco aqui vira uma
// linha a menos no relatório, não uma run recusada.

export interface Telemetria {
  sessao(playerId: string): Promise<void>;
  missaoIniciada(evento: { playerId: string; missionId: string; nonce: string }): Promise<void>;
  missaoTerminada(evento: { nonce: string; outcome: MissionOutcome; rounds: number }): Promise<void>;
}

export function createTelemetria(repository: TelemetryRepository | undefined, now: () => number): Telemetria {
  if (!repository) {
    return {
      async sessao() {},
      async missaoIniciada() {},
      async missaoTerminada() {},
    };
  }

  const recusou = async (playerId: string) => (await repository.getAccount(playerId)).optOut;
  const semCustar = (promessa: Promise<unknown>) => promessa.then(() => undefined, () => undefined);

  return {
    async sessao(playerId) {
      await semCustar((async () => {
        if (await recusou(playerId)) return;
        await repository.touchLastSeen(playerId, now());
      })());
    },
    async missaoIniciada({ playerId, missionId, nonce }) {
      await semCustar((async () => {
        if (await recusou(playerId)) return;
        await repository.recordIssued({ playerId, missionId, nonce, issuedAt: now() });
      })());
    },
    async missaoTerminada({ nonce, outcome, rounds }) {
      // Sem checar a recusa: uma conta que recusou não tem linha aberta (o ticket não gravou),
      // e `recordFinished` não inventa linha. Checar de novo seria uma leitura a mais e a
      // mesma resposta.
      await semCustar(repository.recordFinished(nonce, { finishedAt: now(), outcome, rounds }));
    },
  };
}

export interface TelemetryRoutesOptions {
  readonly repository: TelemetryRepository;
}

// `GET /me/telemetry` é a DECLARAÇÃO e a escolha; `PUT` muda a escolha. Recusar apaga o que já
// foi coletado, não só para de gravar — "pode recusar" que deixa o passado no banco é recusa
// pela metade. O log de requisição do M19 fica fora disto (é operação, não medição de jogo).
export const telemetryRoutes: FastifyPluginAsync<TelemetryRoutesOptions> = async (fastify, opts) => {
  const resposta = (optOut: boolean) => ({ optOut, collected: [...CAMPOS_COLETADOS] });

  fastify.get('/me/telemetry', async (request, reply) => {
    if (!request.player) return reply.code(401).send({ error: 'missing platform ticket' });
    const conta = await opts.repository.getAccount(request.player.id);
    return resposta(conta.optOut);
  });

  fastify.put('/me/telemetry', async (request, reply) => {
    if (!request.player) return reply.code(401).send({ error: 'missing platform ticket' });
    const body = (request.body ?? {}) as { optOut?: unknown };
    if (typeof body.optOut !== 'boolean') return reply.code(400).send({ error: 'optOut deve ser booleano' });

    if (body.optOut) await opts.repository.deletePlayerData(request.player.id);
    await opts.repository.setOptOut(request.player.id, body.optOut);
    return resposta(body.optOut);
  });
};
