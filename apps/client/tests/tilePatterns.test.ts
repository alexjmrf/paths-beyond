import { describe, expect, it } from 'vitest';
import { COLORBLIND_THEME, type TilePatternKind } from '../src/data/overlayTheme.js';
import { patternPrimitives } from '../src/data/tilePatterns.js';
import { primitiveBounds, type Primitive } from '../src/data/shapes.js';

// M16, sub-sessão 2/N — os padrões de overlay saem de dentro do `MapCanvas` e viram dado puro.
//
// O motivo é um artefato registrado no fecho de M15, e não vaidade de arquitetura: "o padrão de
// hachura do overlay de ameaça TRANSBORDA O TILE e mancha a alvenaria vizinha — artefato
// pré-existente do desenho, candidato natural a M16". Enquanto a geometria morava dentro de uma
// chamada de Pixi não havia como afirmar nada sobre ela; extraída, o transbordo vira uma
// asserção de uma linha.
//
// O padrão é o que sustenta a garantia de M13 4/N quando dois overlays se empilham no mesmo
// tile (em deuteranopia os dois véus podem virar o mesmo tom, e aí só a forma os separa) — por
// isso ele precisa continuar existindo, e precisa parar exatamente na borda do tile.

const TAMANHOS = [24, 36, 63] as const; // 36 é a escala 1; 63 é 175%, a maior escala de §11
const PADROES: readonly TilePatternKind[] = ['hatch', 'dots', 'grid', 'frame'];

const PX = 5 * 36;
const PY = 7 * 36;
const COR = 0x123456;

describe('padrão de overlay recortado no tile', () => {
  it.each(PADROES.flatMap((p) => TAMANHOS.map((s) => [p, s] as const)))(
    '%s em %ipx não transborda o tile',
    (padrao, size) => {
      const primitivas = patternPrimitives(padrao, PX, PY, size, COR);
      expect(primitivas.length).toBeGreaterThan(0);

      for (const p of primitivas) {
        const caixa = primitiveBounds(p);
        expect(caixa.minX, JSON.stringify(p)).toBeGreaterThanOrEqual(PX);
        expect(caixa.minY, JSON.stringify(p)).toBeGreaterThanOrEqual(PY);
        expect(caixa.maxX, JSON.stringify(p)).toBeLessThanOrEqual(PX + size);
        expect(caixa.maxY, JSON.stringify(p)).toBeLessThanOrEqual(PY + size);
      }
    },
  );

  it('a hachura ainda ATRAVESSA o tile — recortar não pode virar apagar', () => {
    // O risco de uma correção de transbordo é o remédio matar o paciente: uma hachura que só
    // sobrevive no cantinho não distingue mais nada.
    const primitivas = patternPrimitives('hatch', PX, PY, 36, COR);
    const linhas = primitivas.filter((p): p is Extract<Primitive, { t: 'poly' }> => p.t === 'poly');
    expect(linhas.length).toBeGreaterThanOrEqual(3);

    const maisLonga = Math.max(
      ...linhas.map((l) => Math.hypot(l.points[2]! - l.points[0]!, l.points[3]! - l.points[1]!)),
    );
    expect(maisLonga).toBeGreaterThan(36 * 0.9);
  });

  it('`none` não desenha nada', () => {
    expect(patternPrimitives('none', PX, PY, 36, COR)).toEqual([]);
  });

  it('cada padrão da paleta segura produz um desenho diferente dos outros', () => {
    // A mesma exigência que `overlayTheme.test.ts` já faz sobre os NOMES dos padrões, agora
    // sobre a geometria: dois nomes diferentes que desenhassem o mesmo não separariam nada.
    const desenhos = [
      COLORBLIND_THEME.threat.pattern,
      COLORBLIND_THEME.move.pattern,
      COLORBLIND_THEME.targeting.pattern,
      COLORBLIND_THEME.objective.pattern,
    ].map((p) => JSON.stringify(patternPrimitives(p, PX, PY, 36, COR)));

    expect(new Set(desenhos).size).toBe(desenhos.length);
  });

  it('é puro: a mesma entrada produz a mesma saída', () => {
    for (const padrao of PADROES) {
      expect(patternPrimitives(padrao, PX, PY, 36, COR)).toEqual(patternPrimitives(padrao, PX, PY, 36, COR));
    }
  });
});
