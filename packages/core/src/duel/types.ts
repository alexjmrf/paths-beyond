import type { Id } from '../types.js';
import type { SkillDef } from '../skills/types.js';
import type { StatModifier, StatSheet } from '../stats/types.js';
import type { Condition, TacticsScript, UnitType, WeaponType } from '../tactics/types.js';

// §6.4/§6.5 — linha de reação: mesmo formato de TacticsLine, mas o trigger e o custo de
// PP vêm da própria SkillDef referenciada (kind:'reaction', trigger, ppCost) em vez de
// campos próprios — evita duplicar o que já está em skills/types.ts.
export interface ReactionLine {
  readonly enabled: boolean;
  readonly skillId: Id;
  readonly conditions: readonly Condition[];
}

// §6.9 — payload de um efeito (o que ele FAZ). ActiveEffect (abaixo) é só o estado da
// instância (id/duração/stacks); o efeito em si é conteúdo de dado (packages/data),
// core só tem a cópia de tipo (regra 1).
export interface EffectDef {
  readonly id: Id;
  readonly name: string;
  readonly kind: 'buff' | 'debuff';
  readonly dispellable: boolean;
  readonly maxStacks: number;
  readonly statMods: readonly StatModifier[]; // §4.1 passo 8 — aplicado ao stat sheet dentro do duelo
  readonly damageDealtPct?: number; // §6.6 passo 8
  readonly damageTakenReductionPct?: number; // §6.6 passo 8
  // §6.9 — DoT/regeneração: percentual do HP MÁXIMO do alvo, por tick de round de mapa.
  // Campo normativo exigido por M10 (ver DECISIONS.md); ainda não consumido por
  // round.ts nesta sub-sessão — só declarado, pronto para a sub-sessão que liga o tick.
  readonly periodicDamagePct?: number;
  readonly periodicHealPct?: number;
}

// §6.9 — ActiveEffect, exatamente como a spec define (estado da instância).
export interface ActiveEffect {
  readonly id: Id; // referencia um EffectDef
  readonly duration: number | 'duel' | 'battle';
  readonly stacks: number;
  readonly maxStacks: number;
  readonly dispellable: boolean;
}

// Formato self-contained lido por `sim-cli duel A.json B.json` (decisão registrada em
// DECISIONS.md): tudo já resolvido — stat sheet estático (M1), pools atuais, scripts,
// skills conhecidas. A costura Hero+Class+Item+Talento → isto é trabalho de M3-M5.
export interface DuelParticipant {
  readonly id: Id;
  readonly stats: StatSheet; // sheet estático, passos 1-7 de §4.1 (M1)
  readonly currentHp: number;
  readonly ap: number; // pool atual, de batalha inteira
  readonly pp: number; // pool atual, de batalha inteira
  readonly unitType: UnitType;
  readonly weaponType: WeaponType;
  readonly duelRange: number; // herda da arma
  readonly tacticsScript: TacticsScript;
  readonly reactionScript: readonly ReactionLine[];
  readonly knownSkills: Readonly<Record<Id, SkillDef>>;
  readonly cooldowns: Readonly<Record<Id, number>>; // rounds de MAPA restantes; fixo durante o duelo
  readonly activeEffects: readonly ActiveEffect[];
  readonly positionalMultiplier: number; // flanco/cerco/altura/terreno já resolvidos (grid é M3)
  // §7.4 (M10 sub-sessão 6/N) — efeitos `special` de set que o duelo interpreta:
  // Duelista (contra-atacar de graça na troca 1) e Imunidade (sem debuff na troca 1).
  // Opcional: o formato self-contained lido por `sim-cli` e as fixtures de M2 não têm
  // equipamento resolvido. Ausente = nenhum efeito special.
  readonly setSpecialEffectIds?: readonly Id[];
  // §6.4 (M10 sub-sessão 8/N) — gatilhos de morte `lethalUses:'perBattle'` já consumidos
  // em duelos anteriores desta batalha. Opcional pelo mesmo motivo de `setSpecialEffectIds`:
  // as fixtures self-contained de M2-M6 e o formato de `sim-cli` não têm esse estado.
  // Ausente = nenhum gatilho gasto ainda.
  readonly lethalTriggersUsed?: readonly Id[];
}

// §6.2 — "o ataque básico custa 0 AP e está sempre disponível". Regra do motor, não
// conteúdo de jogo (não há número de balanceamento aqui pra viver em packages/data).
export const BASIC_ATTACK_SKILL: SkillDef = {
  id: 'core:basic-attack',
  name: 'Ataque Básico',
  kind: 'duel',
  apCost: 0,
  cooldown: 0,
  multiplier: 1000,
  flat: 0,
  scalesWith: 'atk',
  effects: [],
  tags: ['physical'],
};

// Modificadores que dependem de grid/battle (M3) — external inputs em M2 (headless).
export interface DuelEngagementContext {
  readonly engagementDistance: number; // §6.1 — usado só para a assimetria ranged
  readonly terrainAccuracyModifier: number;
  readonly heightAccuracyModifier: number;
  // §5.5 (M3) — evaBonus de terreno + penalidade de cerco, já somados pelo engage. Campo
  // duel-global (soma nos dois sentidos da troca), mesma simplificação de height/terrain
  // acima — direcionalidade exata exigiria outro corte por participante (ver DECISIONS.md).
  readonly defenderEvasionModifier: number;
  readonly battleRound: number;
}
