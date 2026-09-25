import { RANKS_DE_BASE, type BaseRank } from '@paths-beyond/core';
import type { BannerDef, BannerKind, PityState } from './types.js';

// D18, reassentado por D50 (M37, 2/N) — o pity duro contado, agora com DOIS ANDARES.
//
// Separado da rolagem porque são duas perguntas distintas: "qual garantia vale agora?" e
// "quanto valem os contadores depois?". Juntas dentro de `rollSummon` elas ficariam
// expressas como um punhado de `if` no meio do sorteio, e é justamente esta transição que
// precisa ser afirmável sozinha.

/**
 * A ordem em que as garantias são consideradas quando mais de uma está armada.
 *
 * **O `Hero` tem precedência** (D50c). Entregar o `Adventurer` com a garantia de `Hero`
 * armada faria o prêmio caro escorregar para a rolagem seguinte. Como os contadores são
 * independentes (D50b), o de `Adventurer` continua armado e dispara na próxima — nada se
 * perde, e é por isso que a precedência é de graça.
 *
 * A asserção de tipo é exaustividade em tempo de compilação: um rank de base novo em
 * `packages/core` que não apareça aqui não compila, em vez de nunca ser garantido em
 * silêncio.
 */
const PRECEDENCIA: readonly [BaseRank, ...BaseRank[]] = ['hero', 'adventurer'];
const _exaustiva: Record<BaseRank, true> = { hero: true, adventurer: true };
void _exaustiva;

/** O banner oferece alguma entrada daquele rank? Sem isso não há o que garantir. */
function ofereceRank(banner: BannerDef, rank: BaseRank): boolean {
  return banner.pool.some((entry) => entry.rank === rank);
}

/**
 * M38 3/N (D55) — **o limiar N garante a N-ésima rolagem**, não a seguinte a N rolagens sem
 * prêmio. É a leitura da tabela de D54 (a curva é 1000 NA 90ª) e a do mercado; até o M37 o
 * motor garantia a N+1-ésima. Uma definição só para os dois andares.
 */
export function isPityArmed(
  pity: PityState,
  thresholds: Readonly<Record<BaseRank, number>>,
  rank: BaseRank,
): boolean {
  return pity[rank] + 1 >= thresholds[rank];
}

/**
 * Qual garantia dispara nesta rolagem, ou `null` se nenhuma.
 *
 * Um rank que o banner não oferece nunca é escolhido, por armado que o contador esteja:
 * garantir o que o pool não pode pagar deixaria a rolagem sem entrada sorteável.
 */
export function rankGarantido(banner: BannerDef, pity: PityState): BaseRank | null {
  for (const rank of PRECEDENCIA) {
    if (ofereceRank(banner, rank) && isPityArmed(pity, banner.pityThresholds, rank)) return rank;
  }
  return null;
}

export interface PityTransition {
  // O rank do personagem que a rolagem ENTREGOU. Zera o contador daquele rank, e só dele
  // (D50b): os dois andares correm separados.
  readonly grantedRank: BaseRank;
  // Ranks que o banner não oferece. O contador CONGELA: avançar acumularia uma garantia sem
  // destino, e consumi-la seria pior — o jogador perderia uma garantia que nada pagou.
  // Congelado, se um `Hero` entrar no pool amanhã, a garantia que ele já tinha continua de
  // pé.
  //
  // Desde D50 o congelamento depende do POOL e não mais da posse: com a garantia pagando
  // duplicata, sempre há o que entregar enquanto o rank existir no banner.
  readonly ranksSemEntrada: readonly BaseRank[];
}

export function advancePity(pity: PityState, transition: PityTransition): PityState {
  const congelados = new Set(transition.ranksSemEntrada);
  const proximo: Record<BaseRank, number> = { ...pity };

  for (const rank of RANKS_DE_BASE) {
    if (rank === transition.grantedRank) proximo[rank] = 0;
    else if (congelados.has(rank)) proximo[rank] = pity[rank];
    else proximo[rank] = pity[rank] + 1;
  }

  return proximo;
}

/** Os ranks que este banner NÃO oferece — a entrada de congelamento de `advancePity`. */
export function ranksSemEntrada(banner: BannerDef): readonly BaseRank[] {
  return RANKS_DE_BASE.filter((rank) => !ofereceRank(banner, rank));
}

/**
 * D54 — a chave do contador de pity de um banner: o TIPO dele. O pity é guardado entre banners
 * do mesmo tipo, então o rotativo de amanhã herda o contador do de hoje.
 */
export function pityScopeOf(banner: BannerDef): BannerKind {
  return banner.kind;
}
