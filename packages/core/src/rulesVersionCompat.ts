import { RULES_VERSION } from './rulesVersion.js';

// §3.3/§9.4 (M22, sub-sessão 1/N) — a POLÍTICA de compatibilidade de versão de regras.
//
// **Por que ela vira um módulo em vez de continuar sendo uma linha na rota.** Até aqui a
// comparação existia num lugar só (`battle/routes.ts`) e `POST /dungeons/:id/run`, que
// reexecuta comandos do cliente, não tinha campo nenhum para comparar — registrado como
// buraco desde o M17 5/N. Com o jogo sempre-online e no desktop, o mismatch deixou de matar
// só a arena: toda batalha faz round-trip, então ele mata o jogo inteiro, e o jogador fica
// semanas na mesma versão sem recarregar página nenhuma.
//
// **A política, decidida com o usuário: `N-1` NÃO é aceito.** O argumento é do próprio
// projeto — o servidor re-simula o replay e compara hash, e `rulesVersion` só muda quando
// uma fórmula muda (regra 11). Aceitar o cliente de ontem seria manter dois motores de regra
// vivos, e o resultado de uma partida passaria a depender de qual deles rodou. A resposta
// certa para a janela de rollout não é aceitar o cliente velho; é mandar atualizar — e é por
// isso que o corpo do erro carrega dado estruturado em vez de uma frase.

export const RULES_VERSION_MISMATCH_CODE = 'rules-version-mismatch';

export interface RulesVersionMismatch {
  readonly code: typeof RULES_VERSION_MISMATCH_CODE;
  // `missing` = o cliente não mandou versão nenhuma (cliente anterior à checagem);
  // `different` = mandou outra. A tela diz coisas diferentes para os dois, e derivar um do
  // outro no cliente exigiria saber qual versão "não mandar" significa.
  readonly reason: 'missing' | 'different';
  readonly expected: string;
  readonly received: string | null;
}

/**
 * Confere a versão de regras que veio na requisição. `null` = compatível.
 *
 * Aceita `unknown` de propósito: o valor vem do corpo de uma requisição de rede, e um número
 * no lugar da string é entrada hostil — lançar aqui transformaria requisição inválida em erro
 * 500 do servidor.
 */
export function checkRulesVersion(received: unknown, expected: string = RULES_VERSION): RulesVersionMismatch | null {
  if (typeof received !== 'string' || received.length === 0) {
    return { code: RULES_VERSION_MISMATCH_CODE, reason: 'missing', expected, received: null };
  }
  if (received !== expected) {
    return { code: RULES_VERSION_MISMATCH_CODE, reason: 'different', expected, received };
  }
  return null;
}

/**
 * Diz se o corpo de um erro é o pedido de atualização.
 *
 * Reconhecido pelo CÓDIGO e nunca pela mensagem: mensagem é texto para humano, muda de
 * redação, e uma tela que depende dela para de aparecer sem nada ficar vermelho.
 */
export function isRulesVersionMismatch(body: unknown): body is RulesVersionMismatch {
  return (
    typeof body === 'object' &&
    body !== null &&
    (body as { code?: unknown }).code === RULES_VERSION_MISMATCH_CODE
  );
}
