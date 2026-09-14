import type { Side } from '@paths-beyond/core';

// M35 1/N (D44) — o que a barra de ação oferece para a unidade selecionada, por lado.
//
// Visto com sessão de verdade (M32 2/N): selecionar o inimigo abria os cinco botões da
// unidade do jogador. O core recusaria o comando, mas a tela OFERECIA — harness. O inimigo
// selecionado mostra a ficha (HP, AP/PP, alcance) e nenhuma ação; as skills de mapa seguem a
// mesma regra e são tratadas junto no componente (elas são ação).
export const ACOES_DO_JOGADOR = ['esperar', 'descansar', 'editarTaticas', 'inventario', 'talentos'] as const;

export type AcaoDaUnidade = (typeof ACOES_DO_JOGADOR)[number];

export function acoesDaUnidade(side: Side): readonly AcaoDaUnidade[] {
  return side === 'player' ? ACOES_DO_JOGADOR : [];
}
