// M26 — manter a unidade selecionada dentro da janela do tabuleiro.
//
// O tile subiu de 36 para 64 (a decisão do usuário na medição de 1/N, tomada sabendo o preço),
// e com isso o tabuleiro deixou de caber inteiro na tela nas escalas maiores de §11: um mapa
// 20×15 a 175% pede 2240px. As duas saídas eram cortar as escalas de acessibilidade — que é
// requisito duro de §11 — ou o tabuleiro rolar. Rolar não custa requisito nenhum; custa este
// arquivo.
//
// **O que ele impede é o defeito que a rolagem cria sozinha:** o jogador clica numa unidade da
// lista de iniciativa, ela é selecionada fora da janela, e o tabuleiro não muda — a seleção
// vira invisível. §1.1 põe legibilidade tática entre os pilares, e uma peça selecionada que não
// se vê falha esse pilar de um jeito pior que o glifo genérico falhava.
//
// A conta é PURA, pelo mesmo motivo de `motion.ts` (M16 3/N) e do `unitRenderer` (M16 1/N):
// quem tem `scrollLeft` é o `MapCanvas`, e a regra de enquadramento se afirma em teste sem
// browser.

export interface Janela {
  readonly scrollLeft: number;
  readonly scrollTop: number;
  readonly largura: number; // o quanto da janela se vê
  readonly altura: number;
  readonly conteudoLargura: number; // o tabuleiro inteiro
  readonly conteudoAltura: number;
}

export interface Alvo {
  readonly px: number; // canto superior esquerdo do tile, em pixels de canvas
  readonly py: number;
  readonly size: number;
}

export interface Rolagem {
  readonly scrollLeft: number;
  readonly scrollTop: number;
}

/**
 * Para onde rolar para o tile do alvo ficar visível, com `margemTiles` de folga em volta.
 *
 * Três propriedades, e cada uma existe por um motivo:
 *
 *   - **não mexe se já está visível.** Reenquadrar a cada clique faria o tabuleiro dar
 *     pequenos saltos enquanto o jogador só olha em volta, e o salto custa mais atenção que o
 *     reenquadramento economiza;
 *   - **move o MÍNIMO.** Centralizar o alvo jogaria fora o contexto que o jogador estava
 *     lendo; num jogo tático o que está em volta da peça é metade da decisão;
 *   - **nunca sai do conteúdo.** Rolar além da borda mostraria faixa vazia, e num tabuleiro a
 *     faixa vazia se lê como "acabou o mapa".
 */
export function rolagemParaEnquadrar(janela: Janela, alvo: Alvo, margemTiles = 1): Rolagem {
  const margem = alvo.size * margemTiles;

  function eixo(scroll: number, janelaTamanho: number, conteudo: number, inicio: number, tamanho: number): number {
    // Janela maior que o conteúdo: não há o que rolar, e qualquer valor diferente de 0 seria
    // uma faixa vazia de um lado.
    if (janelaTamanho >= conteudo) return 0;

    const max = conteudo - janelaTamanho;
    const min = inicio + tamanho + margem - janelaTamanho; // para a borda direita/inferior caber
    const maxDesejado = inicio - margem; // para a borda esquerda/superior caber

    let alvoScroll = scroll;
    if (scroll > maxDesejado) alvoScroll = maxDesejado;
    else if (scroll < min) alvoScroll = min;

    return Math.max(0, Math.min(max, Math.round(alvoScroll)));
  }

  return {
    scrollLeft: eixo(janela.scrollLeft, janela.largura, janela.conteudoLargura, alvo.px, alvo.size),
    scrollTop: eixo(janela.scrollTop, janela.altura, janela.conteudoAltura, alvo.py, alvo.size),
  };
}
