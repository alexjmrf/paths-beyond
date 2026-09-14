import type { Primitive } from '../data/shapes.js';

// M32 — o que pintar de uma unidade cuja imagem ainda não chegou.
//
// `Texture.from(url)` em Pixi v8 lê do cache e devolve `undefined` para o que ainda não foi
// carregado. O tabuleiro não espera a rede para aparecer (decisão do M26: degradar é sempre um
// tabuleiro jogável, nunca uma tela vazia), então a primeira pintura pode encontrar sprites
// sem textura — e a resposta certa é pular SÓ o sprite, mantendo o HUD do M16 que o cerca
// (disco de lado, barra de HP, pips, plaqueta). Quando a imagem chega, o `redraw` seguinte
// troca o vazio pela peça.
//
// É uma função pura, e não um `if` dentro de `paintPrimitives`, pelo motivo de sempre: a
// versão sem isto lançava `TypeError` no primeiro quadro da batalha real e nenhum teste da
// suíte podia ver, porque `paintPrimitives` só existe dentro do Pixi.
export function primitivasPintaveis(
  primitives: readonly Primitive[],
  temTextura: (src: string) => boolean,
): readonly Primitive[] {
  return primitives.filter((p) => p.t !== 'sprite' || temTextura(p.src));
}
