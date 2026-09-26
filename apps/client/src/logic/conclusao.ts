import type { LiquidacaoDaPartida } from '../data/api.js';

// M35 9/N — o CONTEÚDO da tela de conclusão: resultado, loot e o que fazer em seguida.
//
// Pedido do usuário: "ao terminar a missão já pode aparecer uma tela de conclusão mostrando
// resultado e loot, e a opção de voltar ao menu ou continuar para a próxima missão". Quem decide
// o desfecho e o loot é o servidor (vem na `liquidacao`, no comando que fechou a batalha); aqui
// só se organiza o que mostrar. Função pura: o componente desenha, este arquivo se testa.

export type ModoDaPartida = 'campaign' | 'dungeon' | 'pvp';

export type LinhaDeLoot =
  | { readonly tipo: 'premium' | 'ouro' | 'pedras' | 'exp' | 'elo' | 'marcas'; readonly valor: number }
  | { readonly tipo: 'material' | 'item'; readonly id: string; readonly valor: number };

export type AcaoDaConclusao = 'proxima' | 'repetir' | 'menu' | 'rever';

export interface SubidaNaConclusao {
  readonly heroId: string;
  readonly level: number;
}

export interface Conclusao {
  readonly venceu: boolean;
  // M39 1/N — quem subiu de nível com o exp desta vitória.
  readonly subidas: readonly SubidaNaConclusao[];
  readonly rounds: number;
  readonly loot: readonly LinhaDeLoot[];
  readonly acoes: readonly AcaoDaConclusao[];
  readonly proximaMissaoId: string | null;
}

interface CapituloMinimo {
  readonly missions: readonly { readonly id: string }[];
}

/** A missão depois de `missaoId`, na ordem dos capítulos; `null` na última ou se não existe. */
export function missaoSeguinte(capitulos: readonly CapituloMinimo[], missaoId: string): string | null {
  const ordem = capitulos.flatMap((c) => c.missions.map((m) => m.id));
  const i = ordem.indexOf(missaoId);
  return i >= 0 && i + 1 < ordem.length ? ordem[i + 1]! : null;
}

export interface EntradaDaConclusao {
  readonly modo: ModoDaPartida;
  readonly outcome: 'ongoing' | 'victory' | 'defeat';
  readonly rounds: number;
  readonly liquidacao: LiquidacaoDaPartida | null;
  readonly refId: string | null;
  readonly capitulos: readonly CapituloMinimo[];
}

function lootDe(modo: ModoDaPartida, liquidacao: LiquidacaoDaPartida | null): LinhaDeLoot[] {
  const loot: LinhaDeLoot[] = [];
  if (!liquidacao) return loot;
  if (liquidacao.premiumAwarded && liquidacao.premiumAwarded > 0) loot.push({ tipo: 'premium', valor: liquidacao.premiumAwarded });
  const r = liquidacao.rewards;
  if (r) {
    if (r.gold > 0) loot.push({ tipo: 'ouro', valor: r.gold });
    if (r.stones > 0) loot.push({ tipo: 'pedras', valor: r.stones });
    if (r.exp > 0) loot.push({ tipo: 'exp', valor: r.exp });
    for (const [id, valor] of Object.entries(r.materials)) if (valor > 0) loot.push({ tipo: 'material', id, valor });
    for (const item of r.items) loot.push({ tipo: 'item', id: item.id, valor: 1 });
  }
  // M39 1/N — o exp da vitória numa instância PvE: a soma dos inimigos, dada a cada herói.
  if (liquidacao.exp && liquidacao.exp > 0) loot.push({ tipo: 'exp', valor: liquidacao.exp });
  if (modo === 'pvp') {
    if (liquidacao.elo) loot.push({ tipo: 'elo', valor: liquidacao.elo.attacker });
    if (liquidacao.arenaMarks) loot.push({ tipo: 'marcas', valor: liquidacao.arenaMarks.attacker });
  }
  return loot;
}

export function conclusaoDaPartida(entrada: EntradaDaConclusao): Conclusao | null {
  if (entrada.outcome === 'ongoing') return null;
  const venceu = entrada.outcome === 'victory';
  const proximaMissaoId =
    entrada.modo === 'campaign' && venceu && entrada.refId ? missaoSeguinte(entrada.capitulos, entrada.refId) : null;

  const acoes: AcaoDaConclusao[] = [];
  if (proximaMissaoId) acoes.push('proxima');
  if (entrada.modo === 'campaign' && !venceu) acoes.push('repetir');
  acoes.push('menu', 'rever');

  const subidas = (entrada.liquidacao?.subidas ?? []).map((s) => ({ heroId: s.heroId, level: s.level }));
  return { venceu, rounds: entrada.rounds, loot: lootDe(entrada.modo, entrada.liquidacao), acoes, proximaMissaoId, subidas };
}
