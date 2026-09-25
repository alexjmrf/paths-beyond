import { api, type DungeonRunResponse } from '../data/api.js';

// §9.4 (M22, sub-sessão 2/N) — o PEDIDO EM VOO.
//
// **O buraco, do lado do cliente.** O servidor passou a guardar a resposta por nonce, então
// reenviar a mesma requisição devolve a mesma run em vez de um 409. Só que reenviar exige
// ter o nonce — e o cliente jogava o dele fora: o nonce vinha do ticket, vivia numa variável
// da store, e uma queda de conexão (ou o jogo fechando) levava a única chave capaz de
// recuperar a run que já tinha sido cobrada.
//
// Guardar em `localStorage` e não em memória é o ponto inteiro: o caso que importa é o que
// derruba o processo. Um jogo que fecha no meio da submissão reabre sabendo o que perguntar.
//
// **Um pedido por vez, e isso é decisão.** As três rotas guardadas cobram recurso e as três
// terminam uma batalha; não existe fluxo neste jogo em que o jogador tenha duas em voo ao
// mesmo tempo. Uma fila daria mais casos para errar do que casos para resolver.
//
// **A arena entrou na auditoria do M22**, e pelo mesmo argumento das outras duas: ela também
// resolve no servidor, também grava replay e também mexe no ELO — cair no meio da submissão
// deixava o jogador sem saber se a partida valeu, com o ELO já mudado do outro lado.
//
// **M36 4/N (D47) — sobrou UMA rota, e o motivo de as outras três saírem é bom.** Elas eram as
// submissões de arena, masmorra e capítulo: uma requisição que cobrava recurso, resolvia a
// batalha inteira e devolvia o desfecho. Com a batalha viva não existe mais esse instante — o
// estado mora no servidor, cada comando é pequeno, e cair no meio deixou de ser um problema de
// idempotência para virar uma LEITURA (`GET /matches/current`, a reconexão de verdade).
//
// A VARREDURA ficou, e é a exceção que prova a regra: ela continua sendo um disparo só que cobra
// energia e devolve loot, porque nela não há cliente jogando. É exatamente o caso que este
// arquivo foi escrito para proteger.

const CHAVE = 'paths-beyond/pedido-em-voo';

export type PedidoEmVoo = {
  readonly rota: 'dungeon-sweep';
  readonly dungeonId: string;
  readonly corpo: { readonly nonce: string; readonly heroIds: readonly string[] };
};

export function guardarPedido(pedido: PedidoEmVoo): void {
  try {
    globalThis.localStorage?.setItem(CHAVE, JSON.stringify(pedido));
  } catch {
    // Armazenamento bloqueado (navegação privada, cookies desligados): o jogo continua, e o
    // que se perde é a recuperação — não a partida.
  }
}

export function limparPedido(): void {
  try {
    globalThis.localStorage?.removeItem(CHAVE);
  } catch {
    // idem
  }
}

export function lerPedido(): PedidoEmVoo | null {
  try {
    const bruto = globalThis.localStorage?.getItem(CHAVE);
    if (!bruto) return null;
    const pedido = JSON.parse(bruto) as PedidoEmVoo;
    // Conferido antes de virar requisição: o que está no armazenamento pode ter sido escrito
    // por uma versão anterior do jogo, e reenviar lixo com um nonce de verdade seria pior
    // que não reenviar nada.
    // M36 4/N — as três rotas antigas (`arena-battle`, `dungeon-run`, `campaign-run`) não
    // existem mais. Um pedido gravado por uma versão anterior do jogo cai aqui e é DESCARTADO,
    // que é o comportamento certo: reenviá-lo bateria num 404, e o que ele protegia virou a
    // reconexão de `GET /matches/current`.
    if (
      pedido?.rota === 'dungeon-sweep' &&
      typeof pedido.dungeonId === 'string' &&
      typeof pedido.corpo?.nonce === 'string'
    ) {
      return pedido;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Reenvia o pedido que ficou em voo, se houver.
 *
 * **O reenvio é o MESMO corpo, com o mesmo nonce** — é isso que faz o servidor devolver a
 * run original em vez de cobrar de novo. Devolve `null` quando não havia nada pendente.
 *
 * O pedido só é limpo quando o servidor RESPONDE (com sucesso ou com recusa definitiva): uma
 * falha de rede no reenvio deixa o pedido guardado para a próxima tentativa, que é o cenário
 * de quem está com a internet oscilando.
 */
export async function reenviarPedidoPendente(
  ticket: string,
): Promise<{ readonly pedido: PedidoEmVoo; readonly resposta: DungeonRunResponse } | null> {
  const pedido = lerPedido();
  if (!pedido) return null;

  const resposta = await api.reenviarVarredura(ticket, pedido.dungeonId, pedido.corpo);
  limparPedido();
  return { pedido, resposta };
}
