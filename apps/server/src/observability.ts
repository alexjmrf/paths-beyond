import type { FastifyInstance } from 'fastify';

// M19 — LOG ESTRUTURADO por requisição.
//
// O servidor inteiro tinha **nenhuma linha de log de requisição**: `Fastify()` era criado sem
// logger, e as únicas chamadas a `console` do pacote estavam no `devServer` e no `migrate`.
// Enquanto ele era um árbitro de arena isso era só desconforto; com o servidor sendo a única
// fonte de verdade sobre economia e moeda, uma falha em produção era **invisível** — nada
// registrava quem pediu o quê nem como terminou.
//
// O que é registrado, e por quê cada campo: `playerId` porque toda investigação real começa
// em "o jogador X diz que perdeu Y"; `statusCode` porque é o desfecho; `durationMs` porque
// degradação aparece antes da falha; `reqId` porque é o que costura as linhas de uma mesma
// requisição.
//
// **Não registra corpo de requisição nem resposta**, e é decisão: eles carregam o token de
// autenticação (§9.4) e o estado inteiro de batalha. Log que vaza credencial é pior que log
// nenhum, e um `BattleSetup` por linha tornaria o log ilegível justamente no dia em que ele
// precisa ser lido.
//
// Um hook `onResponse` e não `onRequest`: só ao fim existe desfecho para registrar, e o par
// pedido/resposta em duas linhas obrigaria a costurá-las para responder qualquer pergunta.

export interface RequestLogLine {
  readonly level: 'info' | 'warn' | 'error';
  readonly msg: 'request';
  readonly reqId: string;
  readonly method: string;
  readonly url: string;
  readonly statusCode: number;
  // Ausente em rota pública (`/health`) e em requisição recusada por falta de token — nos
  // dois casos não HÁ jogador, e inventar um placeholder faria o log mentir.
  readonly playerId?: string;
  readonly durationMs: number;
}

// O nível sai do desfecho: 5xx é falha nossa, 4xx é recusa esperada (saldo insuficiente,
// nonce repetido, posse ausente) e não deve acordar ninguém, e o resto é rotina.
function levelFor(statusCode: number): RequestLogLine['level'] {
  if (statusCode >= 500) return 'error';
  if (statusCode >= 400) return 'warn';
  return 'info';
}

export interface ObservabilityOptions {
  // Injetável pelo mesmo motivo que `now` e `newNonce` são (M14/M15): o teste precisa LER as
  // linhas em vez de confiar que elas saíram, e produção não quer um array crescendo em RAM.
  readonly sink?: (line: RequestLogLine) => void;
}

export function registerRequestLogging(app: FastifyInstance, options: ObservabilityOptions = {}): void {
  const sink = options.sink ?? ((line: RequestLogLine) => console.log(JSON.stringify(line)));

  app.addHook('onResponse', async (request, reply) => {
    const playerId = request.player?.id;

    sink({
      level: levelFor(reply.statusCode),
      msg: 'request',
      reqId: String(request.id),
      method: request.method,
      url: request.url,
      statusCode: reply.statusCode,
      ...(playerId ? { playerId } : {}),
      // `elapsedTime` é do próprio Fastify: medir por conta própria com `Date.now()` daria
      // um número que não bate com o que o servidor considera a duração da requisição.
      durationMs: Math.round(reply.elapsedTime),
    });
  });
}
