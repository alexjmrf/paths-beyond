import type { TilePatternKind } from './overlayTheme.js';
import { clipSegment, type Primitive } from './shapes.js';

// M16, sub-sessão 2/N — os padrões de overlay, extraídos de dentro do `MapCanvas`.
//
// A marca que não depende de cor, desenhada por cima do véu do overlay: hachura (ameaça),
// pontos (movimento), grade (mira), moldura (objetivo). Em deuteranopia dois véus podem virar
// o mesmo tom, e o padrão é o que continua dizendo qual é qual — inclusive quando os dois se
// empilham no mesmo tile, que é o caso normal do jogo (um tile é alcance de movimento E zona
// de ameaça o tempo todo). Foi assim que M13 4/N fechou o modo daltônico.
//
// A extração tem um motivo concreto, registrado no fecho de M15 como pendência: "o padrão de
// hachura do overlay de ameaça TRANSBORDA O TILE e mancha a alvenaria vizinha". Enquanto a
// geometria morava dentro de uma chamada de Pixi não havia como afirmar nada sobre ela; aqui
// ela é dado puro e o transbordo virou uma asserção de uma linha
// (`tests/tilePatterns.test.ts`). As diagonais agora são RECORTADAS na borda do tile — recorte
// na fonte, e não `mask` de Pixi, porque uma máscara conserta o pixel e deixa o teste cego.

export function patternPrimitives(
  pattern: TilePatternKind,
  px: number,
  py: number,
  size: number,
  color: number,
): readonly Primitive[] {
  const espessura = Math.max(1, Math.round(size / 24));
  // Um traço é CENTRADO na linha: uma linha que termina exatamente na beirada do tile pinta
  // meia espessura do lado de fora. É essa meia espessura que manchava a alvenaria vizinha, e
  // é por isso que o recorte acontece contra o tile encolhido, não contra o tile.
  const meioTraco = espessura / 2;
  const caixa = {
    minX: px + meioTraco,
    minY: py + meioTraco,
    maxX: px + size - meioTraco,
    maxY: py + size - meioTraco,
  };

  switch (pattern) {
    case 'hatch': {
      const passo = Math.max(5, Math.round(size / 4));
      const linhas: Primitive[] = [];
      for (let offset = -size; offset < size; offset += passo) {
        const recortada = clipSegment(px + offset, py + size, px + offset + size, py, caixa);
        if (!recortada) continue;
        linhas.push({
          t: 'poly',
          points: [...recortada],
          stroke: color,
          strokeWidth: espessura,
          alpha: 0.85,
        });
      }
      return linhas;
    }
    case 'dots': {
      const raio = Math.max(1, Math.round(size / 18));
      const quarto = size / 4;
      const pontos: Primitive[] = [];
      for (const fx of [1, 3]) {
        for (const fy of [1, 3]) {
          pontos.push({ t: 'circle', cx: px + quarto * fx, cy: py + quarto * fy, r: raio, fill: color, alpha: 0.9 });
        }
      }
      return pontos;
    }
    case 'grid': {
      const meio = size / 2;
      return [
        {
          t: 'poly',
          points: [caixa.minX, py + meio, caixa.maxX, py + meio],
          stroke: color,
          strokeWidth: espessura,
          alpha: 0.85,
        },
        {
          t: 'poly',
          points: [px + meio, caixa.minY, px + meio, caixa.maxY],
          stroke: color,
          strokeWidth: espessura,
          alpha: 0.85,
        },
      ];
    }
    case 'frame': {
      // A moldura é a única cujo traço encosta na borda, então o recuo é exatamente meia
      // espessura: menos que isso e ela transborda (era o caso em 175%, onde a espessura chega
      // a 4px), mais que isso e ela se descola da beirada e vira outra moldura.
      const largura = espessura + 1;
      const recuo = largura / 2;
      return [
        {
          t: 'rect',
          x: px + recuo,
          y: py + recuo,
          w: size - largura,
          h: size - largura,
          stroke: color,
          strokeWidth: largura,
        },
      ];
    }
    case 'none':
      return [];
  }
}
