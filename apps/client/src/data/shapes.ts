// M16, sub-sessão 2/N — o vocabulário de formas da linguagem visual.
//
// Duas camadas, de propósito:
//
//   `NormShape` é uma forma em espaço NORMALIZADO (0..1) — o que um glifo de classe ou uma
//   marca de terreno declara. Não sabe onde vai ser desenhada nem de que tamanho, então a
//   mesma declaração vale para o tile de 36px e para o de 63px (175%, a maior escala de §11).
//
//   `Primitive` é a mesma forma já POSICIONADA em pixels de canvas, com tinta — o que os
//   renderers devolvem e o que o `MapCanvas` traduz em `Graphics` do Pixi, num ponto só.
//
// As duas são dado puro e serializável, sem uma referência a Pixi (D2 do briefing). É isso que
// torna o desenho AFIRMÁVEL em teste — "o glifo cabe no corpo", "a hachura não invade o tile
// vizinho", "buff e debuff se distinguem sem cor" — em vez de olhar screenshot e torcer.

export type NormShape =
  | {
      readonly t: 'poly';
      // Achatado — [x0,y0,x1,y1,...] —, porque é o formato que serializa e compara mais
      // barato, e comparar duas declarações de glifo é a base do teste de distinção.
      readonly points: readonly number[];
      readonly closed?: boolean;
      readonly filled?: boolean;
      readonly w?: number; // multiplicador de espessura sobre o traço base
    }
  | {
      readonly t: 'circle';
      readonly cx: number;
      readonly cy: number;
      readonly r: number;
      readonly filled?: boolean;
      readonly w?: number;
    };

export type Primitive =
  | {
      readonly t: 'circle';
      readonly cx: number;
      readonly cy: number;
      readonly r: number;
      readonly fill?: number;
      readonly alpha?: number;
      readonly stroke?: number;
      readonly strokeWidth?: number;
    }
  | {
      readonly t: 'rect';
      readonly x: number;
      readonly y: number;
      readonly w: number;
      readonly h: number;
      readonly fill?: number;
      readonly alpha?: number;
      readonly stroke?: number;
      readonly strokeWidth?: number;
    }
  | {
      readonly t: 'poly';
      readonly points: readonly number[];
      readonly closed?: boolean;
      readonly fill?: number;
      readonly alpha?: number;
      readonly stroke?: number;
      readonly strokeWidth?: number;
    }
  | {
      readonly t: 'text';
      readonly x: number;
      readonly y: number;
      readonly text: string;
      readonly size: number;
      readonly color: number;
      readonly bold?: boolean;
    };

export interface Bounds {
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;
}

const VAZIO: Bounds = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };

function unir(a: Bounds, b: Bounds): Bounds {
  return {
    minX: Math.min(a.minX, b.minX),
    minY: Math.min(a.minY, b.minY),
    maxX: Math.max(a.maxX, b.maxX),
    maxY: Math.max(a.maxY, b.maxY),
  };
}

function pontosDe(points: readonly number[]): Bounds {
  let caixa = VAZIO;
  for (let i = 0; i + 1 < points.length; i += 2) {
    caixa = unir(caixa, { minX: points[i]!, minY: points[i + 1]!, maxX: points[i]!, maxY: points[i + 1]! });
  }
  return caixa;
}

export function boundsOf(shapes: readonly NormShape[]): Bounds {
  let caixa = VAZIO;
  for (const shape of shapes) {
    caixa = unir(
      caixa,
      shape.t === 'poly'
        ? pontosDe(shape.points)
        : { minX: shape.cx - shape.r, minY: shape.cy - shape.r, maxX: shape.cx + shape.r, maxY: shape.cy + shape.r },
    );
  }
  return caixa;
}

// A caixa que uma primitiva OCUPA no canvas, contando meia espessura de traço para cada lado —
// um traço é centrado na linha, então uma borda encostada na beirada do tile transborda meia
// espessura para fora dela. Ignorar isso é como o transbordo da hachura passou de M13 a M15.
//
// `text` conta como ponto: a largura de um texto depende da fonte, e o cliente não mede fonte
// fora do browser. O rótulo de AP/PP é curto e ancorado no canto por construção.
export function primitiveBounds(p: Primitive): Bounds {
  const folga = p.t === 'text' ? 0 : (p.stroke !== undefined ? (p.strokeWidth ?? 1) / 2 : 0);
  const nucleo: Bounds =
    p.t === 'circle'
      ? { minX: p.cx - p.r, minY: p.cy - p.r, maxX: p.cx + p.r, maxY: p.cy + p.r }
      : p.t === 'rect'
        ? { minX: p.x, minY: p.y, maxX: p.x + p.w, maxY: p.y + p.h }
        : p.t === 'poly'
          ? pontosDe(p.points)
          : { minX: p.x, minY: p.y, maxX: p.x, maxY: p.y };

  return {
    minX: nucleo.minX - folga,
    minY: nucleo.minY - folga,
    maxX: nucleo.maxX + folga,
    maxY: nucleo.maxY + folga,
  };
}

export interface ShapeBox {
  readonly x: number;
  readonly y: number;
  readonly size: number;
}

export interface ShapeStyle {
  readonly ink: number;
  readonly strokeWidth: number;
  readonly alpha?: number;
}

// Espaço normalizado → pixels de canvas. É o único lugar do cliente que faz essa conversão:
// glifo, marca de terreno e qualquer forma futura passam por aqui, então "o desenho escala com
// a UI" é uma propriedade de uma função e não uma promessa espalhada por dez arquivos.
export function placeShapes(shapes: readonly NormShape[], box: ShapeBox, style: ShapeStyle): readonly Primitive[] {
  const px = (n: number) => box.x + n * box.size;
  const py = (n: number) => box.y + n * box.size;
  const tinta = style.alpha === undefined ? {} : { alpha: style.alpha };

  return shapes.map((shape): Primitive => {
    const espessura = Math.max(1, style.strokeWidth * (shape.w ?? 1));
    const pincel = shape.filled ? { fill: style.ink } : { stroke: style.ink, strokeWidth: espessura };

    if (shape.t === 'circle') {
      return { t: 'circle', cx: px(shape.cx), cy: py(shape.cy), r: shape.r * box.size, ...pincel, ...tinta };
    }

    const points = shape.points.map((n, i) => (i % 2 === 0 ? px(n) : py(n)));
    return { t: 'poly', points, closed: shape.closed ?? false, ...pincel, ...tinta };
  });
}

// Recorte de segmento contra uma caixa (Liang–Barsky). Existe por causa de um artefato
// concreto registrado no fecho de M15: a hachura do overlay de ameaça era desenhada como
// diagonais mais longas que o tile e manchava a alvenaria vizinha. Recortar na fonte é o que
// permite AFIRMAR que nada transborda, em vez de confiar em `mask` de Pixi que o teste não vê.
export function clipSegment(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  box: { readonly minX: number; readonly minY: number; readonly maxX: number; readonly maxY: number },
): readonly [number, number, number, number] | null {
  const dx = x1 - x0;
  const dy = y1 - y0;
  let t0 = 0;
  let t1 = 1;

  const bordas: readonly (readonly [number, number])[] = [
    [-dx, x0 - box.minX],
    [dx, box.maxX - x0],
    [-dy, y0 - box.minY],
    [dy, box.maxY - y0],
  ];

  for (const [p, q] of bordas) {
    if (p === 0) {
      if (q < 0) return null; // paralelo à borda e fora dela
      continue;
    }
    const r = q / p;
    if (p < 0) {
      if (r > t1) return null;
      if (r > t0) t0 = r;
    } else {
      if (r < t0) return null;
      if (r < t1) t1 = r;
    }
  }

  if (t1 - t0 <= 1e-9) return null; // sobrou um ponto, não um segmento
  return [x0 + t0 * dx, y0 + t0 * dy, x0 + t1 * dx, y0 + t1 * dy];
}
