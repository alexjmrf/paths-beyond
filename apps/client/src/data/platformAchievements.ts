import { api, type RewardView } from './api.js';
import { platformBridge, type PlatformBridge } from './platformBridge.js';

// §9.4 (M21, sub-sessão 3/N) — o cliente ENCAMINHANDO as conquistas para a plataforma.
//
// Regra 3 do projeto: nenhuma regra no cliente. Aqui não há avaliação de condição nenhuma —
// quem diz o que está cumprido é o servidor, contra o banco (`rewards/conditions.ts`), e ele
// já devolve isso pronto em `/me/rewards`, junto do nome de cada conquista na plataforma.
// Este arquivo filtra o que veio marcado como cumprido e passa as strings adiante.
//
// **Nada disso acontece no navegador**, e não é uma limitação: não existe plataforma para
// desbloquear conquista fora do shell. A ponte de desenvolvimento não tem `syncAchievements`,
// então a função sai pela primeira linha e nem a requisição é feita.

export function espelhosCumpridos(rewards: readonly RewardView[]): string[] {
  return rewards.filter((reward) => reward.platform?.earned).map((reward) => reward.platform!.id);
}

/**
 * Espelha na plataforma as conquistas de uma lista de prêmios JÁ CARREGADA.
 *
 * Usada onde a tela acabou de ler `/me/rewards` de qualquer jeito — não custa requisição.
 * Nunca lança: conquista é enfeite de perfil, e falhar não pode custar a tela ao jogador.
 */
export async function espelharConquistas(
  rewards: readonly RewardView[],
  bridge: PlatformBridge = platformBridge,
): Promise<void> {
  if (!bridge.syncAchievements) return;

  const cumpridas = espelhosCumpridos(rewards);
  if (cumpridas.length === 0) return;

  try {
    await bridge.syncAchievements(cumpridas);
  } catch {
    // A ponte do shell já engole a falha; este `catch` é para a ponte que ninguém previu.
  }
}

/**
 * Espelha as conquistas da conta logo depois do sign-in.
 *
 * **Por que aqui e não só na tela de prêmios** (decisão do usuário): a tela de prêmios é
 * opcional, e quem nunca a abre continuaria com o perfil vazio na plataforma mesmo tendo
 * limpado a campanha inteira. O sign-in é o único ponto por onde todo jogador passa.
 *
 * A requisição extra só existe dentro do shell — no navegador a função sai antes dela.
 */
export async function sincronizarConquistasDaConta(
  ticket: string,
  bridge: PlatformBridge = platformBridge,
): Promise<void> {
  if (!bridge.syncAchievements) return;

  try {
    const { rewards } = await api.rewards(ticket);
    await espelharConquistas(rewards, bridge);
  } catch {
    // Servidor fora do ar no meio do sign-in não pode impedir o jogador de entrar: a
    // próxima sincronização (o próximo sign-in, ou a tela de prêmios) tenta de novo.
  }
}
