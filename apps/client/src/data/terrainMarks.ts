import type { NormShape } from './shapes.js';

// M16, sub-sessão 2/N — a marca de terreno.
//
// Até aqui o tile era uma cor chapada e nada mais, o que faz o mapa depender de o jogador ter
// decorado que verde-escuro é floresta. Só que terreno é regra: floresta dá +100 de def e +50
// de eva e bloqueia linha de visão; montanha é intransponível a pé e só o Grifeiro passa. O
// critério de aceite 2 é "legível sem hover e sem legenda" — cor chapada exige as duas coisas.
//
// **As marcas vivem nas BORDAS do tile, nunca no miolo.** O miolo é onde a unidade é desenhada,
// e uma textura passando por baixo dela não some: vira sujeira em volta do glifo. Isso não é
// gosto, é o que `tests/terrainMarks.test.ts` afirma como faixa proibida (0.3–0.7 nos dois
// eixos), e é a diferença entre desenhar o terreno e poluir a peça.
//
// Espaço normalizado 0..1 dentro do tile, y para baixo — mesma linguagem do glifo de classe.

// Planície: dois tufos curtos, e só. É o terreno mais comum do mapa (o chão de quase todo tile
// de todo capítulo) e marcar muito seria transformar o tabuleiro inteiro em ruído; o que ela
// precisa dizer é "aqui não tem nada", e quase-nada é a marca certa para isso.
const PLANICIE: readonly NormShape[] = [
  { t: 'poly', points: [0.1, 0.9, 0.26, 0.9] },
  { t: 'poly', points: [0.62, 0.94, 0.8, 0.94] },
];

// Floresta: coníferas cheias nos cantos. Massa sólida, porque floresta é cobertura.
const FLORESTA: readonly NormShape[] = [
  { t: 'poly', points: [0.12, 0.28, 0.25, 0.04, 0.38, 0.28], closed: true, filled: true },
  { t: 'poly', points: [0.04, 0.96, 0.17, 0.72, 0.3, 0.96], closed: true, filled: true },
  { t: 'poly', points: [0.62, 0.96, 0.75, 0.72, 0.88, 0.96], closed: true, filled: true },
];

// Montanha: cumeeiras em contorno. Vazias por dentro para não competirem com a floresta, que é
// o outro terreno escuro — cheio contra vazio é uma distinção que sobrevive a preto e branco.
const MONTANHA: readonly NormShape[] = [
  { t: 'poly', points: [0.1, 0.26, 0.32, 0.02, 0.54, 0.26], closed: false },
  { t: 'poly', points: [0.5, 0.26, 0.72, 0.06, 0.94, 0.26], closed: false },
  { t: 'poly', points: [0.2, 0.96, 0.44, 0.74, 0.68, 0.96], closed: false },
];

export const MARK_BY_TERRAIN: Readonly<Record<string, readonly NormShape[]>> = {
  'terrain-planicie': PLANICIE,
  'terrain-floresta': FLORESTA,
  'terrain-montanha': MONTANHA,
};

// Terreno que o cliente não conhece: um quadradinho no canto. Diz "há regra aqui que eu não sei
// desenhar" em vez de mentir que é planície — `TerrainId` é chave livre (`grid/types.ts`), então
// conteúdo novo pode chegar antes do desenho.
export const FALLBACK_TERRAIN_MARK: readonly NormShape[] = [
  { t: 'poly', points: [0.06, 0.06, 0.2, 0.06, 0.2, 0.2, 0.06, 0.2], closed: true },
];

export function terrainMarkFor(terrainId: string): readonly NormShape[] {
  return MARK_BY_TERRAIN[terrainId] ?? FALLBACK_TERRAIN_MARK;
}
