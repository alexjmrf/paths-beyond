import { rankCorrente, type CharacterRank } from '../economy/rank.js';
import type { AwakeningStep, ImprintStep, MaterialBag, MaterialDef, Wallet } from '../economy/types.js';
import type { Hero } from '../hero/types.js';
import type { SkillDef } from '../skills/types.js';
import type { StatModifier } from '../stats/types.js';
import type { Id } from '../types.js';
import type { ArtifactDef, ArtifactInstance, EquippedArtifact, ResolvedArtifact } from './types.js';

export type { ArtifactDef, ArtifactInstance, ArtifactPassive, EquippedArtifact, ResolvedArtifact } from './types.js';

// M38 1/N (D53) — as regras do artefato. Ver `types.ts` para o que ele é.

/** O awakening próprio do artefato tem a mesma faixa do personagem (0–6), e o topo é `Legend`. */
export const MAX_ARTIFACT_AWAKENING = 6;
export const MAX_ARTIFACT_IMPRINT = 5;

/**
 * O rank corrente do artefato. É a MESMA regra do personagem (`rankCorrente`, M37): o
 * artefato `adventurer` vira `hero` na metade da curva própria e os dois viram `legend` no
 * topo. Uma regra só, porque dois limiares diferentes para a mesma palavra seriam dois ranks
 * com o mesmo nome.
 */
export function artifactRank(def: ArtifactDef, instance: ArtifactInstance): CharacterRank {
  return rankCorrente(def.rank, instance.awakening);
}

function pick(values: readonly number[] | undefined, index: number): number {
  return values?.[index] ?? 0;
}

export function resolveArtifact(artifact: EquippedArtifact): ResolvedArtifact {
  const { def, instance } = artifact;
  const equipmentFlat: StatModifier[] = [
    { stat: 'atk', flat: pick(def.atkByAwakening, instance.awakening) },
    { stat: def.variableStat.stat, flat: pick(def.variableStat.byAwakening, instance.awakening) },
    ...(def.imprintFlat[instance.imprint] ?? []),
  ];

  const passive = def.passive;
  const equipmentPct: StatModifier[] = [];
  let startingApBonus = 0;
  let startingPpBonus = 0;
  const grantedReactionIds: Id[] = [];
  const skillPatches: Record<Id, Partial<SkillDef>> = {};

  switch (passive.t) {
    case 'stat':
      equipmentPct.push({ stat: passive.stat, pct: pick(passive.pctByImprint, instance.imprint) });
      break;
    case 'startingPool': {
      const amount = pick(passive.amountByImprint, instance.imprint);
      if (passive.pool === 'ap') startingApBonus = amount;
      else startingPpBonus = amount;
      break;
    }
    case 'reaction':
      grantedReactionIds.push(passive.skillId);
      if (passive.multiplierByImprint) {
        skillPatches[passive.skillId] = { multiplier: pick(passive.multiplierByImprint, instance.imprint) };
      }
      break;
  }

  return { equipmentFlat, equipmentPct, startingApBonus, startingPpBonus, grantedReactionIds, skillPatches };
}

/**
 * A trava por classe na hora de RESOLVER. Chegar aqui com artefato de outra classe é estado
 * que `equipArtifact` nunca produz — então é dado corrompido ou montagem errada, e somar em
 * silêncio daria a um personagem o artefato que o jogo proíbe.
 */
export function assertArtifactFitsClass(artifact: EquippedArtifact, classId: Id): void {
  if (artifact.def.classId !== classId) {
    throw new Error(`artefato ${artifact.def.id} é da classe ${artifact.def.classId}, não de ${classId}`);
  }
  if (artifact.instance.artifactId !== artifact.def.id) {
    throw new Error(`instância ${artifact.instance.id} é de ${artifact.instance.artifactId}, não de ${artifact.def.id}`);
  }
}

export type EquipArtifactResult = { readonly ok: true; readonly hero: Hero } | { readonly ok: false; readonly reason: string };

export function equipArtifact(input: { readonly hero: Hero; readonly artifact: EquippedArtifact }): EquipArtifactResult {
  const { hero, artifact } = input;
  if (artifact.def.classId !== hero.classId) {
    return { ok: false, reason: `${artifact.def.id} só equipa a classe ${artifact.def.classId}, e ${hero.id} é ${hero.classId}` };
  }
  if (artifact.instance.artifactId !== artifact.def.id) {
    return { ok: false, reason: `instância ${artifact.instance.id} não é de ${artifact.def.id}` };
  }
  return { ok: true, hero: { ...hero, artifact: artifact.instance.id } };
}

export type ArtifactAwakenResult =
  | { readonly ok: true; readonly instance: ArtifactInstance; readonly wallet: Wallet; readonly materials: MaterialBag }
  | { readonly ok: false; readonly reason: string };

export interface AwakenArtifactInput {
  readonly instance: ArtifactInstance;
  readonly wallet: Wallet;
  readonly materials: MaterialBag;
  readonly steps: readonly AwakeningStep[]; // índice 0 = passo 0→1
}

// Mesma forma de `awaken` (M14): custos são dado, um passo por degrau; falta de tabela falha alto.
export function awakenArtifact(input: AwakenArtifactInput): ArtifactAwakenResult {
  const current = input.instance.awakening;
  if (current >= MAX_ARTIFACT_AWAKENING) {
    return { ok: false, reason: `awakening do artefato já está no teto de ${MAX_ARTIFACT_AWAKENING}` };
  }
  const step = input.steps[current];
  if (!step) return { ok: false, reason: `tabela de awakening de artefato não define o passo ${current}→${current + 1}` };
  if (input.wallet.gold < step.gold) {
    return { ok: false, reason: `ouro insuficiente: ${input.wallet.gold} de ${step.gold}` };
  }
  for (const [materialId, needed] of Object.entries(step.materials)) {
    const owned = input.materials[materialId] ?? 0;
    if (owned < needed) return { ok: false, reason: `material insuficiente: ${materialId} (${owned} de ${needed})` };
  }

  const materials: Record<Id, number> = { ...input.materials };
  for (const [materialId, needed] of Object.entries(step.materials)) {
    materials[materialId] = (materials[materialId] ?? 0) - needed;
  }
  return {
    ok: true,
    instance: { ...input.instance, awakening: (current + 1) as ArtifactInstance['awakening'] },
    wallet: { ...input.wallet, gold: input.wallet.gold - step.gold },
    materials,
  };
}

export type ArtifactImprintResult =
  | { readonly ok: true; readonly instance: ArtifactInstance; readonly materials: MaterialBag }
  | { readonly ok: false; readonly reason: string };

export interface ApplyArtifactImprintInput {
  readonly instance: ArtifactInstance;
  readonly materials: MaterialBag;
  readonly fragment: MaterialDef;
  readonly steps: readonly ImprintStep[]; // índice 0 = passo 0→1
}

// A duplicata de artefato vira fragmento DAQUELE artefato — como a do personagem vira
// fragmento do personagem (M18). O `kind` separa os dois: fragmento de personagem não vira
// imprint de artefato, nem o contrário.
export function applyArtifactImprint(input: ApplyArtifactImprintInput): ArtifactImprintResult {
  const { fragment, instance } = input;
  if (fragment.kind !== 'artifactFragment') {
    return { ok: false, reason: `${fragment.id} não é fragmento de artefato (kind: ${fragment.kind})` };
  }
  if (fragment.forArtifactId !== instance.artifactId) {
    return { ok: false, reason: `${fragment.id} pertence a ${fragment.forArtifactId ?? 'ninguém'}, não a ${instance.artifactId}` };
  }
  const current = instance.imprint;
  if (current >= MAX_ARTIFACT_IMPRINT) return { ok: false, reason: `imprint do artefato já está no teto de ${MAX_ARTIFACT_IMPRINT}` };
  const step = input.steps[current];
  if (!step) return { ok: false, reason: `tabela de imprint de artefato não define o passo ${current}→${current + 1}` };
  const owned = input.materials[fragment.id] ?? 0;
  if (owned < step.fragments) return { ok: false, reason: `fragmentos insuficientes: ${owned} de ${step.fragments}` };

  return {
    ok: true,
    instance: { ...instance, imprint: (current + 1) as ArtifactInstance['imprint'] },
    materials: { ...input.materials, [fragment.id]: owned - step.fragments },
  };
}
