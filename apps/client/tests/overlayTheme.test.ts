import { describe, expect, it } from 'vitest';
import {
  COLORBLIND_THEME,
  DEFAULT_THEME,
  INTENTIONAL_COLOR_PAIRS,
  UI_SCALES,
  isSupportedUiScale,
  meaningfulColors,
  themeFor,
  type OverlayTheme,
} from '../src/data/overlayTheme.js';

// M13, sub-sessão 4/N — §11 (acessibilidade): "modo daltônico nos overlays".
//
// "Modo daltônico" só quer dizer alguma coisa se for MEDIDO. Este arquivo simula
// deuteranopia e protanopia sobre cada cor que carrega significado no mapa (matrizes de
// Viénot–Brettel–Mollon 1999, aplicadas em RGB linear) e exige que todos os pares
// continuem distinguíveis depois da simulação.
//
// O teste também vira o método contra a paleta ANTIGA e exige que ela FALHE: um limiar que
// as duas paletas passam não estaria provando nada sobre a nova.
//
// M16 2/N: as matrizes e a distância saíram daqui para `tests/support/dicromacia.ts` sem uma
// conta mudar. O motivo é o critério de aceite 3 de M16 — a garantia é "REVERIFICADA, não
// assumida" —, e a linguagem visual nova (glifo sobre o corpo, marca sobre o terreno) precisa
// ser medida pelo MESMO método, em `classGlyphs.test.ts` e `terrainMarks.test.ts`. Três cópias
// das matrizes seriam três cópias divergindo em silêncio.

import {
  DEFICIENCIES,
  MIN_DISTANCE,
  distance,
  luminance,
  simulate,
  worstCaseDistance,
  type Deficiency,
} from './support/dicromacia.js';

function isIntentionalPair(a: string, b: string): boolean {
  return INTENTIONAL_COLOR_PAIRS.some(([x, y]) => (x === a && y === b) || (x === b && y === a));
}

interface Collision {
  readonly pair: string;
  readonly deficiency: Deficiency;
  readonly distance: number;
}

function collisionsIn(theme: OverlayTheme): readonly Collision[] {
  const colors = Object.entries(meaningfulColors(theme));
  const found: Collision[] = [];

  for (const deficiency of DEFICIENCIES) {
    for (let i = 0; i < colors.length; i++) {
      for (let j = i + 1; j < colors.length; j++) {
        const [nameA, colorA] = colors[i]!;
        const [nameB, colorB] = colors[j]!;
        if (isIntentionalPair(nameA, nameB)) continue;
        const d = distance(simulate(colorA, deficiency), simulate(colorB, deficiency));
        if (d < MIN_DISTANCE) found.push({ pair: `${nameA} × ${nameB}`, deficiency, distance: Math.round(d) });
      }
    }
  }
  return found;
}

describe('paleta do modo daltônico', () => {
  it('nenhum par de cores com significado colide sob deuteranopia ou protanopia', () => {
    const collisions = collisionsIn(COLORBLIND_THEME);
    expect(
      collisions.map((c) => `${c.pair} (${c.deficiency}, distância ${c.distance})`),
    ).toEqual([]);
  });

  it('a paleta padrão FALHA o mesmo limiar — é isso que faz o teste acima valer alguma coisa', () => {
    const collisions = collisionsIn(DEFAULT_THEME);
    expect(collisions.length).toBeGreaterThan(0);
    // Deixa registrado no relatório de teste o que exatamente era indistinguível antes.
    console.log(
      'colisões na paleta padrão:',
      collisions.map((c) => `${c.pair} [${c.deficiency}] d=${c.distance}`).join(' | '),
    );
  });

  it('as cores com significado continuam distinguíveis também SEM cor nenhuma (luminância)', () => {
    // Um overlay pode empilhar sobre outro; se dois véus tiverem a mesma luminância e a
    // mesma cor simulada, nada os separa. Aqui a exigência é mais fraca de propósito —
    // o que garante a distinção final é o padrão, testado abaixo.
    const terrains = Object.values(COLORBLIND_THEME.terrain).map(luminance).sort((a, b) => a - b);
    for (let i = 1; i < terrains.length; i++) {
      expect(terrains[i]! - terrains[i - 1]!).toBeGreaterThan(0.05);
    }
  });

  it('cada overlay de tile tem um padrão próprio no modo daltônico', () => {
    const patterns = [
      COLORBLIND_THEME.threat.pattern,
      COLORBLIND_THEME.move.pattern,
      COLORBLIND_THEME.targeting.pattern,
      COLORBLIND_THEME.objective.pattern,
    ];
    expect(patterns).not.toContain('none');
    expect(new Set(patterns).size).toBe(patterns.length);
  });

  it('os dois lados têm formas diferentes no modo daltônico, e iguais no padrão', () => {
    expect(COLORBLIND_THEME.sides.player.shape).not.toBe(COLORBLIND_THEME.sides.enemy.shape);
    expect(DEFAULT_THEME.sides.player.shape).toBe(DEFAULT_THEME.sides.enemy.shape);
  });

  it('a paleta padrão fica byte a byte como era antes desta fatia', () => {
    // Quem não liga o modo não pode ver diferença nenhuma: o mapa de M6–M12 continua igual.
    expect(DEFAULT_THEME.threat).toEqual({ color: 0xef4444, alpha: 0.22, pattern: 'none' });
    expect(DEFAULT_THEME.move).toEqual({ color: 0x60a5fa, alpha: 0.4, pattern: 'none' });
    expect(DEFAULT_THEME.targeting).toEqual({ color: 0xa855f7, alpha: 0.3, pattern: 'none' });
    expect(DEFAULT_THEME.objective.color).toBe(0xfacc15);
    expect(DEFAULT_THEME.sides.player.color).toBe(0x3b82f6);
    expect(DEFAULT_THEME.sides.enemy.color).toBe(0xdc2626);
    expect(DEFAULT_THEME.terrain).toEqual({
      'terrain-planicie': 0x8fbc5a,
      'terrain-floresta': 0x2f5d34,
      'terrain-montanha': 0x8a8a86,
    });
  });

  it('`themeFor` devolve a paleta certa', () => {
    expect(themeFor(false)).toBe(DEFAULT_THEME);
    expect(themeFor(true)).toBe(COLORBLIND_THEME);
  });
});

// M16, sub-sessão 2/N — os tokens. A sub-sessão 1/N deixou esta peça de fora DE PROPÓSITO
// ("inventar estrutura sem consumidor é o antipadrão que M10/M11/M15 passaram o projeto
// corrigindo"); ela entra agora, junto de quem a usa: o glifo, a marca de terreno, os pips de
// efeito e a barra de HP. Nenhuma cor de significado das duas paletas mudou — o teste
// "byte a byte" acima continua sendo a trava disso.
describe('tokens da linguagem visual', () => {
  const paletas = [DEFAULT_THEME, COLORBLIND_THEME] as const;

  it('as duas paletas declaram o bloco inteiro — nenhuma herda nada por omissão', () => {
    const chaves = [
      'unitInset',
      'glyphBoxRatio',
      'glyphStrokeRatio',
      'glyphOffsetY',
      'glyphInk',
      'labelPlate',
      'labelPlateAlpha',
      'pipRatio',
      'buffInk',
      'debuffInk',
      'hpBarRatio',
      'hpTrack',
      'hpInk',
      'hpCriticalInk',
      'hpCriticalAt',
      'terrainMarkInkLight',
      'terrainMarkInkDark',
      'terrainMarkAlpha',
    ];
    for (const tema of paletas) {
      expect(Object.keys(tema.tokens).sort(), tema.id).toEqual([...chaves].sort());
    }
  });

  it('o glifo cabe dentro do corpo da unidade, e não só dentro do tile', () => {
    // O corpo é um disco de raio `size/2 - unitInset`. Um glifo maior que a caixa inscrita
    // vaza pelas quinas do disco e se lê como sujeira em volta da unidade, não como forma.
    // A conta tem de contar as duas coisas que o desenho real tem: o deslocamento vertical
    // (`glyphOffsetY`, que abre espaço para o rótulo de AP/PP) e meia espessura de traço.
    const tile = 36;
    for (const tema of paletas) {
      const r = tile / 2 - tema.tokens.unitInset;
      const meio = (tile * tema.tokens.glyphBoxRatio) / 2 + (tile * tema.tokens.glyphStrokeRatio) / 2;
      const deslocamento = tile * tema.tokens.glyphOffsetY;

      for (const dy of [deslocamento - meio, deslocamento + meio]) {
        for (const dx of [-meio, meio]) {
          expect(Math.hypot(dx, dy), `${tema.id} canto (${dx}, ${dy})`).toBeLessThanOrEqual(r);
        }
      }
      // E não pode ser irrelevante: um glifo de 4px num tile de 36 não diz nada.
      expect(tile * tema.tokens.glyphBoxRatio, tema.id).toBeGreaterThan(tile * 0.3);
    }
  });

  it('o glifo começa ABAIXO da plaqueta de AP/PP', () => {
    // O invariante de paleta por trás do defeito visto em navegador nesta fatia: com o glifo
    // centrado, o número caía em cima dele. Vale nas duas escalas extremas de §11, porque o
    // rótulo escala com a UI e o tile também — se os dois crescessem em ritmos diferentes, a
    // colisão voltaria só numa delas.
    for (const escala of [UI_SCALES[0]!, UI_SCALES[UI_SCALES.length - 1]!]) {
      const tile = Math.round(36 * escala);
      const alturaDaPlaqueta = Math.round(Math.round(10 * escala) * 1.2);
      for (const tema of paletas) {
        const topoDoGlifo =
          tile / 2 - (tile * tema.tokens.glyphBoxRatio) / 2 + tile * tema.tokens.glyphOffsetY -
          (tile * tema.tokens.glyphStrokeRatio) / 2;
        expect(topoDoGlifo, `${tema.id} em ${escala}x`).toBeGreaterThanOrEqual(alturaDaPlaqueta);
      }
    }
  });

  it('todo traço tem pelo menos 1px na menor escala', () => {
    // §11 oferece escalas de 100% a 175%. Na menor, um traço arredondado para zero some.
    const menorTile = 36 * UI_SCALES[0]!;
    for (const tema of paletas) {
      expect(Math.round(menorTile * tema.tokens.glyphStrokeRatio), tema.id).toBeGreaterThanOrEqual(1);
      expect(Math.round(menorTile * tema.tokens.pipRatio), tema.id).toBeGreaterThanOrEqual(2);
      expect(Math.round(menorTile * tema.tokens.hpBarRatio), tema.id).toBeGreaterThanOrEqual(2);
    }
  });

  it('a barra de HP é legível contra o próprio trilho, inclusive sob dicromacia', () => {
    // Comprimento é o canal principal, mas comprimento só se lê contra um trilho visível.
    for (const tema of paletas) {
      expect(Math.round(worstCaseDistance(tema.tokens.hpInk, tema.tokens.hpTrack)), tema.id).toBeGreaterThan(
        MIN_DISTANCE,
      );
      expect(Math.round(worstCaseDistance(tema.tokens.hpCriticalInk, tema.tokens.hpTrack)), tema.id).toBeGreaterThan(
        MIN_DISTANCE,
      );
    }
  });

  it('o limiar de HP crítico é uma fração de verdade', () => {
    for (const tema of paletas) {
      expect(tema.tokens.hpCriticalAt, tema.id).toBeGreaterThan(0);
      expect(tema.tokens.hpCriticalAt, tema.id).toBeLessThan(1);
    }
  });
});

// M16, sub-sessão 3/N — o critério de aceite 3 diz "a garantia de daltonismo de M13 4/N
// continua valendo e é REVERIFICADA, não assumida". A fatia da animação é o caso em que
// "assumida" seria mais tentador: movimento não tem cor, então seria fácil declarar que não há
// o que medir. Só que a fatia PÔS TINTA NA TELA (o número de dano flutuante), e a pergunta
// certa não é "mudei a paleta?" e sim "entrou tinta nova sem passar pela medição?".
describe('reverificação da garantia de daltonismo (M16 3/N)', () => {
  const paletas = [DEFAULT_THEME, COLORBLIND_THEME] as const;

  it('o registro de cores com significado é exatamente este — nada entrou por fora', () => {
    // A trava é o registro, não a paleta: `meaningfulColors` é a lista sobre a qual a simulação
    // de dicromacia mede, e o modo provável de a garantia se perder é uma cor nova ser
    // desenhada no mapa sem entrar aqui. Congelar a lista faz uma entrada nova ter de ser
    // deliberada — e, sendo deliberada, ela passa pelo teste de colisão logo acima.
    for (const tema of paletas) {
      expect(Object.keys(meaningfulColors(tema)).sort(), tema.id).toEqual(
        [
          'ameaça',
          'movimento',
          'mira',
          'objetivo',
          'unidade do jogador',
          'unidade inimiga',
          'anel de seleção',
          'anel de engajável',
          'terreno: planície',
          'terreno: floresta',
          'terreno: montanha',
          'estrutura',
        ].sort(),
      );
    }
  });

  it('a animação não gastou uma cor nova: o número de dano se lê pelo contorno', () => {
    // Decisão desta fatia, e é o que a mantém dentro da garantia: o número de dano é branco com
    // contorno na tinta da plaqueta de AP/PP. A matiz já está toda ocupada com significado desde
    // M13 4/N (ameaça, movimento, mira, objetivo, os dois lados) — pintar o dano de vermelho
    // colidiria com a ameaça sob deuteranopia, e é uma colisão sobre um número que voa por cima
    // de qualquer tile do mapa. O que o número precisa dizer está ESCRITO nele.
    //
    // O que dá para medir, então, é o que de fato o separa do fundo: o contorno contra o miolo.
    for (const tema of paletas) {
      expect(Math.round(worstCaseDistance(0xffffff, tema.tokens.labelPlate)), tema.id).toBeGreaterThan(MIN_DISTANCE);
    }
  });

  it('o contorno do número contrasta com todo terreno e com os dois lados', () => {
    // O número voa por cima da peça e do chão. Se o contorno se confundisse com o que está
    // embaixo, sobraria o branco do miolo sozinho — e branco sozinho sobre a planície clara da
    // paleta segura é o caso em que o número sumiria justo quando importa.
    for (const tema of paletas) {
      const fundos = {
        ...tema.terrain,
        estrutura: tema.structure,
        jogador: tema.sides.player.color,
        inimigo: tema.sides.enemy.color,
      };
      for (const [nome, fundo] of Object.entries(fundos)) {
        expect(
          Math.round(worstCaseDistance(tema.tokens.labelPlate, fundo)),
          `${tema.id}: contorno × ${nome}`,
        ).toBeGreaterThan(MIN_DISTANCE);
      }
    }
  });
});

describe('escala de UI', () => {
  it('aceita só as escalas oferecidas', () => {
    for (const scale of UI_SCALES) expect(isSupportedUiScale(scale)).toBe(true);
    for (const invalid of [0, -1, 1.1, 2, 100, Number.NaN]) expect(isSupportedUiScale(invalid)).toBe(false);
  });

  it('começa em 100% e cresce monotonicamente', () => {
    expect(UI_SCALES[0]).toBe(1);
    for (let i = 1; i < UI_SCALES.length; i++) expect(UI_SCALES[i]!).toBeGreaterThan(UI_SCALES[i - 1]!);
  });
});
