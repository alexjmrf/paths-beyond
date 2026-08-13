import type { Coord, GridMap } from '../grid/types.js';
import { resolveHeroCombatProfile, type HeroCombatProfile } from '../hero/combatProfile.js';
import type { ClassDef, Hero } from '../hero/types.js';
import type { ItemInstance, ItemSet } from '../items/types.js';
import type { SkillDef } from '../skills/types.js';
import type { WeaponType } from '../tactics/types.js';
import type { Id } from '../types.js';
import type { BattleSetup, BattleUnit, MapAiArchetype, PermadeathMode, Side, WinCondition } from './types.js';
import type { ValorSkillDef } from './valor.js';
import type { EffectDef } from '../duel/types.js';

export interface BuildBattleUnitInput {
  readonly unitId: Id;
  readonly heroId: Id;
  readonly side: Side;
  readonly pos: Coord;
  readonly height: 0 | 1 | 2 | 3;
  readonly profile: HeroCombatProfile;
}

// Última etapa da cadeia Hero→BattleUnit (M7): resolveHeroStatSheet (sub-sessão 1) monta
// os stats, resolveHeroCombatProfile (sub-sessão 4) monta o resto do perfil de combate;
// esta função só adiciona o que depende de ONDE/COMO o herói entra na batalha — posição
// no mapa e lado — coisas que nenhuma resolução de Hero isolada pode saber. HP/AP/PP
// começam cheios (§5.3: sem persistência de dano/recurso entre batalhas); sem efeitos
// ativos nem cooldowns (unidade nova na batalha, nunca esteve em rounds anteriores).
export function buildBattleUnit(input: BuildBattleUnitInput): BattleUnit {
  const { unitId, heroId, side, pos, height, profile } = input;

  return {
    unitId,
    heroId,
    side,
    pos,
    height,
    hp: profile.stats.hp,
    ap: profile.startingAp,
    pp: profile.startingPp,
    hasActedThisRound: false,
    effects: [],
    cooldowns: {},
    stats: profile.stats,
    unitType: profile.unitType,
    weaponType: profile.weaponType,
    duelRange: profile.duelRange,
    assistRange: profile.assistRange,
    moveType: profile.moveType,
    moveRange: profile.moveRange,
    tacticsScript: profile.tacticsScript,
    reactionScript: profile.reactionScript,
    knownSkills: profile.knownSkills,
    setSpecialEffectIds: profile.setSpecialEffectIds,
  };
}

export interface HeroPlacement {
  readonly unitId: Id;
  readonly hero: Hero;
  readonly classDef: ClassDef;
  readonly equippedItems: readonly ItemInstance[];
  readonly side: Side;
  readonly pos: Coord;
  readonly height: 0 | 1 | 2 | 3;
  readonly aiArchetype?: MapAiArchetype;
}

export interface BuildBattleSetupFromHeroesInput {
  readonly placements: readonly HeroPlacement[];
  readonly map: GridMap;
  readonly permadeath: PermadeathMode;
  readonly winCondition: WinCondition;
  readonly effectDefs: Readonly<Record<Id, EffectDef>>;
  readonly initialValor: number;
  readonly itemSets: Readonly<Record<Id, ItemSet>>;
  readonly skillsCatalog: Readonly<Record<Id, SkillDef>>;
  readonly weaponDuelRanges: Readonly<Record<WeaponType, number>>;
  readonly baselineReactionSkillIds: readonly Id[];
  // §5.6 (M12, sub-sessão 4/N) — o catálogo de skills de Valor da batalha. Opcional pelo
  // mesmo motivo que em `BattleSetup`/`BattleState` (M11, sub-sessão 3/N): mapa sem
  // valor-skills declaradas é legítimo, e `applyUseValor` já rejeita alto nesse caso.
  // Sem este repasse o campo era inalcançável por quem monta a batalha a partir de
  // heróis — ou seja, por cliente, servidor e `tools/balance` — e Valor só existia em
  // teste, com o saldo aparecendo no HUD sem nada que o gastasse.
  readonly valorSkills?: Readonly<Record<Id, ValorSkillDef>>;
}

// Compõe as duas etapas anteriores (resolveHeroCombatProfile, sub-sessão 4;
// buildBattleUnit, acima) pra montar um `BattleSetup` inteiro a partir de heróis reais —
// a peça que faltava pro endpoint de batalha PvP (M7, sub-sessão 7) e, futuramente, pro
// cliente montar uma partida real (hoje ainda usa unidades self-contained, M6). Fica em
// `packages/core`, não no servidor nem no cliente, pelo mesmo motivo de `resolveAiTurns`
// (sub-sessão 6): se cada lado remontasse esse cabo de ponta a ponta por conta própria,
// o risco de divergir é real — §9.1: "divergência = bug crítico".
export function buildBattleSetupFromHeroes(input: BuildBattleSetupFromHeroesInput): BattleSetup {
  const units = input.placements.map((placement): BattleUnit => {
    const profile = resolveHeroCombatProfile({
      hero: placement.hero,
      classDef: placement.classDef,
      equippedItems: placement.equippedItems,
      itemSets: input.itemSets,
      skillsCatalog: input.skillsCatalog,
      weaponDuelRanges: input.weaponDuelRanges,
      baselineReactionSkillIds: input.baselineReactionSkillIds,
    });

    const unit = buildBattleUnit({
      unitId: placement.unitId,
      heroId: placement.hero.id,
      side: placement.side,
      pos: placement.pos,
      height: placement.height,
      profile,
    });

    return placement.aiArchetype ? { ...unit, aiArchetype: placement.aiArchetype } : unit;
  });

  return {
    map: input.map,
    units,
    permadeath: input.permadeath,
    winCondition: input.winCondition,
    effectDefs: input.effectDefs,
    initialValor: input.initialValor,
    ...(input.valorSkills ? { valorSkills: input.valorSkills } : {}),
  };
}
