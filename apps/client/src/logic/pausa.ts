import type { TelaDoJogo } from './tela.js';

// M35 9/N (adiantada a pedido do usuário) — o que o Esc faz.
//
// Dentro da missão só há o campo de batalha, e a saída mora num menu de pausa aberto pelo Esc.
// A regra é uma função pura pelo mesmo motivo de `telaDoJogo`: decisão que só existe no
// componente só se prova abrindo o navegador.
//
// A ordem é de "o que está por cima": o menu de Opções (que a pausa pode abrir) fecha primeiro;
// na batalha, o Esc abre ou fecha a pausa; fora dela não há o que pausar.
export type AcaoDoEsc = 'fecharOpcoes' | 'alternarPausa' | 'nada';

export interface EstadoDoEsc {
  readonly tela: TelaDoJogo;
  readonly opcoesAbertas: boolean;
  readonly pausaAberta: boolean;
}

export function acaoDoEsc(estado: EstadoDoEsc): AcaoDoEsc {
  if (estado.opcoesAbertas) return 'fecharOpcoes';
  if (estado.tela === 'batalha') return 'alternarPausa';
  return 'nada';
}
