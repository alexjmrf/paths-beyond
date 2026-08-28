import type { Hero } from '../hero/types.js';
import type { Id } from '../types.js';
import type { AwakenResult, AwakeningStep, MaterialBag, Wallet } from './types.js';

// §10 — "Awakening (0–6): multiplica a curva base e libera nós avançados de talento a
// partir de 5."
//
// O EFEITO já existia desde M7 (`resolveHeroStatSheet`, passo 1b, e o gate de talento
// desta mesma fatia). O que faltava era a AQUISIÇÃO. Decisão do usuário: consome materiais
// da masmorra de Chefe — que §10 já define como "materiais de promoção" — mais ouro.
//
// O teto 6 é da spec e é do motor; os custos são dado (`steps`), um por passo.

export const MAX_AWAKENING = 6;

export interface AwakenInput {
  readonly hero: Hero;
  readonly wallet: Wallet;
  readonly materials: MaterialBag;
  readonly steps: readonly AwakeningStep[]; // índice 0 = passo 0→1
}

export function awaken(input: AwakenInput): AwakenResult {
  const current = input.hero.awakening;
  if (current >= MAX_AWAKENING) {
    return { ok: false, reason: `awakening já está no teto de ${MAX_AWAKENING}` };
  }

  const step = input.steps[current];
  if (!step) {
    // Tabela mais curta que a faixa 0–6: é erro de conteúdo, e falhar alto é melhor que
    // despertar de graça.
    return { ok: false, reason: `tabela de awakening não define o passo ${current}→${current + 1}` };
  }

  if (input.wallet.gold < step.gold) {
    return { ok: false, reason: `ouro insuficiente: ${input.wallet.gold} de ${step.gold}` };
  }

  for (const [materialId, needed] of Object.entries(step.materials)) {
    const owned = input.materials[materialId] ?? 0;
    if (owned < needed) {
      return { ok: false, reason: `material insuficiente: ${materialId} (${owned} de ${needed})` };
    }
  }

  const materials: Record<Id, number> = { ...input.materials };
  for (const [materialId, needed] of Object.entries(step.materials)) {
    materials[materialId] = (materials[materialId] ?? 0) - needed;
  }

  return {
    ok: true,
    hero: { ...input.hero, awakening: (current + 1) as Hero['awakening'] },
    wallet: { ...input.wallet, gold: input.wallet.gold - step.gold },
    materials,
  };
}
