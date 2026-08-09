import type { GridMap, Coord, MoveType } from '../grid/types.js';
import type { ReactionLine, ActiveEffect, EffectDef } from '../duel/types.js';
import type { TacticsScript, UnitType, WeaponType } from '../tactics/types.js';
import type { SkillDef } from '../skills/types.js';
import type { StatSheet } from '../stats/types.js';
import type { Id } from '../types.js';
import type { InitiativeEntry } from './initiative.js';

// Só há dois lados na lista única de iniciativa (§5.3: "todas as unidades, dos dois
// lados"). Não normativo na spec — decisão registrada em DECISIONS.md.
export type Side = 'player' | 'enemy';

// §9.1 — "IA de mapa declarativa por herói: aggressive | hold-position | guard-tile |
// flank | support-nearest." Definido aqui (não em mapAi.ts, onde nasceu em M7 sub-sessão
// 2) pra `BattleUnit.aiArchetype` poder referenciá-lo sem criar um import circular
// types.ts↔mapAi.ts; mapAi.ts reexporta o mesmo tipo (ver DECISIONS.md, M7 sub-sessão 6).
export type MapAiArchetype = 'aggressive' | 'hold-position' | 'guard-tile' | 'flank' | 'support-nearest';

// §4.2 define UnitOnMap referenciando `heroId`, mas a resolução Hero→stats/scripts (M4/M5)
// não existe ainda — mesma decisão de M2 (DuelParticipant self-contained). `BattleUnit`
// estende UnitOnMap com o perfil de combate já resolvido, igual DuelParticipant.
export interface BattleUnit {
  readonly unitId: Id;
  readonly heroId: Id;
  readonly side: Side;
  readonly pos: Coord;
  readonly height: 0 | 1 | 2 | 3; // vem do tile em `pos`, mas cacheado aqui é mais simples de testar
  readonly hp: number;
  readonly ap: number;
  readonly pp: number;
  readonly hasActedThisRound: boolean;
  // Ausente = controlada por humano (comportamento de M2-M6, preservado 100%); definido =
  // applyCommandAndAdvance/simulate resolvem o turno dessa unidade automaticamente via
  // decideMapAiCommand — decisão registrada em DECISIONS.md, M7 sub-sessão 6.
  readonly aiArchetype?: MapAiArchetype;
  readonly effects: readonly ActiveEffect[];
  readonly cooldowns: Readonly<Record<Id, number>>;
  // Perfil de combate resolvido (mesmos campos de DuelParticipant, M2, menos os que já
  // existem acima como estado de mapa: hp/ap/pp/effects/cooldowns).
  readonly stats: StatSheet;
  readonly unitType: UnitType;
  readonly weaponType: WeaponType;
  readonly duelRange: number;
  readonly assistRange: number; // §6.5/§09-roadmap: melee=2 tiles, ranged=duelRange
  readonly moveType: MoveType;
  readonly moveRange: number;
  readonly tacticsScript: TacticsScript;
  readonly reactionScript: readonly ReactionLine[];
  readonly knownSkills: Readonly<Record<Id, SkillDef>>;
  // §7.4 (M10 sub-sessão 6/N) — efeitos `special` de set ativos (ids canônicos de
  // items/sets.ts). Opcional pelo mesmo motivo de `aiArchetype`: unidades montadas sem
  // passar por resolveHeroCombatProfile (as self-contained de M2-M6, fixtures de teste)
  // não têm equipamento resolvido. Ausente = nenhum efeito special.
  readonly setSpecialEffectIds?: readonly Id[];
}

// §5.7 — "Data-driven por mapa: rout, seize, survive N rounds, escort, defend." Só
// `rout` é resolvido em M3 (ver DECISIONS.md); os demais têm shape mas não implementação.
export type WinCondition =
  | { readonly t: 'rout' }
  | { readonly t: 'seize'; readonly target: Coord }
  | { readonly t: 'surviveRounds'; readonly n: number }
  | { readonly t: 'escort'; readonly unitId: Id; readonly target: Coord }
  | { readonly t: 'defend'; readonly rounds: number };

// §5.7 — "Permadeath é flag do BattleSetup (casual | classic | ironman)".
export type PermadeathMode = 'casual' | 'classic' | 'ironman';

// Coord/BattleSetup/BattleResult não têm shape normativo na spec (§01, §5) — decisões
// registradas em DECISIONS.md.
export interface BattleSetup {
  readonly map: GridMap;
  readonly units: readonly BattleUnit[];
  readonly permadeath: PermadeathMode;
  readonly winCondition: WinCondition;
  readonly effectDefs: Readonly<Record<Id, EffectDef>>;
  readonly initialValor: number; // §5.6 — "Começa em 5"
}

// §01-fundacoes-tecnicas.md §3.3 — union normativa.
export type BattleCommand =
  | { readonly t: 'move'; readonly unitId: Id; readonly path: readonly Coord[] }
  | { readonly t: 'engage'; readonly unitId: Id; readonly targetId: Id }
  | { readonly t: 'mapSkill'; readonly unitId: Id; readonly skillId: Id; readonly target: Coord }
  | { readonly t: 'rest'; readonly unitId: Id }
  | { readonly t: 'useValor'; readonly skillId: Id; readonly target: Coord }
  | { readonly t: 'wait'; readonly unitId: Id };

export interface Replay {
  readonly rulesVersion: string;
  readonly seed: number;
  readonly initialState: BattleSetup;
  readonly commands: readonly BattleCommand[];
}

export interface BattleState {
  readonly map: GridMap;
  readonly units: readonly BattleUnit[];
  readonly initiativeOrder: readonly InitiativeEntry[]; // calculada 1x, nunca recalculada
  readonly round: number;
  readonly valor: number;
  readonly distanceMovedThisTurn: Readonly<Record<Id, number>>; // p/ regra do `rest`
  // §7.4 Sentinela (M10 sub-sessão 6/N) — "Assistir custa 0 PP UMA VEZ POR ROUND DE MAPA":
  // única regra de set cujo escopo é o round, não o duelo, então precisa de estado que
  // sobreviva entre duelos. Zerado por endRound, junto de distanceMovedThisTurn.
  readonly freeAssistUsedThisRound: readonly Id[];
  readonly permadeath: PermadeathMode;
  readonly winCondition: WinCondition;
  readonly effectDefs: Readonly<Record<Id, EffectDef>>;
  readonly outcome: 'ongoing' | 'victory' | 'defeat';
  readonly seed: number;
}

export interface BattleResult {
  readonly outcome: 'ongoing' | 'victory' | 'defeat';
  readonly roundsPlayed: number;
  readonly finalUnits: readonly BattleUnit[];
  readonly finalValor: number;
  // Exposta para provar §5.3: calculada 1x em buildInitialState, nunca recalculada.
  readonly initiativeOrder: readonly InitiativeEntry[];
}
