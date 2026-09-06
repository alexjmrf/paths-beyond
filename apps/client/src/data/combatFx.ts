import type { WeaponType } from '@paths-beyond/core';
import type { NormShape } from './shapes.js';

// M26 2/N — o vocabulário de EFEITOS de combate.
//
// **Por que ele existe, e por que é código e não imagem.** A bateria de animação de 1/N mediu
// que os quadros gerados perdem a ARMA — em qualquer resolução e em qualquer amplitude, porque
// o animador de esqueleto anima um corpo e a espada não é osso (D27). §6.1 faz a arma decidir
// o alcance no duelo: a arma é a identidade tática da peça, e uma peça que golpeia sem espada
// mente sobre a regra que o duelo vai aplicar.
//
// A saída, proposta pelo usuário: **a identidade da arma sai dos pixels gerados, onde ela
// morre, e entra no efeito, que é código.** O sprite carrega quem a pessoa é; o corte, a
// estocada, a flecha e o clarão carregam o que ela fez.
//
// E a aritmética inverte junto: o efeito é por TIPO DE ARMA (são 7) e por desfecho, não por
// unidade (são 50). Autora-se uma vez.
//
// Mesmo espaço normalizado 0..1 de `classGlyphs.ts` e `terrainMarks.ts`, e pelo mesmo motivo:
// a mesma declaração serve o tile de 64 e a cena de duelo, que é muito maior. Quem converte
// para pixels é `placeShapes`, num ponto só.
//
// **Nada aqui carrega cor.** A tinta vem do tema (`overlayTheme.ts`), e o que distingue um
// efeito do outro é a FORMA — a garantia de M13 4/N aplicada ao dado novo. O teste compara as
// geometrias par a par, sem uma cor no meio.

export type FxKind = 'strike' | 'miss' | 'heal' | 'death';

// ---------------------------------------------------------------------------
// Os sete golpes, um por arma
// ---------------------------------------------------------------------------
//
// O usuário pediu que não fosse detalhado, e isso é uma vantagem e não uma concessão: um
// efeito de poucas linhas se lê em 200ms, que é o tempo que ele fica na tela, e não compete
// com a peça — §1.1 põe legibilidade tática entre os pilares, e um clarão elaborado por cima
// de dois sprites é o oposto disso.

// Espada: um arco de corte diagonal, com duas linhas de velocidade atrás. Fino e rápido.
const CORTE: readonly NormShape[] = [
  { t: 'poly', points: [0.08, 0.18, 0.42, 0.44, 0.62, 0.72, 0.7, 0.94], w: 1.8 },
  { t: 'poly', points: [0.2, 0.1, 0.46, 0.3] },
  { t: 'poly', points: [0.36, 0.06, 0.56, 0.22] },
];

// Machado: o mesmo gesto, mas GORDO e curto — massa em vez de fio. É a diferença que o
// jogador precisa ler entre um espadachim e um guerreiro sem olhar o painel.
const MACHADADA: readonly NormShape[] = [
  { t: 'poly', points: [0.06, 0.3, 0.34, 0.52, 0.66, 0.62, 0.94, 0.56], closed: false, w: 3.2 },
  { t: 'poly', points: [0.2, 0.72, 0.5, 0.84] , w: 2 },
];

// Lança: estocada. Uma linha reta com ponta losangular — o oposto do arco, porque o que
// distingue lança de espada no tabuleiro é a reta contra a curva.
const ESTOCADA: readonly NormShape[] = [
  { t: 'poly', points: [0.02, 0.5, 0.62, 0.5], w: 2.2 },
  { t: 'poly', points: [0.62, 0.36, 0.96, 0.5, 0.62, 0.64], closed: true, filled: true },
  { t: 'poly', points: [0.1, 0.34, 0.34, 0.44] },
  { t: 'poly', points: [0.1, 0.66, 0.34, 0.56] },
];

// Arco: a flecha em voo, com penas. A identidade da classe é o ALCANCE (§6.1, duelo ranged
// unilateral), e o que diz alcance é uma coisa atravessando o espaço.
const FLECHA: readonly NormShape[] = [
  { t: 'poly', points: [0.04, 0.5, 0.74, 0.5], w: 1.4 },
  { t: 'poly', points: [0.74, 0.38, 0.98, 0.5, 0.74, 0.62], closed: true, filled: true },
  { t: 'poly', points: [0.04, 0.5, 0.16, 0.36] },
  { t: 'poly', points: [0.04, 0.5, 0.16, 0.64] },
];

// Arcano: estouro radial. Um núcleo e seis raios — nem arco, nem reta: irradiação.
const ESTOURO: readonly NormShape[] = [
  { t: 'circle', cx: 0.5, cy: 0.5, r: 0.16, filled: true },
  { t: 'poly', points: [0.5, 0.02, 0.5, 0.26] },
  { t: 'poly', points: [0.5, 0.74, 0.5, 0.98] },
  { t: 'poly', points: [0.02, 0.5, 0.26, 0.5] },
  { t: 'poly', points: [0.74, 0.5, 0.98, 0.5] },
  { t: 'poly', points: [0.16, 0.16, 0.33, 0.33] },
  { t: 'poly', points: [0.84, 0.84, 0.67, 0.67] },
];

// Natureza: espiral de folhas. Curva fechada, sem ponta e sem raio — a forma que não é golpe.
const FOLHAS: readonly NormShape[] = [
  { t: 'poly', points: [0.5, 0.06, 0.74, 0.24, 0.72, 0.54, 0.5, 0.66, 0.3, 0.5, 0.36, 0.28, 0.56, 0.3], w: 1.4 },
  { t: 'poly', points: [0.5, 0.66, 0.5, 0.96], w: 1.2 },
  { t: 'poly', points: [0.5, 0.8, 0.28, 0.72] },
  { t: 'poly', points: [0.5, 0.88, 0.72, 0.82] },
];

// Sagrado: coluna de luz vinda de cima, com um halo. Vertical, e é a única que vem de FORA da
// cena em vez de sair de quem bate.
const COLUNA: readonly NormShape[] = [
  { t: 'poly', points: [0.34, 0.02, 0.66, 0.02, 0.58, 0.96, 0.42, 0.96], closed: true, w: 1.6 },
  { t: 'circle', cx: 0.5, cy: 0.3, r: 0.18 },
  { t: 'poly', points: [0.18, 0.62, 0.82, 0.62] },
];

const POR_ARMA: Readonly<Record<WeaponType, readonly NormShape[]>> = {
  sword: CORTE,
  axe: MACHADADA,
  spear: ESTOCADA,
  bow: FLECHA,
  arcane: ESTOURO,
  nature: FOLHAS,
  holy: COLUNA,
};

// O golpe de quem não declarou arma. Existe pelo mesmo motivo que o glifo de fallback do M16:
// PvP, masmorra e replay recebem o `BattleSetup` pronto do servidor, e uma unidade sem arma
// resolvida não pode virar um golpe invisível.
const GOLPE_GENERICO: readonly NormShape[] = [
  { t: 'poly', points: [0.14, 0.24, 0.7, 0.8], w: 2.4 },
  { t: 'poly', points: [0.7, 0.24, 0.14, 0.8], w: 2.4 },
];

// ---------------------------------------------------------------------------
// Os desfechos que não são o golpe
// ---------------------------------------------------------------------------

// A ESQUIVA. §8 dá a `spd` exatamente três benefícios, e a evasão com teto é um deles — o
// jogador precisa ler que a velocidade fez o trabalho, senão o stat vira número de planilha.
//
// A forma é o rastro do golpe que passou LONGE: dois arcos paralelos e deslocados, sem ponta
// e sem núcleo. Não há como confundir com nenhum dos sete, porque nenhum deles é paralelo.
const ESQUIVA: readonly NormShape[] = [
  { t: 'poly', points: [0.1, 0.72, 0.5, 0.34, 0.9, 0.16], w: 1.2 },
  { t: 'poly', points: [0.1, 0.9, 0.5, 0.52, 0.9, 0.34], w: 1.2 },
];

// A CURA. Cruz cheia num disco vazado: a única forma do vocabulário que é simétrica nos dois
// eixos, e a única que não aponta para lugar nenhum. Curar não tem direção.
const CURA: readonly NormShape[] = [
  { t: 'circle', cx: 0.5, cy: 0.5, r: 0.42 },
  { t: 'poly', points: [0.38, 0.22, 0.62, 0.22, 0.62, 0.38, 0.78, 0.38, 0.78, 0.62, 0.62, 0.62, 0.62, 0.78, 0.38, 0.78, 0.38, 0.62, 0.22, 0.62, 0.22, 0.38, 0.38, 0.38], closed: true, filled: true },
];

// A MORTE. Um X inscrito num quadrado — a única forma fechada por fora do vocabulário.
const MORTE: readonly NormShape[] = [
  { t: 'poly', points: [0.14, 0.14, 0.86, 0.14, 0.86, 0.86, 0.14, 0.86], closed: true, w: 1.4 },
  { t: 'poly', points: [0.26, 0.26, 0.74, 0.74], w: 1.8 },
  { t: 'poly', points: [0.74, 0.26, 0.26, 0.74], w: 1.8 },
];

// O CRÍTICO. Não substitui o golpe: entra POR CIMA dele. É o que permite que "crítico de
// espada" e "crítico de machado" continuem se distinguindo — o crítico diz quanto, a arma
// continua dizendo o quê.
const CRITICO: readonly NormShape[] = [
  { t: 'poly', points: [0.5, 0.0, 0.6, 0.36, 0.98, 0.42, 0.68, 0.62, 0.78, 0.98, 0.5, 0.76, 0.22, 0.98, 0.32, 0.62, 0.02, 0.42, 0.4, 0.36], closed: true, w: 1.2 },
];

/** O golpe da arma. Sem arma resolvida, o golpe genérico — nunca nada. */
export function fxDeGolpe(weaponType: WeaponType | undefined): readonly NormShape[] {
  return weaponType ? POR_ARMA[weaponType] : GOLPE_GENERICO;
}

/** O efeito de um desfecho que não depende da arma. */
export function fxDeDesfecho(kind: Exclude<FxKind, 'strike'>): readonly NormShape[] {
  return kind === 'miss' ? ESQUIVA : kind === 'heal' ? CURA : MORTE;
}

/** A marca de crítico, para ir POR CIMA do golpe da arma. */
export function fxDeCritico(): readonly NormShape[] {
  return CRITICO;
}
