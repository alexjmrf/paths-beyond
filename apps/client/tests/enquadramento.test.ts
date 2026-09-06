import { describe, expect, it } from 'vitest';
import { rolagemParaEnquadrar, type Janela } from '../src/logic/enquadramento.js';

// M26 — o tabuleiro que rola, e a peça selecionada que continua visível.
//
// O tile subiu para 64 e o tabuleiro deixou de caber inteiro nas escalas maiores de §11. Rolar
// foi a saída que não custa requisito de acessibilidade — mas rolar cria um defeito próprio: a
// unidade selecionada pode ficar fora da janela, e uma seleção invisível falha §1.1 pior do que
// o glifo genérico falhava.

const TILE = 64;

function janela(overrides: Partial<Janela> = {}): Janela {
  return {
    scrollLeft: 0,
    scrollTop: 0,
    largura: 10 * TILE,
    altura: 8 * TILE,
    conteudoLargura: 20 * TILE,
    conteudoAltura: 15 * TILE,
    ...overrides,
  };
}

const tile = (x: number, y: number) => ({ px: x * TILE, py: y * TILE, size: TILE });

describe('enquadrar a unidade selecionada', () => {
  it('não mexe quando a peça já está visível com folga', () => {
    // Reenquadrar a cada clique faria o tabuleiro dar pequenos saltos enquanto o jogador só
    // olha em volta, e o salto custa mais atenção do que o reenquadramento economiza.
    const j = janela();
    expect(rolagemParaEnquadrar(j, tile(4, 3))).toEqual({ scrollLeft: 0, scrollTop: 0 });
  });

  it('rola o MÍNIMO para trazer a peça de volta pela direita', () => {
    // Centralizar jogaria fora o contexto que o jogador estava lendo. Num jogo tático o que
    // está em volta da peça é metade da decisão.
    const j = janela();
    // A peça em x=12 começa em 768; a janela mostra 0..640. Precisa chegar a 768+64+64-640.
    expect(rolagemParaEnquadrar(j, tile(12, 3)).scrollLeft).toBe(256);
  });

  it('rola de volta pela esquerda quando a peça ficou para trás', () => {
    const j = janela({ scrollLeft: 500 });
    // Peça em x=6 começa em 384; com a margem quer scroll <= 320.
    expect(rolagemParaEnquadrar(j, tile(6, 3)).scrollLeft).toBe(320);
  });

  it('faz o mesmo nos dois eixos, e só no eixo que precisa', () => {
    const j = janela();
    const r = rolagemParaEnquadrar(j, tile(2, 12));
    expect(r.scrollLeft).toBe(0); // x já está visível: não mexe
    expect(r.scrollTop).toBeGreaterThan(0);
  });

  it('nunca rola além do conteúdo — faixa vazia se lê como "acabou o mapa"', () => {
    const j = janela();
    const r = rolagemParaEnquadrar(j, tile(19, 14));
    expect(r.scrollLeft).toBeLessThanOrEqual(j.conteudoLargura - j.largura);
    expect(r.scrollTop).toBeLessThanOrEqual(j.conteudoAltura - j.altura);
  });

  it('nunca rola para antes do começo', () => {
    const j = janela({ scrollLeft: 200, scrollTop: 200 });
    const r = rolagemParaEnquadrar(j, tile(0, 0));
    expect(r.scrollLeft).toBe(0);
    expect(r.scrollTop).toBe(0);
  });

  it('janela maior que o tabuleiro: não há o que rolar', () => {
    // O caso de hoje a 100% num monitor grande, e o caso que tem de continuar valendo: o
    // tabuleiro inteiro cabendo é o normal, e rolar seria mostrar faixa vazia de um lado.
    const j = janela({ largura: 30 * TILE, altura: 20 * TILE, scrollLeft: 0, scrollTop: 0 });
    expect(rolagemParaEnquadrar(j, tile(19, 14))).toEqual({ scrollLeft: 0, scrollTop: 0 });
  });

  it('a peça no canto extremo do mapa fica visível, mesmo sem caber a margem', () => {
    // A margem é um desejo, não uma promessa: no canto ela não cabe, e o que não pode faltar é
    // a peça.
    const j = janela();
    const r = rolagemParaEnquadrar(j, tile(19, 14));
    const alvo = tile(19, 14);
    expect(r.scrollLeft).toBeLessThanOrEqual(alvo.px);
    expect(r.scrollLeft + j.largura).toBeGreaterThanOrEqual(alvo.px + TILE);
    expect(r.scrollTop).toBeLessThanOrEqual(alvo.py);
    expect(r.scrollTop + j.altura).toBeGreaterThanOrEqual(alvo.py + TILE);
  });

  it('é idempotente: enquadrar de novo não move nada', () => {
    // Sem isto, o efeito do React que aplica a rolagem poderia oscilar entre dois valores a
    // cada quadro.
    const j = janela();
    const um = rolagemParaEnquadrar(j, tile(12, 12));
    const dois = rolagemParaEnquadrar({ ...j, ...um }, tile(12, 12));
    expect(dois).toEqual(um);
  });

  it('devolve inteiros: `scrollLeft` fracionário vira borrão de meio pixel', () => {
    const j = janela({ largura: 615, altura: 333 });
    const r = rolagemParaEnquadrar(j, tile(13, 11));
    expect(Number.isInteger(r.scrollLeft)).toBe(true);
    expect(Number.isInteger(r.scrollTop)).toBe(true);
  });

  it('a peça visível mas COLADA na borda é reenquadrada — a margem é o ponto', () => {
    // Sem margem, a unidade selecionada aparece pela metade do próprio contorno e o jogador não
    // vê o tile vizinho, que é para onde ela pode se mover.
    const j = janela({ scrollLeft: 0 });
    // Peça em x=9: ocupa 576..640, exatamente a borda da janela de 640.
    expect(rolagemParaEnquadrar(j, tile(9, 3)).scrollLeft).toBe(64);
  });
});
