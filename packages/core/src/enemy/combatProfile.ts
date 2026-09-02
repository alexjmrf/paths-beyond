import type { ReactionLine } from '../duel/types.js';
import { resolveWeaponRanges, toReactionLine, type HeroCombatProfile } from '../hero/combatProfile.js';
import type { SkillDef } from '../skills/types.js';
import type { Id } from '../types.js';
import type { ResolveEnemyCombatProfileInput } from './types.js';

// §8.1 (M17, sub-sessão 3/N) — o caminho do INIMIGO até a batalha.
//
// Devolve um `HeroCombatProfile`, o mesmo tipo que `resolveHeroCombatProfile` devolve, e
// isso é decisão de projeto e não conveniência: `buildBattleUnit` (e portanto o motor
// inteiro, do duelo à iniciativa) não fica sabendo que existem dois tipos de unidade. A
// diferença entre personagem e inimigo é de AUTORIA — de onde a força veio —, e ela
// termina exatamente aqui. Se ela vazasse para dentro de `BattleUnit`, cada regra do jogo
// passaria a poder perguntar "isto é um inimigo?", que é a porta pela qual entra a IA
// esperta que a regra 6 do projeto proíbe.
//
// Note o tamanho da função comparado a `resolveHeroCombatProfile`: não há curva a
// interpolar, multiplicador de despertar, flat de imprint, agregação de equipamento, bônus
// de set nem resolução de talento. É o ganho que D4 estava comprando.
export function resolveEnemyCombatProfile(input: ResolveEnemyCombatProfileInput): HeroCombatProfile {
  const { enemy, skillsCatalog, weaponDuelRanges, baselineReactionSkillIds } = input;

  const { duelRange, assistRange } = resolveWeaponRanges(enemy.weaponType, weaponDuelRanges);

  const knownSkills: Record<Id, SkillDef> = {};
  for (const skillId of [...enemy.duelSkills, ...enemy.mapSkills, ...baselineReactionSkillIds]) {
    const skill = skillsCatalog[skillId];
    // Id ausente do catálogo é ignorado em silêncio — mesmo precedente do herói. Quem
    // pega isso é a validação de conteúdo (`packages/data`), que enxerga o catálogo
    // inteiro; aqui só chega o que o chamador resolveu.
    if (skill) knownSkills[skillId] = skill;
  }

  const reactionScript: ReactionLine[] = [];
  for (const skillId of baselineReactionSkillIds) {
    const line = toReactionLine(skillId, skillsCatalog);
    if (line) reactionScript.push(line);
  }

  return {
    stats: enemy.stats,
    unitType: enemy.unitType,
    weaponType: enemy.weaponType,
    duelRange,
    assistRange,
    moveType: enemy.moveType,
    moveRange: enemy.moveRange,
    startingAp: enemy.pools.ap,
    startingPp: enemy.pools.pp,
    tacticsScript: enemy.tacticsScript,
    reactionScript,
    knownSkills,
    // Sem equipamento não há set, e portanto não há efeito `special` de set (§7.4). Lista
    // vazia e não campo ausente: o perfil é o mesmo tipo dos dois lados.
    setSpecialEffectIds: [],
  };
}
