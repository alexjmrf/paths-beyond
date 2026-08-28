import { describe, expect, it } from 'vitest';
import { catalog } from '../src/data/catalog.js';
import { COLORBLIND_THEME, DEFAULT_THEME, terrainMarkInkFor, type OverlayTheme } from '../src/data/overlayTheme.js';
import { boundsOf, type NormShape } from '../src/data/shapes.js';
import { FALLBACK_TERRAIN_MARK, MARK_BY_TERRAIN, terrainMarkFor } from '../src/data/terrainMarks.js';
import { blendOver, MIN_DISTANCE, worstCaseDistance } from './support/dicromacia.js';

// M16, sub-sessão 2/N — a marca de terreno.
//
// Até aqui o terreno era um retângulo de cor chapada e mais nada, o que faz o mapa depender de
// o jogador ter decorado que verde-escuro é floresta. Floresta dá +100 de def e +50 de eva
// (§6.6) e montanha é intransponível a pé: são decisões táticas que o tabuleiro precisa dizer
// sem hover e sem legenda (critério de aceite 2).
//
// Mesma disciplina do glifo: o que se afirma aqui é completude contra o catálogo real,
// distinção, caber no tile e contraste medido — nunca "ficou bom".

const TERRENOS_REAIS = Object.keys(catalog.maps).flatMap((id) => Object.keys(catalog.maps[id]!.grid.terrains));
const IDS_UNICOS = [...new Set(TERRENOS_REAIS)].sort();

function assinatura(shapes: readonly NormShape[]): string {
  return JSON.stringify(shapes);
}

describe('completude: todo terreno do catálogo real tem marca', () => {
  it('o catálogo real traz os terrenos de `packages/data/terrains/`', () => {
    expect(IDS_UNICOS).toEqual(['terrain-floresta', 'terrain-montanha', 'terrain-planicie']);
  });

  it('cada terreno tem marca PRÓPRIA, sem cair no fallback', () => {
    const semMarca = IDS_UNICOS.filter((id) => MARK_BY_TERRAIN[id] === undefined);
    expect(semMarca).toEqual([]);
  });

  it('nenhuma marca declarada sobra: todo id de `MARK_BY_TERRAIN` está no catálogo', () => {
    const orfaos = Object.keys(MARK_BY_TERRAIN).filter((id) => !IDS_UNICOS.includes(id));
    expect(orfaos).toEqual([]);
  });

  it('as marcas são distinguíveis entre si', () => {
    const assinaturas = IDS_UNICOS.map((id) => assinatura(MARK_BY_TERRAIN[id]!));
    expect(new Set(assinaturas).size).toBe(IDS_UNICOS.length);
  });

  it('terreno desconhecido cai num fallback declarado, e ele desenha alguma coisa', () => {
    expect(assinatura(terrainMarkFor('terrain-que-nao-existe'))).toBe(assinatura(FALLBACK_TERRAIN_MARK));
    expect(FALLBACK_TERRAIN_MARK.length).toBeGreaterThan(0);
  });
});

describe('a marca cabe no tile e não briga com a unidade', () => {
  it('toda coordenada está no espaço normalizado 0..1', () => {
    for (const [id, shapes] of [...Object.entries(MARK_BY_TERRAIN), ['fallback', FALLBACK_TERRAIN_MARK] as const]) {
      const caixa = boundsOf(shapes as readonly NormShape[]);
      expect(caixa.minX, `${id}.minX`).toBeGreaterThanOrEqual(0);
      expect(caixa.minY, `${id}.minY`).toBeGreaterThanOrEqual(0);
      expect(caixa.maxX, `${id}.maxX`).toBeLessThanOrEqual(1);
      expect(caixa.maxY, `${id}.maxY`).toBeLessThanOrEqual(1);
    }
  });

  it('nenhuma marca invade o miolo do tile, onde a unidade é desenhada', () => {
    // O corpo da unidade ocupa o disco central. Uma textura de terreno passando por baixo dele
    // não some — ela vira sujeira em volta do glifo, que é justamente o que §3 do briefing
    // chama de objetivamente ilegível. As marcas vivem nas bordas.
    const miolo = { min: 0.3, max: 0.7 };
    for (const [id, shapes] of Object.entries(MARK_BY_TERRAIN)) {
      for (const shape of shapes) {
        const caixa = boundsOf([shape]);
        const invade =
          caixa.minX < miolo.max && caixa.maxX > miolo.min && caixa.minY < miolo.max && caixa.maxY > miolo.min;
        expect(invade, `${id}: ${JSON.stringify(shape)}`).toBe(false);
      }
    }
  });
});

describe('a marca é legível sobre o próprio terreno (critério de aceite 3)', () => {
  const paletas: readonly (readonly [string, OverlayTheme])[] = [
    ['padrão', DEFAULT_THEME],
    ['segura', COLORBLIND_THEME],
  ];

  it.each(paletas.map(([nome, tema]) => [nome, tema] as const))(
    'paleta %s: a tinta da marca contrasta com cada terreno, inclusive sob dicromacia',
    (_nome, tema) => {
      for (const id of IDS_UNICOS) {
        const fundo = tema.terrain[id] ?? tema.terrainFallback;
        // A marca é desenhada com alpha: o que o olho recebe é a MISTURA dela com o terreno,
        // não a tinta declarada. Medir a tinta pura seria medir uma coisa que ninguém vê.
        // E a tinta é a que `terrainMarkInkFor` escolhe para AQUELE terreno — uma tinta só não
        // contrastaria com os três, porque a rampa deles é de luminância de propósito.
        const visto = blendOver(terrainMarkInkFor(tema, fundo), fundo, tema.tokens.terrainMarkAlpha);
        expect(Math.round(worstCaseDistance(visto, fundo)), id).toBeGreaterThan(MIN_DISTANCE);
      }
    },
  );
});
