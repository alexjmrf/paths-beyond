import type { Id } from '@paths-beyond/core';
import type { BannerToken, SummonOutcome } from './types.js';

// M38 3/N — O TOKEN DE 1,5·P (roadmap do M38; D55).
//
// Contador DURO por (jogador, banner rotativo de personagem): conta as rolagens NAQUELE banner
// e não é condicionado a como o destaque saiu — a regra antiga ("tirou no garantido, faça mais
// 50%") punia quem tivesse sorte. É concedido UMA vez por banner e entrega o artefato
// assinatura do destaque.
//
// Bateu o limiar sem possuir o destaque: o token fica PENDENTE, e é pago quando o destaque
// entrar na conta — pelo mesmo banner ou por qualquer outro caminho. É limitado, porque o teto
// de pity garante o destaque.

export type TokenStatus = 'counting' | 'pending' | 'granted';

export interface TokenState {
  readonly rolls: number;
  readonly status: TokenStatus;
}

export const INITIAL_TOKEN: TokenState = { rolls: 0, status: 'counting' };

export interface TokenAdvance {
  readonly state: TokenState;
  // `true` exatamente na transição para `granted`: quem chama entrega `tokenOutcome` e persiste.
  readonly grant: boolean;
}

/**
 * Uma rolagem no banner. `ownsFeatured` é a posse DEPOIS desta rolagem: quem tirou o destaque
 * na própria rolagem do limiar recebe o token nela.
 */
export function advanceToken(state: TokenState, threshold: number, ownsFeatured: boolean): TokenAdvance {
  if (state.status === 'granted') return { state, grant: false };

  const rolls = state.rolls + 1;
  if (rolls < threshold) return { state: { rolls, status: 'counting' }, grant: false };
  if (ownsFeatured) return { state: { rolls, status: 'granted' }, grant: true };
  return { state: { rolls, status: 'pending' }, grant: false };
}

/** O destaque entrou na conta por fora deste banner: paga o token, se ele estiver pendente. */
export function resolvePendingToken(state: TokenState, ownsFeatured: boolean): TokenAdvance {
  if (state.status !== 'pending' || !ownsFeatured) return { state, grant: false };
  return { state: { rolls: state.rolls, status: 'granted' }, grant: true };
}

/** O que o token entrega: o artefato do destaque, ou o fragmento dele se o jogador já o tem. */
export function tokenOutcome(token: BannerToken, ownedArtifacts: readonly Id[]): SummonOutcome {
  return ownedArtifacts.includes(token.artifactId)
    ? { kind: 'artifactDuplicate', artifactId: token.artifactId, rank: 'hero', fragmentMaterialId: token.fragmentMaterialId }
    : { kind: 'artifact', artifactId: token.artifactId, rank: 'hero' };
}
