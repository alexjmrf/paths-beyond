import { PHYSICAL_CYCLE } from '../duel/triangle.js';
import type { ReactionLine } from '../duel/types.js';
import type { MoveType } from '../grid/types.js';
import type { ItemInstance, ItemSet } from '../items/types.js';
import type { SkillDef } from '../skills/types.js';
import type { StatSheet } from '../stats/types.js';
import type { TacticsScript, UnitType, WeaponType } from '../tactics/types.js';
import { resolveTalentEffects } from '../talents/resolve.js';
import type { Id } from '../types.js';
import { resolveHeroStatSheet } from './resolve.js';
import type { ClassDef, Hero } from './types.js';

// §15 (decisões em aberto) — "alcance de assistência: começar em 2 tiles para melee e
// duelRange para ranged". O "2" é o ponto de partida explícito dado pela própria seção
// de decisões abertas da spec (não um número de balanceamento por peça de equipamento
// como duelRange — a alavanca de ajuste citada ali é o custo em PP, não este valor).
export const MELEE_ASSIST_RANGE = 2;

export interface HeroCombatProfile {
  readonly stats: StatSheet;
  readonly unitType: UnitType;
  readonly weaponType: WeaponType;
  readonly duelRange: number;
  readonly assistRange: number;
  readonly moveType: MoveType;
  readonly moveRange: number;
  // AP/PP com que o herói ENTRA na batalha (classDef.basePools + bônus de talento, §8.2
  // maxAp/maxPp) — não é um teto reforçado em runtime, o motor nunca clampa `rest`
  // (battle/commands.ts soma sem cap); só o valor inicial de BattleUnit.ap/pp.
  readonly startingAp: number;
  readonly startingPp: number;
  readonly tacticsScript: TacticsScript;
  readonly reactionScript: readonly ReactionLine[];
  readonly knownSkills: Readonly<Record<Id, SkillDef>>;
}

export interface ResolveHeroCombatProfileInput {
  readonly hero: Hero;
  readonly classDef: ClassDef;
  readonly equippedItems: readonly ItemInstance[];
  readonly itemSets: Readonly<Record<Id, ItemSet>>;
  // Catálogo de skills (conteúdo, packages/data) — quem chama resolve os ids referenciados
  // por Hero/talentos; ids ausentes do catálogo são ignorados silenciosamente (mesmo
  // precedente de resolveTalentEffects com nós de talento desconhecidos).
  readonly skillsCatalog: Readonly<Record<Id, SkillDef>>;
  // §6.1 — "cada arma tem duelRange"; número de balanceamento (packages/data), nunca
  // hardcoded aqui — decisão registrada em DECISIONS.md (M7, sub-sessão 4).
  readonly weaponDuelRanges: Readonly<Record<WeaponType, number>>;
  // Reações universais (Contra-atacar/Defender, §6.4) não são um campo de Hero — decisão
  // registrada em DECISIONS.md: sintetizadas aqui a partir dos ids canônicos que o
  // chamador (servidor) resolve do seu próprio catálogo de skills.
  readonly baselineReactionSkillIds: readonly Id[];
}

function isMeleeWeapon(weaponType: WeaponType): boolean {
  return PHYSICAL_CYCLE.includes(weaponType);
}

function toReactionLine(skillId: Id, skillsCatalog: Readonly<Record<Id, SkillDef>>): ReactionLine | undefined {
  if (!skillsCatalog[skillId]) return undefined;
  return { enabled: true, skillId, conditions: [] };
}

// §4.2/§6.1 — segunda etapa da cadeia Hero→Class→Item→Talento (a primeira,
// resolveHeroStatSheet, só monta o StatSheet — M7 sub-sessão 1). Esta função monta o
// resto do perfil de combate que faltava pra ir de Hero real a algo com o mesmo formato
// de BattleUnit (menos os campos de estado de batalha: unitId/side/pos/hp/ap/pp/etc.,
// que só existem quando o herói é de fato colocado num mapa).
export function resolveHeroCombatProfile(input: ResolveHeroCombatProfileInput): HeroCombatProfile {
  const { hero, classDef, equippedItems, itemSets, skillsCatalog, weaponDuelRanges, baselineReactionSkillIds } = input;

  const stats = resolveHeroStatSheet({ hero, classDef, equippedItems, itemSets });
  const resolvedTalents = resolveTalentEffects(classDef.talentTree, hero.talents);

  const duelRange = weaponDuelRanges[hero.weaponType];
  const assistRange = isMeleeWeapon(hero.weaponType) ? MELEE_ASSIST_RANGE : duelRange;

  const knownSkillIds = [
    ...hero.duelSkills,
    ...hero.mapSkills,
    ...resolvedTalents.grantedSkillIds,
    ...baselineReactionSkillIds,
    ...resolvedTalents.grantedReactionIds,
  ];

  const knownSkills: Record<Id, SkillDef> = {};
  for (const skillId of knownSkillIds) {
    const base = skillsCatalog[skillId];
    if (!base) continue;
    const patch = resolvedTalents.skillPatches[skillId];
    knownSkills[skillId] = patch ? { ...base, ...patch } : base;
  }

  const reactionScript: ReactionLine[] = [];
  for (const skillId of [...baselineReactionSkillIds, ...resolvedTalents.grantedReactionIds]) {
    const line = toReactionLine(skillId, skillsCatalog);
    if (line) reactionScript.push(line);
  }

  return {
    stats,
    unitType: classDef.unitType,
    weaponType: hero.weaponType,
    duelRange,
    assistRange,
    moveType: classDef.moveType,
    moveRange: classDef.moveRange,
    startingAp: classDef.basePools.ap + resolvedTalents.maxApBonus,
    startingPp: classDef.basePools.pp + resolvedTalents.maxPpBonus,
    tacticsScript: hero.tacticsScript,
    reactionScript,
    knownSkills,
  };
}
