import { describe, expect, it } from 'vitest';
import { primitivasPintaveis } from '../src/logic/spriteSemTextura.js';
import type { Primitive } from '../src/data/shapes.js';

// M32 — a primeira pintura de uma unidade cuja imagem ainda não chegou.
//
// **O defeito, visto na tela com sessão de verdade.** `Texture.from(url)` em Pixi v8 lê do
// cache e devolve `undefined` para o que ainda não foi carregado; `paintPrimitives` fazia
// `textura.source` sem olhar, e o primeiro `redraw()` do tabuleiro lançava `TypeError`. Como
// o `Assets.load` vinha DEPOIS desse `redraw()` no mesmo callback, a imagem nunca era pedida,
// a peça inimiga nunca era desenhada, e o redraw seguinte, disparado pelo React, desmontava a
// árvore inteira — tela preta ao clicar na lista de iniciativa.
//
// **Por que só apareceu no M32.** Até o D38 o tabuleiro montava na carga da página com a
// batalha-fixture, cujas unidades não têm arte: o primeiro redraw passava, o cache enchia, e
// a batalha real que vinha depois já encontrava as texturas. Tirar o tabuleiro do hub fez a
// primeira montagem acontecer com `hero-jogador` no mapa, que tem sprite desde o M26.
//
// A decisão é pura: um sprite sem textura carregada é PULADO, e todo o resto da unidade (o
// disco de lado, a barra de HP, os pips, a plaqueta — o HUD do M16) continua a ser pintado.
// Degradar é uma peça sem imagem por um quadro; o que não pode acontecer é tela nenhuma.

const disco: Primitive = { t: 'circle', cx: 10, cy: 10, r: 8, fill: 0x2563eb };
const sprite: Primitive = { t: 'sprite', x: 0, y: 0, w: 20, h: 20, src: '/art/hero.png' };
const barraDeHp: Primitive = { t: 'rect', x: 0, y: 18, w: 20, h: 2, fill: 0x22c55e };
const plaqueta: Primitive = { t: 'text', x: 10, y: 22, text: 'A', size: 8, color: 0xffffff };

describe('primitivasPintaveis — sprite sem textura no cache (M32)', () => {
  it('pula o sprite cuja textura ainda não chegou e mantém o HUD inteiro, na ordem', () => {
    const resultado = primitivasPintaveis([disco, sprite, barraDeHp, plaqueta], () => false);
    expect(resultado).toEqual([disco, barraDeHp, plaqueta]);
  });

  it('mantém o sprite quando a textura está carregada', () => {
    const resultado = primitivasPintaveis([disco, sprite, barraDeHp], (src) => src === '/art/hero.png');
    expect(resultado).toEqual([disco, sprite, barraDeHp]);
  });

  it('só consulta o cache para sprites — forma e texto nunca dependem de rede', () => {
    const consultas: string[] = [];
    primitivasPintaveis([disco, barraDeHp, plaqueta], (src) => {
      consultas.push(src);
      return true;
    });
    expect(consultas).toEqual([]);
  });

  it('decide sprite a sprite: o que chegou é pintado, o que não chegou é pulado', () => {
    const outro: Primitive = { t: 'sprite', x: 0, y: 0, w: 20, h: 20, src: '/art/inimigo.png' };
    const resultado = primitivasPintaveis([sprite, outro], (src) => src === '/art/inimigo.png');
    expect(resultado).toEqual([outro]);
  });
});
