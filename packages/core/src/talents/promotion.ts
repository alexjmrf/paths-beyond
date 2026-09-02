import type { Id } from '../types.js';
import type { TalentAllocation } from './types.js';

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
}

export interface PromoteResult {
  readonly classId: Id;
  readonly talents: TalentAllocation;
}

// §8.1 (M17) — a promoção NÃO TOCA MAIS NA ÁRVORE, e isso não é uma simplificação: é o
// que sobra quando a árvore deixa de pertencer à classe.
//
// A versão antiga resetava a árvore de especialização e preservava a de classe, porque
// promover trocava a spec e a spec tinha árvore própria. Com §8.2 ("uma árvore por
// personagem... ela é parte de quem ele é"), trocar a classe de um personagem não troca
// a árvore dele — não há o que resetar, e resetar seria punir o jogador por progredir.
// O que a promoção muda é de onde vem a curva de stat, `moveType`, armas e pools (D2).
//
// `promote` continua existindo, e continua sem chamador de produção: §8.1 mantém a
// promoção normativa e este é o lugar onde a regra dela mora quando ela for ligada.
export function promote(input: PromoteInput): PromoteResult {
  return {
    classId: input.newClassId,
    talents: input.allocation,
  };
}
