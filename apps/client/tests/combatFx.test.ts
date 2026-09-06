import type { WeaponType } from '@paths-beyond/core';
import { describe, expect, it } from 'vitest';
import { fxDeCritico, fxDeDesfecho, fxDeGolpe } from '../src/data/combatFx.js';
import { boundsOf, placeShapes, primitiveBounds, type NormShape } from '../src/data/shapes.js';

// M26 2/N — o vocabulário de efeitos de combate.
//
// **O que este arquivo protege é a razão de o efeito existir.** A bateria de 1/N mediu que os
// quadros gerados perdem a arma (D27), e §6.1 faz a arma decidir o alcance no duelo: se os sete
// golpes se desenharem parecido, a camada de efeito não resolve nada — ela só troca um borrão
// generativo por um borrão programático.
//
// As duas propriedades são opostas e as duas importam: os sete se DISTINGUEM entre si, e todos
// se comportam igual quanto a caber, escalar e não depender de cor.

const ARMAS: readonly WeaponType[] = ['sword', 'axe', 'spear', 'bow', 'arcane', 'nature', 'holy'];

// Só a GEOMETRIA. É como se afirma que duas coisas se distinguem sem depender de cor nenhuma —
// a garantia de M13 4/N, aplicada ao dado novo. Repare que o `placeShapes` recebe a MESMA
// tinta nos dois lados da comparação: o que sobra de diferença é forma.
function geometria(shapes: readonly NormShape[]): string {
  return JSON.stringify(
    placeShapes(shapes, { x: 0, y: 0, size: 100 }, { ink: 0xffffff, strokeWidth: 2 }).map((p) =>
      p.t === 'circle' ? ['circle', p.cx, p.cy, p.r] : p.t === 'poly' ? ['poly', p.points, p.closed ?? false] : [p.t],
    ),
  );
}

describe('o golpe de cada arma', () => {
  it('as sete armas têm efeito próprio, e nenhuma repete outra', () => {
    // Sem isto, a camada de efeito não devolveria a identidade que os quadros gerados perderam
    // — ela só mudaria o lugar onde ela se perde.
    const desenhos = ARMAS.map((a) => geometria(fxDeGolpe(a)));
    expect(new Set(desenhos).size).toBe(ARMAS.length);
  });

  it('sem arma resolvida ainda sai um golpe — PvP e masmorra não recebem `weaponType`', () => {
    // O `BattleSetup` de PvP, masmorra e replay vem pronto do servidor. Um golpe invisível ali
    // seria a animação afirmando que não aconteceu nada.
    expect(fxDeGolpe(undefined).length).toBeGreaterThan(0);
  });

  it('o golpe genérico não é igual a nenhum dos sete — ele se declara como fallback', () => {
    const generico = geometria(fxDeGolpe(undefined));
    for (const a of ARMAS) expect(geometria(fxDeGolpe(a)), a).not.toBe(generico);
  });

  it('lança e espada se distinguem por RETA contra CURVA, não por tamanho', () => {
    // O par mais perigoso do vocabulário: as duas são armas de corpo a corpo de uma linha só.
    // Se elas se distinguissem só por comprimento, a 64px viravam a mesma coisa.
    const lanca = fxDeGolpe('spear');
    const espada = fxDeGolpe('sword');
    const pontosDaMaiorLinha = (shapes: readonly NormShape[]) =>
      Math.max(...shapes.filter((s) => s.t === 'poly').map((s) => (s as { points: readonly number[] }).points.length / 2));
    // A espada é uma polilinha de 4 pontos (arco); a lança é uma reta de 2.
    expect(pontosDaMaiorLinha(espada)).toBeGreaterThan(pontosDaMaiorLinha(lanca));
  });

  it('nenhum efeito transborda a caixa que recebe', () => {
    // Mesma exigência que o glifo tem desde M16: o efeito é desenhado numa caixa, e sair dela
    // significa invadir o painel ao lado na cena de duelo, ou o tile vizinho no tabuleiro.
    for (const shapes of [...ARMAS.map(fxDeGolpe), fxDeGolpe(undefined), fxDeCritico(),
      fxDeDesfecho('miss'), fxDeDesfecho('heal'), fxDeDesfecho('death')]) {
      const caixa = boundsOf(shapes);
      expect(caixa.minX).toBeGreaterThanOrEqual(0);
      expect(caixa.minY).toBeGreaterThanOrEqual(0);
      expect(caixa.maxX).toBeLessThanOrEqual(1);
      expect(caixa.maxY).toBeLessThanOrEqual(1);
    }
  });

  it('posicionado, continua dentro da caixa — contando a espessura do traço', () => {
    // `primitiveBounds` conta meia espessura para cada lado, porque o traço é centrado na
    // linha. Foi assim que a hachura de terreno transbordou de M13 a M15.
    const caixa = { x: 40, y: 80, size: 120 };
    for (const a of ARMAS) {
      for (const p of placeShapes(fxDeGolpe(a), caixa, { ink: 0xffffff, strokeWidth: 3 })) {
        const b = primitiveBounds(p);
        expect(b.minX, a).toBeGreaterThanOrEqual(caixa.x - 2);
        expect(b.maxX, a).toBeLessThanOrEqual(caixa.x + caixa.size + 2);
        expect(b.minY, a).toBeGreaterThanOrEqual(caixa.y - 2);
        expect(b.maxY, a).toBeLessThanOrEqual(caixa.y + caixa.size + 2);
      }
    }
  });

  it('escala com a caixa: a mesma declaração serve o tile de 64 e a cena de duelo', () => {
    // A propriedade que faz um vocabulário só servir o tabuleiro e a cena de duelo, que é
    // quatro vezes maior: dobrar a caixa dobra o desenho, sem uma declaração a mais.
    // Compara as COORDENADAS, e não a caixa: a caixa carrega meia espessura de traço, e a
    // espessura tem piso de 1px (`placeShapes`), que de propósito NÃO escala — um traço de
    // meio pixel não se desenha. Medir a caixa mediria esse piso e não o desenho.
    const coords = (size: number) =>
      placeShapes(fxDeGolpe('sword'), { x: 0, y: 0, size }, { ink: 1, strokeWidth: 1 }).flatMap((p) =>
        p.t === 'poly' ? [...p.points] : p.t === 'circle' ? [p.cx, p.cy, p.r] : [],
      );

    const pequeno = coords(64);
    const grande = coords(256);
    expect(grande.length).toBe(pequeno.length);
    for (let i = 0; i < pequeno.length; i++) expect(grande[i]).toBeCloseTo(pequeno[i]! * 4, 6);
  });
});

describe('os desfechos que não são o golpe', () => {
  it('esquiva, cura e morte se distinguem entre si e de todo golpe', () => {
    // §8 dá à `spd` exatamente três benefícios, e a evasão com teto é um deles: se a esquiva se
    // desenhar como um golpe, o jogador lê "apanhou" onde o core disse "desviou".
    const todos = [
      ...ARMAS.map((a) => geometria(fxDeGolpe(a))),
      geometria(fxDeGolpe(undefined)),
      geometria(fxDeDesfecho('miss')),
      geometria(fxDeDesfecho('heal')),
      geometria(fxDeDesfecho('death')),
      geometria(fxDeCritico()),
    ];
    expect(new Set(todos).size).toBe(todos.length);
  });

  it('a cura é simétrica nos dois eixos — curar não aponta para lugar nenhum', () => {
    // A propriedade que a separa de todo golpe de um jeito que sobrevive a qualquer escala:
    // todo golpe tem direção, e a cura não tem.
    const caixa = boundsOf(fxDeDesfecho('heal'));
    expect(caixa.minX + caixa.maxX).toBeCloseTo(1, 1);
    expect(caixa.minY + caixa.maxY).toBeCloseTo(1, 1);
  });

  it('o crítico é ADITIVO: ele não substitui o golpe da arma', () => {
    // Se o crítico substituísse, "crítico de espada" e "crítico de machado" virariam a mesma
    // coisa — e o jogador perderia a arma justamente no golpe que mais importa.
    const critico = geometria(fxDeCritico());
    for (const a of ARMAS) expect(geometria(fxDeGolpe(a)), a).not.toBe(critico);
  });

  it('é puro: a mesma pergunta devolve o mesmo desenho', () => {
    expect(fxDeGolpe('axe')).toEqual(fxDeGolpe('axe'));
    expect(fxDeDesfecho('miss')).toEqual(fxDeDesfecho('miss'));
  });

  it('nenhuma forma carrega cor — a tinta é do tema, não do efeito', () => {
    // É o que mantém a garantia de M13 4/N: quem distingue é a forma, e o modo daltônico não
    // precisa saber que esta camada existe.
    const todas = [...ARMAS.map(fxDeGolpe), fxDeGolpe(undefined), fxDeCritico(),
      fxDeDesfecho('miss'), fxDeDesfecho('heal'), fxDeDesfecho('death')].flat();
    for (const forma of todas) {
      expect(Object.keys(forma).some((k) => /color|fill$|ink|stroke/i.test(k)), JSON.stringify(forma)).toBe(false);
    }
  });
});
