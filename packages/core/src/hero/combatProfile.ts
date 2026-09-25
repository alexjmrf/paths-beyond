import { PHYSICAL_CYCLE } from '../duel/triangle.js';
import type { ReactionLine } from '../duel/types.js';
import type { MoveType } from '../grid/types.js';
import { SET_SPECIAL_RESERVA, resolveSetSpecialEffects } from '../items/sets.js';
import type { ItemInstance, ItemSet } from '../items/types.js';
import type { SkillDef } from '../skills/types.js';
import type { StatSheet } from '../stats/types.js';
import type { TacticsScript, UnitType, WeaponType } from '../tactics/types.js';
import type { ColumnTalentNode } from '../talents/columnTree.js';
import { resolveTalentEffects } from '../talents/resolve.js';
import type { Id } from '../types.js';
import { resolveHeroStatSheet } from './resolve.js';
import { resolveArtifact } from '../artifacts/index.js';
import type { EquippedArtifact } from '../artifacts/types.js';
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
  // §7.4 (M10 sub-sessão 6/N) — efeitos `special` de set já resolvidos a partir do
  // equipamento (ids canônicos de items/sets.ts). Descem daqui até BattleUnit e
  // DuelParticipant; quem os interpreta é a camada que cada um afeta.
  readonly setSpecialEffectIds: readonly Id[];
}

export interface ResolveHeroCombatProfileInput {
  readonly hero: Hero;
  readonly classDef: ClassDef;
  readonly equippedItems: readonly ItemInstance[];
  readonly itemSets: Readonly<Record<Id, ItemSet>>;
  // §8.1/§8.2 (M17) — a árvore do PERSONAGEM, resolvida por quem chama a partir de
  // `hero.characterId`. Ver o comentário em `resolveHeroStatSheet`.
  readonly talentTree: readonly ColumnTalentNode[];
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
  // M38 (D53) — o artefato equipado. Ausente = slot vazio. Ver `resolveHeroStatSheet`.
  readonly artifact?: EquippedArtifact;
}

function isMeleeWeapon(weaponType: WeaponType): boolean {
  return PHYSICAL_CYCLE.includes(weaponType);
}

// EXPORTADOS a partir do M17 3/N, e a razão é a mesma que põe `buildBattleSetupFromHeroes`
// no core em vez de em cada consumidor: o inimigo autorado (§8.1) resolve o perfil dele por
// outro caminho, mas as duas regras abaixo NÃO são dele nem do herói — são do jogo. Alcance
// de duelo sai da arma (§6.1) e as reações universais são universais (§6.4). Duas cópias
// dessas três linhas seriam duas chances de um inimigo passar a furar a assimetria de
// alcance sem ninguém notar.
export function resolveWeaponRanges(
  weaponType: WeaponType,
  weaponDuelRanges: Readonly<Record<WeaponType, number>>,
): { readonly duelRange: number; readonly assistRange: number } {
  const duelRange = weaponDuelRanges[weaponType];
  return { duelRange, assistRange: isMeleeWeapon(weaponType) ? MELEE_ASSIST_RANGE : duelRange };
}

export function toReactionLine(skillId: Id, skillsCatalog: Readonly<Record<Id, SkillDef>>): ReactionLine | undefined {
  if (!skillsCatalog[skillId]) return undefined;
  return { enabled: true, skillId, conditions: [] };
}

// §4.2/§6.1 — segunda etapa da cadeia Hero→Class→Item→Talento (a primeira,
// resolveHeroStatSheet, só monta o StatSheet — M7 sub-sessão 1). Esta função monta o
// resto do perfil de combate que faltava pra ir de Hero real a algo com o mesmo formato
// de BattleUnit (menos os campos de estado de batalha: unitId/side/pos/hp/ap/pp/etc.,
// que só existem quando o herói é de fato colocado num mapa).
export function resolveHeroCombatProfile(input: ResolveHeroCombatProfileInput): HeroCombatProfile {
  const { hero, classDef, equippedItems, itemSets, skillsCatalog, weaponDuelRanges, baselineReactionSkillIds, talentTree } = input;

  const artifactInput = input.artifact ? { artifact: input.artifact } : {};
  const stats = resolveHeroStatSheet({ hero, classDef, equippedItems, itemSets, talentTree, ...artifactInput });
  const resolvedTalents = resolveTalentEffects(talentTree, hero.talents);
  // A trava de classe já foi conferida por `resolveHeroStatSheet` logo acima.
  const artifact = input.artifact ? resolveArtifact(input.artifact) : undefined;
  const artifactReactionIds = artifact?.grantedReactionIds ?? [];
  const setSpecialEffectIds = resolveSetSpecialEffects(equippedItems, itemSets);
  // §7.4 Reserva — "+1 AP máximo". Este motor não tem teto de AP em runtime (`rest`/`wait`
  // somam sem clamp), então "máximo" é o pool com que a unidade entra na batalha: mesma
  // semântica do bônus de talento `maxAp` (§8.2), e cumulativo com ele. Decisão do
  // usuário, registrada em DECISIONS.md.
  const reservaApBonus = setSpecialEffectIds.includes(SET_SPECIAL_RESERVA) ? 1 : 0;

  const { duelRange, assistRange } = resolveWeaponRanges(hero.weaponType, weaponDuelRanges);

  const knownSkillIds = [
    ...hero.duelSkills,
    ...hero.mapSkills,
    ...resolvedTalents.grantedSkillIds,
    ...baselineReactionSkillIds,
    ...resolvedTalents.grantedReactionIds,
    ...artifactReactionIds,
  ];

  const knownSkills: Record<Id, SkillDef> = {};
  for (const skillId of knownSkillIds) {
    const base = skillsCatalog[skillId];
    if (!base) continue;
    const patch = { ...resolvedTalents.skillPatches[skillId], ...artifact?.skillPatches[skillId] };
    knownSkills[skillId] = Object.keys(patch).length > 0 ? { ...base, ...patch } : base;
  }

  const reactionScript: ReactionLine[] = [];
  // M38 5/N (D57) — as reações CONCEDIDAS (artefato, depois talento) vêm ANTES da baseline. O
  // duelo escolhe a primeira linha que bate (§6.3 literal): com a baseline na frente, uma
  // reação concedida de mesmo gatilho que `contra-atacar` (sem condição) nunca disparava, e a
  // passiva do artefato medida no torneio não mudava resultado nenhum. A baseline vira o que
  // sobra quando a concedida não serve (gatilho diferente, PP insuficiente).
  // Entre as concedidas, o ARTEFATO vem antes do talento: é o equipamento específico, e com o
  // talento na frente uma reação de mesmo gatilho concedida por talento (a `assistir` da Sylla)
  // tomava sempre o lugar da do artefato. Uma reação repetida (baseline que um talento também
  // concede) fica só na primeira posição.
  const concedidas = new Set([...artifactReactionIds, ...resolvedTalents.grantedReactionIds]);
  const ordem = [...new Set([...artifactReactionIds, ...resolvedTalents.grantedReactionIds, ...baselineReactionSkillIds])];
  for (const skillId of ordem) {
    const line = toReactionLine(skillId, skillsCatalog);
    if (line) reactionScript.push(concedidas.has(skillId) ? { ...line, granted: true } : line);
  }

  return {
    stats,
    unitType: classDef.unitType,
    weaponType: hero.weaponType,
    duelRange,
    assistRange,
    moveType: classDef.moveType,
    moveRange: classDef.moveRange,
    startingAp: classDef.basePools.ap + resolvedTalents.maxApBonus + reservaApBonus + (artifact?.startingApBonus ?? 0),
    startingPp: classDef.basePools.pp + resolvedTalents.maxPpBonus + (artifact?.startingPpBonus ?? 0),
    tacticsScript: hero.tacticsScript,
    reactionScript,
    knownSkills,
    setSpecialEffectIds,
  };
}
