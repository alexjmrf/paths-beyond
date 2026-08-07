import type { Id } from '../types.js';
import { resetTree } from './reset.js';
import type { TalentAllocation, TalentNode } from './types.js';

// §8.1 — "Promoção exige item + nível mínimo, e é irreversível sem item raro de reset."
// Sem sistema de inventário no projeto ainda: `hasRequiredItem` é resolvido por fora
// (decisão registrada em DECISIONS.md) em vez de checar um item de verdade.
export interface PromotionRequirement {
  readonly minLevel: number;
  readonly itemId?: Id;
}

export interface CanPromoteInput {
  readonly heroLevel: number;
  readonly requirement: PromotionRequirement;
  readonly hasRequiredItem: boolean;
}

export interface CanPromoteResult {
  readonly allowed: boolean;
  readonly reason?: string;
}

export function canPromote(input: CanPromoteInput): CanPromoteResult {
  if (input.heroLevel < input.requirement.minLevel) {
    return { allowed: false, reason: `exige nível ${input.requirement.minLevel}` };
  }
  if (input.requirement.itemId && !input.hasRequiredItem) {
    return { allowed: false, reason: 'item de promoção ausente' };
  }
  return { allowed: true };
}

export interface PromoteInput {
  readonly newClassId: Id;
  readonly allocation: TalentAllocation;
  readonly specTreeNodes: readonly TalentNode[]; // árvore de especialização da classe ANTIGA
}

export interface PromoteResult {
  readonly classId: Id;
  readonly talents: TalentAllocation;
}

// §8.2 — "Classe (8 pontos, compartilhada entre specs)": a promoção troca a classe e
// reseta só a árvore de especialização; os pontos de classe (compartilhados) ficam.
export function promote(input: PromoteInput): PromoteResult {
  return {
    classId: input.newClassId,
    talents: resetTree(input.allocation, 'spec', input.specTreeNodes),
  };
}
