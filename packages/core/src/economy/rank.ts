import { MAX_AWAKENING } from './awakening.js';

// M37 (§10, DECISIONS.md §1–§4) — OS TRÊS RANKS: Adventurer, Hero e Legend.
//
// **O elenco deixa de ser plano, e o rank NÃO carrega poder.** É a trava do milestone e não um
// detalhe: o que separa um `Adventurer` de um `Hero` é a profundidade da árvore — e D9 já
// declarou que profundidade é troca de FORMA, com o mesmo orçamento de 9 pontos para todos — e
// o custo de evolução. Nenhum número deste arquivo multiplica stat nenhum. Se um dia o rank
// virar poder, `pnpm balance` reprova (nenhuma comp acima de 60%, critério do M8).
//
// **Rank é DUAS coisas, e confundi-las seria o erro caro.** O rank de BASE é catálogo
// (`packages/data/characters/*.json`, ao lado de classe e `acquisition`): um `Adventurer` é
// `Adventurer` para sempre, em toda conta. O rank CORRENTE é progressão daquela conta — e não
// é guardado em lugar nenhum, porque guardá-lo repetiria o erro que o M18 2/N pagou com o
// fragmento de imprint: o dado descrevendo o que é estado de conta, com dois donos para o mesmo
// número.
//
// **Por isso o corrente é uma FUNÇÃO, e o eixo é o awakening** (decisão do usuário, §4). O
// awakening já existe desde o M14 com curva, material, repositório, tela e idempotência por
// nonce. Herdá-lo em vez de criar um quinto eixo de progressão (nível, awakening, imprint,
// talentos, +rank) é o que evita o jogador ter duas barras que significam a mesma coisa.
//
// **Os caminhos são assimétricos de propósito** (§1): quem nasce `Hero` sobe direto a `Legend`;
// quem nasce `Adventurer` sobe a `Hero` na metade da curva e só então a `Legend`. O Adventurer
// atravessa mais degraus — é precisamente o "mais difícil de upgradar" — sem nenhum número de
// poder o separando. Depois de promovido ele é **indistinguível** de um `Hero` de base: não há
// campo por onde a origem vaze, porque não há campo.
//
// Os dois limiares são decisão do usuário (regra 10) e o teto NÃO sobe: continua sendo o
// `MAX_AWAKENING` de sempre.

/** O rank que um personagem pode ter no catálogo. `legend` nunca é base — chega-se nele por evolução. */
export const RANKS_DE_BASE = ['adventurer', 'hero'] as const;
export type BaseRank = (typeof RANKS_DE_BASE)[number];

/** O rank que uma instância pode estar exibindo agora. */
export const RANKS_CORRENTES = ['adventurer', 'hero', 'legend'] as const;
export type CharacterRank = (typeof RANKS_CORRENTES)[number];

/**
 * Onde o `Adventurer` vira `Hero`: a METADE da curva de awakening (decisão do usuário).
 *
 * Na curva autorada hoje, 0→3 custa 3.500 de ouro e 3→6 custa 28.000 — o Adventurer paga os
 * dois trechos, o `Hero` de base paga só o de cima. A diferença é de DEGRAUS percorridos, e os
 * caros são os mesmos para os dois.
 */
export const AWAKENING_PARA_HERO = 3;

/** Onde qualquer um vira `Legend`: o topo da curva, que já era o teto do jogo. */
export const AWAKENING_PARA_LEGEND = MAX_AWAKENING;

/**
 * O rank corrente de uma instância, a partir do rank de base do personagem e do awakening dela.
 *
 * Puro e total: awakening fora da faixa não inventa rank — abaixo de zero devolve a base, acima
 * do teto devolve `legend`. Dado de conta corrompido, ou de uma versão futura com teto maior,
 * não pode virar `undefined` na tela.
 */
export function rankCorrente(base: BaseRank, awakening: number): CharacterRank {
  if (awakening >= AWAKENING_PARA_LEGEND) return 'legend';
  if (base === 'hero') return 'hero';
  return awakening >= AWAKENING_PARA_HERO ? 'hero' : 'adventurer';
}
