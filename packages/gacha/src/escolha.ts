import type { Id } from '@paths-beyond/core';
import { outcomeFor } from './roll.js';
import { entryId, type BannerEntry, type GenericBanner, type SummonOutcome } from './types.js';

// M38 3/N (D54/D55) — A ESCOLHA DO GENÉRICO.
//
// A cada `choiceEvery` rolagens no genérico, o jogador escolhe qualquer entrada `hero` do pool —
// personagem ou artefato. O contador é PRÓPRIO: separado do soft pity (que zera ao sair um
// prêmio), ele não sabe o que saiu no caminho e só zera ao conceder. As escolhas não resgatadas
// acumulam em `pending`.

export interface ChoiceState {
  readonly rolls: number;
  readonly pending: number;
}

export const INITIAL_CHOICE: ChoiceState = { rolls: 0, pending: 0 };

export function advanceChoice(state: ChoiceState, every: number): ChoiceState {
  const rolls = state.rolls + 1;
  return rolls >= every ? { rolls: 0, pending: state.pending + 1 } : { rolls, pending: state.pending };
}

export function choosableEntries(banner: GenericBanner): readonly BannerEntry[] {
  return banner.pool.filter((entry) => entry.rank === 'hero');
}

export type ChoiceRedemption =
  | { readonly ok: true; readonly state: ChoiceState; readonly outcome: SummonOutcome }
  | { readonly ok: false; readonly reason: 'sem-escolha' | 'fora-do-pool' };

export function redeemChoice(
  banner: GenericBanner,
  state: ChoiceState,
  chosenId: Id,
  owned: readonly Id[],
  ownedArtifacts: readonly Id[],
): ChoiceRedemption {
  if (state.pending < 1) return { ok: false, reason: 'sem-escolha' };
  const entry = choosableEntries(banner).find((candidate) => entryId(candidate) === chosenId);
  if (!entry) return { ok: false, reason: 'fora-do-pool' };
  return {
    ok: true,
    state: { rolls: state.rolls, pending: state.pending - 1 },
    outcome: outcomeFor(entry, owned, ownedArtifacts),
  };
}
