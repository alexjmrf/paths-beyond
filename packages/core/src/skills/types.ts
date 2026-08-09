import type { Id } from '../types.js';

// §6.4 — quando uma reação é avaliada.
export type ReactionTrigger = 'onAttacked' | 'onDamaged' | 'onDebuffed' | 'onAllyEngagedNearby' | 'onLethal';

// §8.3 — efeito que uma skill aplica ao acertar (referencia um EffectDef de packages/data).
export interface EffectApplication {
  readonly effectId: Id;
  readonly target: 'self' | 'target';
  readonly chance: number; // fp-scale (1000 = 100%), antes de eff/efr (§6.9)
  readonly stacks?: number;
  // §6.9 (M10) — por quanto tempo o ActiveEffect criado por esta aplicação dura; mesmo
  // formato de ActiveEffect.duration (número = rounds de mapa, ou 'duel'/'battle').
  readonly duration: number | 'duel' | 'battle';
}

// §8.3 — SkillDef. Cópia própria do core (regra 1: core não importa de packages/data).
export interface SkillDef {
  readonly id: Id;
  readonly name: string;
  readonly kind: 'duel' | 'map' | 'reaction';
  readonly apCost: number;
  readonly ppCost?: number;
  readonly cooldown: number; // rounds de mapa
  readonly multiplier: number; // fp-scale
  readonly flat: number;
  readonly scalesWith: 'atk' | 'def' | 'hp';
  readonly duelRange?: number; // herda da arma se ausente
  readonly effects: readonly EffectApplication[];
  readonly trigger?: ReactionTrigger;
  // §6.4 (M10) — reação que TODA unidade tem, sem precisar de talento (Contra-atacar,
  // Defender). Ausente/false = concedida por classe ou talento. O core não deriva nada
  // daqui — quem monta o reactionScript recebe `baselineReactionSkillIds` já pronto
  // (combatProfile.ts); o campo existe pra `packages/content` poder derivar essa lista.
  readonly baseline?: boolean;
  readonly tags: readonly string[];
}
