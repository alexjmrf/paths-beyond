import type { LethalUses, SkillDef } from '../skills/types.js';
import type { Id } from '../types.js';

// §6.4 (M10, sub-sessão 8/N) — `onLethal`. Das 5 variantes de `ReactionTrigger`, esta é a
// única que NÃO passa por `selectReaction`: uma reação é uma DECISÃO (script ordenado +
// conditions + custo de PP), e decidir reagir à própria morte implicaria prever a própria
// morte. Decisão de design do usuário (DECISIONS.md, M10 sub-sessões 5/N e 8/N): o gatilho
// de morte é uma CONSEQUÊNCIA automática de um evento — sem linha de script, sem conditions,
// sem PP. A skill só precisa estar entre as `knownSkills` da unidade.

// A tag discrimina as duas variantes. Convenção de dado, não campo novo em SkillDef —
// mesmo precedente de HEAL_TAG (sub-sessão 7/N) e de `combinedTypeDamageMultiplier`, que
// já interpretam `tags` dentro do motor.
export const LETHAL_SURVIVE_TAG = 'survive';

// Prevenir a morte trunca o golpe em vez de anulá-lo: a unidade fica viva pelo mínimo
// possível. Regra do motor (não há número de balanceamento a viver em packages/data).
export const LETHAL_SURVIVE_HP = 1;

export function isLethalTriggerSkill(skill: SkillDef): boolean {
  return skill.trigger === 'onLethal';
}

// Variante "prevenir a morte". Fora de um gatilho de morte a tag não significa nada.
export function isSurviveLethalSkill(skill: SkillDef): boolean {
  return isLethalTriggerSkill(skill) && skill.tags.includes(LETHAL_SURVIVE_TAG);
}

export function lethalUsesOf(skill: SkillDef): LethalUses {
  return skill.lethalUses ?? 'perDuel';
}

export interface FindLethalTriggerInput {
  readonly knownSkills: Readonly<Record<Id, SkillDef>>;
  // Gatilhos já disparados: `perBattle` já usados em duelos anteriores + o que já disparou
  // neste duelo. É o que implementa a frequência declarada em `lethalUses`.
  readonly usedSkillIds?: readonly Id[];
  readonly cooldowns?: Readonly<Record<Id, number>>;
  // Caminhos em que não existe matador identificável (dano de assistência, tick de DoT):
  // só a variante que previne a morte tem o que fazer.
  readonly requireSurvive?: boolean;
  // Fora do duelo (tick de round): `perDuel` não tem duelo a que se limitar.
  readonly requirePerBattle?: boolean;
}

// "No máximo uma passiva que ativa ao morrer": devolve UMA skill, a primeira em ordem
// lexicográfica de id. A ordenação é obrigatória — a ordem de iteração de um Record é a de
// inserção, que varia conforme quem montou as `knownSkills` (cliente, servidor, sim-cli), e
// os três precisam produzir bytes idênticos.
export function findLethalTriggerSkill(input: FindLethalTriggerInput): SkillDef | null {
  const { knownSkills, usedSkillIds = [], cooldowns = {}, requireSurvive, requirePerBattle } = input;

  for (const skillId of Object.keys(knownSkills).sort()) {
    const skill = knownSkills[skillId];
    if (!skill || !isLethalTriggerSkill(skill)) continue;
    if (usedSkillIds.includes(skillId)) continue;
    if ((cooldowns[skillId] ?? 0) > 0) continue;
    if (requireSurvive && !isSurviveLethalSkill(skill)) continue;
    if (requirePerBattle && lethalUsesOf(skill) !== 'perBattle') continue;
    return skill;
  }

  return null;
}

// Filtra o que sobrevive ao fim de um duelo: só `perBattle`. O que é `perDuel` recarrega no
// duelo seguinte, e um id sem skill conhecida é descartado em vez de virar estado sem dono.
export function persistentLethalTriggersUsed(
  usedSkillIds: readonly Id[],
  knownSkills: Readonly<Record<Id, SkillDef>>,
): readonly Id[] {
  const kept: Id[] = [];
  for (const skillId of usedSkillIds) {
    const skill = knownSkills[skillId];
    if (!skill || !isLethalTriggerSkill(skill)) continue;
    if (lethalUsesOf(skill) !== 'perBattle') continue;
    if (kept.includes(skillId)) continue;
    kept.push(skillId);
  }
  return kept;
}
