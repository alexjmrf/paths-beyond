import type { GridMap, Coord, MoveType } from '../grid/types.js';
import type { ReactionLine, ActiveEffect, EffectDef } from '../duel/types.js';
import type { TacticsScript, UnitType, WeaponType } from '../tactics/types.js';
import type { SkillDef } from '../skills/types.js';
import type { StatSheet } from '../stats/types.js';
import type { Id } from '../types.js';
import type { InitiativeEntry } from './initiative.js';
import type { ValorSkillDef } from './valor.js';

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
  // §6.4 (M10 sub-sessão 8/N) — gatilhos de morte `lethalUses:'perBattle'` já consumidos
  // nesta batalha, seja em duelo ou no tick de DoT. É o que faz "uma vez por batalha"
  // significar de fato uma vez, atravessando duelos. Ausente = nenhum gasto ainda.
  readonly lethalTriggersUsed?: readonly Id[];
}

// §5.7 — "Data-driven por mapa: rout, seize, survive N rounds, escort, defend." Todas
// resolvidas em `winCondition.ts` desde M11; a spec nomeia as cinco sem definir nenhuma,
// então as leituras estão registradas em DECISIONS.md.
export type WinCondition =
  | { readonly t: 'rout' }
  | { readonly t: 'seize'; readonly target: Coord }
  | { readonly t: 'surviveRounds'; readonly n: number }
  | { readonly t: 'escort'; readonly unitId: Id; readonly target: Coord }
  // `target` é campo de M11: sem ele `defend` seria um sinônimo de `surviveRounds`
  // (decisão do usuário). Segure `rounds` rounds SEM deixar inimigo pisar no tile.
  | { readonly t: 'defend'; readonly rounds: number; readonly target: Coord };

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
  // §5.6 (M11 sub-sessão 3/N) — catálogo de `data/valor-skills/*.json` que `useValor`
  // resolve. Opcional pelo mesmo motivo de `setSpecialEffectIds`/`aiArchetype`: as
  // batalhas montadas à mão em M2-M6 e as fixtures de teste não têm catálogo. Ausente =
  // nenhuma skill de Valor resolvível, e todo `useValor` é rejeitado.
  readonly valorSkills?: Readonly<Record<Id, ValorSkillDef>>;
  // §5.6 (M15 D2) — perfis de combate já resolvidos que `summonReinforcement` pode invocar,
  // indexados pelo `blueprintId` que a valor-skill nomeia. Chega pronto de fora pelo mesmo
  // motivo de `valorSkills`: montar um `BattleUnit` a partir de `Hero`+catálogo é trabalho
  // de `packages/content`, e o core não importa conteúdo (regra 1). O motor sobrescreve
  // `unitId`, `pos`, `height`, `side` e `hasActedThisRound` no momento da invocação.
  readonly summonBlueprints?: Readonly<Record<Id, BattleUnit>>;
  readonly initialValor: number; // §5.6 — "Começa em 5"
}

// §5.1 (M15 D3) — estado de um portão NESTA batalha. `hits` são turnos-unidade de pancada
// acumulados por quem não consegue abri-lo (ver battle/gates.ts).
export interface GateProgress {
  readonly opened: boolean;
  readonly hits: number;
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
  readonly valorSkills?: Readonly<Record<Id, ValorSkillDef>>; // §5.6 — ver BattleSetup
  readonly summonBlueprints?: Readonly<Record<Id, BattleUnit>>; // §5.6 (M15 D2) — ver BattleSetup
  // §5.1 (M15 D3) — portões tocados nesta batalha, por `coordKey`. Ausente = nenhum portão
  // aberto nem golpeado, que é o estado de toda batalha que não tem portão no mapa.
  readonly gateState?: Readonly<Record<string, GateProgress>>;
  // §5.6 (M15) — objetivos já capturados, por `coordKey`. É o que faz "+2 ao capturar" ser
  // uma captura e não uma renda: entrar e sair do mesmo fort não paga duas vezes.
  readonly capturedObjectives?: readonly string[];
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
