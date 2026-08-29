import type { NormShape } from './shapes.js';

// M16, sub-sessão 5/N — a marca da construção.
//
// Vem do veredito do usuário sobre o critério de aceite 2: "dá pra perceber diferença mas não
// necessariamente distinguir totalmente, principalmente elementos do mapa". A medição achou o
// culpado — na paleta padrão, floresta e alvenaria estavam a **1,03 de contraste**, a mesma
// luminância, com a distinção inteira apoiada na matiz. Um muro lia-se como um bosque.
//
// Reafinar a tinta resolve metade (ver `overlayTheme.ts`). A outra metade é esta: **um muro
// precisa de forma própria**, porque forma é o que sobrevive quando um véu semitransparente de
// ameaça ou de movimento cobre o tile e empurra toda a tinta para a mesma direção. Até aqui o
// muro era um retângulo chapado sem marca nenhuma — a única coisa do tabuleiro desenhada só com
// cor.
//
// **Estas marcas ocupam o MIOLO do tile, ao contrário das de terreno.** A regra de 2/N manda a
// marca de terreno viver nas bordas, porque uma unidade é desenhada no meio e a textura viraria
// sujeira em volta do glifo. Muro e portão são intransponíveis (§5.1, M15 1/N): nenhuma unidade
// jamais fica em cima deles, então eles podem — e precisam — texturizar o tile inteiro.
//
// Espaço normalizado 0..1 dentro do tile, y para baixo — mesma linguagem do glifo de classe e da
// marca de terreno.

// Muro: fiadas de blocos, com as juntas verticais alternadas entre uma fiada e a seguinte, que é
// como alvenaria de verdade é assentada. As horizontais são o que lê como "construído"; as
// verticais desencontradas são o que impede a leitura de "grade". Uma linha isolada leria como
// rachadura, e é por isso que o teste exige duas ou mais.
const WALL: readonly NormShape[] = [
  { t: 'poly', points: [0.04, 0.34, 0.96, 0.34] },
  { t: 'poly', points: [0.04, 0.66, 0.96, 0.66] },
  // Juntas da fiada de cima.
  { t: 'poly', points: [0.34, 0.04, 0.34, 0.34] },
  { t: 'poly', points: [0.68, 0.04, 0.68, 0.34] },
  // Fiada do meio, deslocada meio bloco.
  { t: 'poly', points: [0.17, 0.34, 0.17, 0.66] },
  { t: 'poly', points: [0.51, 0.34, 0.51, 0.66] },
  { t: 'poly', points: [0.85, 0.34, 0.85, 0.66] },
  // Fiada de baixo, de volta ao alinhamento da de cima.
  { t: 'poly', points: [0.34, 0.66, 0.34, 0.96] },
  { t: 'poly', points: [0.68, 0.66, 0.68, 0.96] },
];

// Portão: os dois batentes verticais e a tranca atravessada, que é a leitura que M15 3/N já
// tinha escolhido para o portão FECHADO. Aqui ela vira declaração em vez de `g.rect` solto no
// canvas, pelo mesmo motivo que o glifo de classe virou: uma forma declarada é comparável, e é o
// que permite ao teste afirmar que portão e muro não se leem como a mesma coisa.
const GATE: readonly NormShape[] = [
  { t: 'poly', points: [0.06, 0.04, 0.24, 0.04, 0.24, 0.96, 0.06, 0.96], closed: true, filled: true },
  { t: 'poly', points: [0.76, 0.04, 0.94, 0.04, 0.94, 0.96, 0.76, 0.96], closed: true, filled: true },
  // A tranca. É ela que diz "fechado" — o portão aberto perde esta forma e fica só nos batentes.
  { t: 'poly', points: [0.06, 0.42, 0.94, 0.42, 0.94, 0.58, 0.06, 0.58], closed: true, filled: true },
];

// O portão ABERTO: os batentes ficam, a tranca sai. A diferença entre passar e não passar é
// visível sem hover, que é o requisito do critério 2.
const GATE_OPEN: readonly NormShape[] = [GATE[0]!, GATE[1]!];

export const MARK_BY_STRUCTURE: Readonly<Record<string, readonly NormShape[]>> = {
  wall: WALL,
  gate: GATE,
  'gate-open': GATE_OPEN,
};

// Sem fallback, de propósito, e é a diferença para `terrainMarkFor`. `TerrainId` é chave livre e
// conteúdo novo pode chegar antes do desenho, então lá o desconhecido ganha um quadradinho que
// diz "há regra aqui que eu não sei desenhar". Aqui a lista de objetos é FECHADA pelo tipo
// `Tile.object`, e `fort`/`camp` são objetivos, não construção — desenhá-los como alvenaria
// diria ao jogador que ele não pode pisar num tile em que ele pode.
export function structureMarkFor(objectId: string): readonly NormShape[] | undefined {
  return MARK_BY_STRUCTURE[objectId];
}
