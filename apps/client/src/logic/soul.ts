import { soulSlotOpen, type Hero, type SoulCost, type SoulInstance, type SoulRules } from '@paths-beyond/core';

// M39 5/N (D59/D61) — o que a tela mostra da Soul. Nada aqui decide (regra 3): a trava de nível
// é `soulSlotOpen` do core com o número do catálogo, e quem cobra e sorteia é o servidor. O
// "basta" do custo só desliga o botão — o servidor recusa de novo se a conta mudou.

export interface EstadoDoSlotDeSoul {
  readonly aberto: boolean;
  readonly nivelParaAbrir: number;
}

export function estadoDoSlotDeSoul(hero: Hero, rules: SoulRules): EstadoDoSlotDeSoul {
  return { aberto: soulSlotOpen(hero, rules), nivelParaAbrir: rules.unlockLevel };
}

/** As Souls da conta que são DESTE personagem (a trava é por personagem, `soulOf`). */
export function soulsDoPersonagem(souls: readonly SoulInstance[], characterId: string | undefined): readonly SoulInstance[] {
  return characterId ? souls.filter((s) => s.soulOf === characterId) : [];
}

/** A Soul equipada no herói; ausente ou de outro personagem = slot vazio na conta da tela. */
export function soulDoHeroi(hero: Hero, souls: readonly SoulInstance[]): SoulInstance | undefined {
  const soul = souls.find((s) => s.id === hero.soul);
  return soul && soul.soulOf === hero.characterId ? soul : undefined;
}

export interface CustoExibido {
  readonly ouro: { readonly tem: number; readonly precisa: number };
  readonly materiais: readonly { readonly id: string; readonly tem: number; readonly precisa: number }[];
  readonly basta: boolean;
}

export function custoDaSoul(
  cost: SoulCost,
  wallet: { readonly gold: number },
  materials: Readonly<Record<string, number>>,
): CustoExibido {
  const materiais = Object.entries(cost.materials).map(([id, precisa]) => ({ id, tem: materials[id] ?? 0, precisa }));
  return {
    ouro: { tem: wallet.gold, precisa: cost.gold },
    materiais,
    basta: wallet.gold >= cost.gold && materiais.every((m) => m.tem >= m.precisa),
  };
}

export type AcaoEmDoisTempos = 'recraft' | 'descartar';

/**
 * O recraft re-sorteia TUDO e apaga a Soul atual (D59), e o descartar a apaga de vez (D64), então
 * os dois pedem dois cliques: o primeiro arma, o segundo na MESMA ação da MESMA Soul manda.
 * Qualquer outro clique rearma nele — um recraft armado nunca confirma um descartar.
 */
export function cliqueEmDoisTempos(
  armada: string | null,
  acao: AcaoEmDoisTempos,
  soulId: string,
): { readonly enviar: boolean; readonly armada: string | null } {
  const chave = `${acao}:${soulId}`;
  return armada === chave ? { enviar: true, armada: null } : { enviar: false, armada: chave };
}
