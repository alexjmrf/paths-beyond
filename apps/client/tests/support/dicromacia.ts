// Simulação de dicromacia, extraída de `tests/overlayTheme.test.ts` (M13, sub-sessão 4/N)
// em M16 2/N, sem mudar uma conta: as matrizes, a distância e o limiar são os mesmos.
//
// O motivo da extração é o critério de aceite 3 de M16 — "a garantia de daltonismo de M13 4/N
// continua valendo e é REVERIFICADA, não assumida". A linguagem visual que entra em 2/N traz
// tinta nova (glifo sobre o corpo da unidade, marca sobre o terreno), e tinta nova só é
// verificável se o mesmo método medir também ela. Duplicar as matrizes em três arquivos seria
// o jeito de as três cópias divergirem em silêncio.

// sRGB (0..255) → linear.
function toLinear(channel: number): number {
  const c = channel / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function toSrgb(linear: number): number {
  const clamped = Math.min(1, Math.max(0, linear));
  const c = clamped <= 0.0031308 ? clamped * 12.92 : 1.055 * clamped ** (1 / 2.4) - 0.055;
  return Math.round(c * 255);
}

export function unpack(color: number): readonly [number, number, number] {
  return [(color >> 16) & 0xff, (color >> 8) & 0xff, color & 0xff];
}

// Matrizes clássicas de Viénot (1999) para dicromacia, em RGB linear.
const SIMULATIONS = {
  deuteranopia: [
    [0.29275, 0.70725, 0],
    [0.29275, 0.70725, 0],
    [-0.02234, 0.02234, 1],
  ],
  protanopia: [
    [0.11238, 0.88762, 0],
    [0.11238, 0.88762, 0],
    [0.00401, -0.00401, 1],
  ],
} as const;

export type Deficiency = keyof typeof SIMULATIONS;

export const DEFICIENCIES = Object.keys(SIMULATIONS) as readonly Deficiency[];

export function simulate(color: number, deficiency: Deficiency): readonly [number, number, number] {
  const [r, g, b] = unpack(color).map(toLinear) as [number, number, number];
  const m = SIMULATIONS[deficiency];
  return [
    toSrgb(m[0][0] * r + m[0][1] * g + m[0][2] * b),
    toSrgb(m[1][0] * r + m[1][1] * g + m[1][2] * b),
    toSrgb(m[2][0] * r + m[2][1] * g + m[2][2] * b),
  ];
}

// Distância "redmean" (Thiadmer Riemersma): aproximação barata e bem conhecida da
// diferença percebida em sRGB, melhor que a euclidiana crua. Máximo ~765.
export function distance(a: readonly [number, number, number], b: readonly [number, number, number]): number {
  const rMean = (a[0] + b[0]) / 2;
  const dr = a[0] - b[0];
  const dg = a[1] - b[1];
  const db = a[2] - b[2];
  return Math.sqrt((((512 + rMean) * dr * dr) / 256) + 4 * dg * dg + (((767 - rMean) * db * db) / 256));
}

// Abaixo disto, duas cores simuladas se leem como a mesma tinta num tile de 36px.
export const MIN_DISTANCE = 60;

export function luminance(color: number): number {
  const [r, g, b] = unpack(color).map(toLinear) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

// A menor distância percebida entre duas cores considerando as DUAS deficiências e também a
// visão tricromática: uma tinta só é legível sobre um fundo se for legível nos três casos.
export function worstCaseDistance(a: number, b: number): number {
  const cru = distance(unpack(a) as [number, number, number], unpack(b) as [number, number, number]);
  return Math.min(cru, ...DEFICIENCIES.map((d) => distance(simulate(a, d), simulate(b, d))));
}

// Uma tinta desenhada com alpha não é a tinta declarada: o que o olho recebe é a mistura dela
// com o que está embaixo. Medir contraste com a cor pura seria otimismo — e otimismo em teste
// de acessibilidade é o mesmo que não ter teste.
export function blendOver(ink: number, background: number, alpha: number): number {
  const [ir, ig, ib] = unpack(ink);
  const [br, bg, bb] = unpack(background);
  const mix = (i: number, b: number) => Math.round(i * alpha + b * (1 - alpha));
  return (mix(ir, br) << 16) | (mix(ig, bg) << 8) | mix(ib, bb);
}
