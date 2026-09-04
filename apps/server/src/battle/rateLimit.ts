import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

// §9.4 — "anti-replay: nonce por partida + rate limiting."
//
// **M22, sub-sessão 3/N — a cobertura, e por que ela virou um hook.** Até aqui `tryConsume`
// era chamado dentro de seis rotas, e as seis eram de batalha. `POST /summon`,
// `POST /shop/purchase`, `POST /energy/purchase`, `POST /rewards/:id/claim` e as quatro de
// progressão não consumiam nada — ou seja, **as rotas que tocam a moeda comprável com
// dinheiro real eram justamente as abertas**. O nonce não cobre esse buraco: ele protege
// contra reenviar a MESMA requisição, não contra mandar mil DIFERENTES.
//
// Escrito por rota, o limite existe onde alguém lembrou de escrever. Escrito aqui, ele existe
// porque a requisição muda estado — e a rota que nascer amanhã já nasce coberta, sem depender
// de ninguém lembrar.
//
// **M22, 3/N — o limitador deixou de ser por processo.** Em memória ele conta por INSTÂNCIA:
// com dois processos atrás de um balanceador, o teto real vira o dobro do declarado, e com
// dez vira dez vezes. `createPostgresRateLimiter` (em `repository/postgresRepository.ts`)
// compartilha a contagem entre processos. A troca não exigiu tocar em rota nenhuma porque
// nenhuma rota chama o limitador — o hook chama.

export interface RateLimiterOptions {
  readonly maxRequests: number;
  readonly windowMs: number;
  readonly now?: () => number;
}

export interface RateLimiter {
  // true = permitido (consome uma cota); false = limite excedido.
  //
  // Pode ser assíncrono: a implementação compartilhada consulta o banco. Quem chama é um
  // hook só, então a assinatura mais larga não se espalha pelo servidor.
  tryConsume(key: string): boolean | Promise<boolean>;
}

export function createInMemoryRateLimiter(options: RateLimiterOptions): RateLimiter {
  const { maxRequests, windowMs } = options;
  const now = options.now ?? Date.now;
  const hitsByKey = new Map<string, number[]>();

  return {
    tryConsume(key) {
      const nowMs = now();
      const windowStart = nowMs - windowMs;
      const recentHits = (hitsByKey.get(key) ?? []).filter((t) => t > windowStart);

      if (recentHits.length >= maxRequests) {
        hitsByKey.set(key, recentHits);
        return false;
      }

      recentHits.push(nowMs);
      hitsByKey.set(key, recentHits);
      return true;
    },
  };
}

// Os métodos que MUDAM estado. `GET` não consome: ler a lista de masmorras mil vezes é
// desperdício de banda, não é ataque à economia — e limitar leitura tornaria a tela do
// jogador refém do limite que existe para proteger a carteira dele.
const METODOS_QUE_MUDAM = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

// **Dois baldes, e a razão é um defeito que a própria fatia 3/N criou.** Ao cobrir toda rota
// que muda estado com o balde único de produção (10 por minuto, um número calibrado quando
// só seis rotas de BATALHA consumiam), a preparação passou a caber no mesmo teto: editar o
// script tático de cinco heróis é um `PUT` por salvamento, e o jogador levaria 429 jogando
// normalmente. Aumentar o número global consertaria isso afrouxando justamente as rotas que
// a milestone existia para fechar.
//
// Então: um balde LARGO para o jogo (preparação, batalha, progressão) e um balde ESTREITO
// para as três rotas que movem a moeda comprável com dinheiro real. A chave leva o nome do
// balde porque a implementação compartilhada guarda as duas contagens na mesma tabela.
export const ROTAS_CARAS: ReadonlySet<string> = new Set([
  'POST /summon',
  'POST /shop/purchase',
  'POST /energy/purchase',
]);

export interface RateLimitPolicy {
  readonly padrao: RateLimiter;
  // Ausente = um balde só, que é o comportamento de quem monta o app sem política (todo o
  // resto da suíte). O servidor de produção monta os dois.
  readonly caro?: RateLimiter;
  readonly rotasCaras?: ReadonlySet<string>;
}

/**
 * Faz TODA requisição que muda estado consumir cota, no escopo em que for registrado.
 *
 * A chave é o jogador: o limite é por conta, e não por endereço IP — vários jogadores atrás
 * do mesmo provedor não podem se derrubar entre si.
 *
 * Requisição sem jogador não consome: ou é rota pública, ou vai levar 401 de qualquer jeito,
 * e gastar cota de uma conta que ainda não se sabe qual é seria gastar a cota errada.
 */
export function registerRateLimit(app: FastifyInstance, politica: RateLimiter | RateLimitPolicy): void {
  const { padrao, caro, rotasCaras } = 'tryConsume' in politica ? { padrao: politica, caro: undefined, rotasCaras: undefined } : politica;
  const caras = rotasCaras ?? ROTAS_CARAS;

  app.addHook('preHandler', async (request: FastifyRequest, reply: FastifyReply) => {
    if (!METODOS_QUE_MUDAM.has(request.method)) return;
    if (!request.player) return;

    const rota = `${request.method} ${request.routeOptions?.url ?? request.url}`;
    const cara = caro !== undefined && caras.has(rota);
    const limitador = cara ? caro : padrao;
    // O prefixo separa as contagens: sem ele, gastar a cota de preparação derrubaria a de
    // compra na implementação que guarda tudo numa tabela só.
    const chave = `${cara ? 'caro' : 'padrao'}:${request.player.id}`;

    if (!(await limitador.tryConsume(chave))) {
      return reply.code(429).send({ error: 'rate limit exceeded' });
    }
  });
}
