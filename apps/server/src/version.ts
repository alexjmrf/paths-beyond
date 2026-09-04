import { checkRulesVersion } from '@paths-beyond/core';
import type { FastifyReply } from 'fastify';

// §3.3/§9.4 (M22, sub-sessão 1/N) — a recusa por VERSÃO, num lugar só.
//
// Antes disto a comparação era uma linha dentro de `battle/routes.ts` e as duas outras rotas
// que reexecutam comandos do cliente — `POST /dungeons/:id/run` (registrado no M17 5/N) e
// `POST /campaign/:id/run` (que nasceu no M18 4/N, depois do roadmap ser escrito) — não
// comparavam nada. As três reexecutam comandos contra o motor deste servidor: se o cliente
// jogou com outra versão de regras, o replay não descreve a mesma partida.
//
// **O corpo do erro carrega dado estruturado além da frase.** A frase é para log e para
// humano; quem precisa DECIDIR é o cliente, e decidir por texto de mensagem é decidir por
// algo que muda de redação sem ninguém perceber. O código vem do core, então quem recusa e
// quem reconhece a recusa leem a mesma constante.
//
// A política em si (`N-1` não é aceito) mora em `packages/core/src/rulesVersionCompat.ts`,
// com o argumento.

/**
 * Recusa a requisição se a versão de regras não for exatamente a deste servidor.
 *
 * Devolve `true` quando já respondeu — o chamador só precisa sair.
 */
export function rejectOnRulesVersion(reply: FastifyReply, received: unknown): boolean {
  const mismatch = checkRulesVersion(received);
  if (!mismatch) return false;

  reply.code(409).send({
    error: `rulesVersion incompatível (esperado ${mismatch.expected})`,
    ...mismatch,
  });
  return true;
}
