import type { Id } from '../types.js';

// §6.4 — quando uma reação é avaliada.
export type ReactionTrigger = 'onAttacked' | 'onDamaged' | 'onDebuffed' | 'onAllyEngagedNearby' | 'onLethal';

// §6.4 (M10 sub-sessão 8/N) — com que frequência um gatilho de morte (`trigger:'onLethal'`)
// pode disparar. Vive no DADO, não no motor: a frequência depende do que a skill faz
// (decisão do usuário registrada em DECISIONS.md). `perDuel` recarrega a cada duelo e é
// estado local de resolveDuel; `perBattle` sobrevive ao duelo e é persistido pela camada
// de batalha em `BattleUnit.lethalTriggersUsed`.
export type LethalUses = 'perDuel' | 'perBattle';

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
  readonly duelRange?: number; // herda da arma se ausente; em `kind:'map'` é o alcance de lançamento (§5.4, M11)
  // §5.4 (M11 sub-sessão 2/N) — raio em distância Manhattan (§5.1) da área atingida por
  // uma skill de mapa, medido a partir do tile alvo do comando. Ausente/0 = só o tile
  // alvo. Quem a área atinge não é declarado: é derivado do que a skill faz (tag `heal` →
  // aliados, dano → inimigos, efeito → pelo `EffectDef.kind`) — ver DECISIONS.md.
  readonly areaRadius?: number;
  readonly effects: readonly EffectApplication[];
  readonly trigger?: ReactionTrigger;
  // §6.4 (M10 sub-sessão 8/N) — só faz sentido com `trigger:'onLethal'`; `packages/data`
  // exige o campo nesse caso. Ausente = `perDuel` (o escopo mais conservador).
  readonly lethalUses?: LethalUses;
  // §6.4 (M10) — reação que TODA unidade tem, sem precisar de talento (Contra-atacar,
  // Defender). Ausente/false = concedida por classe ou talento. O core não deriva nada
  // daqui — quem monta o reactionScript recebe `baselineReactionSkillIds` já pronto
  // (combatProfile.ts); o campo existe pra `packages/content` poder derivar essa lista.
  readonly baseline?: boolean;
  readonly tags: readonly string[];
}
