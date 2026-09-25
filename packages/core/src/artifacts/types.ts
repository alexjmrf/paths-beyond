import type { BaseRank } from '../economy/rank.js';
import type { SkillDef } from '../skills/types.js';
import type { StatKey, StatModifier } from '../stats/types.js';
import type { Id } from '../types.js';

// M38 (D53) — O ARTEFATO, cópia própria do core (regra 1; mirror de
// packages/data/schemas/artifacts.schema.ts).
//
// É o 7º slot, SEPARADO da arma: o `weapon` continua decidindo alcance e `weaponType`
// (§6.1), e o artefato é o item de gacha — no molde do artefato do Epic Seven. Não é um
// `ItemInstance`: não tem set, enhance, substat rolado nem `slot`, e forçá-lo naquela forma
// daria a ele máquinas (reforge, enhance) que ele não tem.
//
// **Duas travas de exclusividade, e esta é a de CLASSE** (roadmap M38): qualquer personagem
// da classe declarada equipa. A trava por PERSONAGEM é a da Soul (M39), com outro nome no
// dado para ninguém fundir as duas.
//
// **Catálogo × estado de conta**, como no rank do personagem (M37): `ArtifactDef` é o que o
// artefato É (classe, rank de base, curvas, passiva); `ArtifactInstance` é o que aquela
// conta FEZ com ele (awakening, imprint). O rank corrente não é campo de nenhum dos dois —
// é `artifactRank(def, instance)`.

/**
 * A passiva exclusiva — vocabulário FECHADO que o core interpreta; os números são dado.
 *
 * Cada variante carrega a magnitude POR IMPRINT (6 entradas, imprint 0..5): o imprint mexe
 * no número da passiva e nunca troca o efeito (decisão do usuário — com PvP, duplicata é
 * status, não mecânica nova). A forma garante isso: não há onde declarar um efeito por
 * nível de imprint.
 *
 * - `stat`: % de um stat, no passo 4 de §4.1 (é % de equipamento).
 * - `startingPool`: AP ou PP com que a unidade ENTRA na batalha — mesma semântica do set
 *   Reserva e do talento `maxAp`. Não é regeneração (regra 7).
 * - `reaction`: concede uma skill de reação do catálogo; os gatilhos são os do duelo
 *   (§6.4: `onAttacked`, `onDamaged`, `onDebuffed` — `onLethal` não é reação, é gatilho de
 *   morte de uma skill `kind: 'duel'`, e não entra por aqui; D54). O imprint, se declarado,
 *   só ajusta o multiplicador dela.
 */
export type ArtifactPassive =
  | { readonly t: 'stat'; readonly stat: StatKey; readonly pctByImprint: readonly number[] }
  | { readonly t: 'startingPool'; readonly pool: 'ap' | 'pp'; readonly amountByImprint: readonly number[] }
  | { readonly t: 'reaction'; readonly skillId: Id; readonly multiplierByImprint?: readonly number[] };

export interface ArtifactDef {
  readonly id: Id;
  /** De quem o artefato é assinatura. Associação, não trava — a trava é `classId`. */
  readonly signatureOf: Id;
  readonly name: string;
  readonly classId: Id;
  readonly rank: BaseRank;
  /** O stat FIXO de todo artefato (decisão do usuário): `atk`, por awakening 0..6. */
  readonly atkByAwakening: readonly number[];
  /** O stat que diferencia um artefato do outro, por awakening 0..6. Nunca `atk`. */
  readonly variableStat: { readonly stat: StatKey; readonly byAwakening: readonly number[] };
  /** Bônus de imprint, cumulativo total naquele nível (0..5) — mesma forma de `ClassDef.imprintFlat`. */
  readonly imprintFlat: readonly (readonly StatModifier[])[];
  readonly passive: ArtifactPassive;
}

export interface ArtifactInstance {
  readonly id: Id;
  readonly artifactId: Id;
  readonly awakening: 0 | 1 | 2 | 3 | 4 | 5 | 6;
  readonly imprint: 0 | 1 | 2 | 3 | 4 | 5;
}

/** O artefato que um herói leva para a batalha: a definição e a instância, já buscadas por quem chama. */
export interface EquippedArtifact {
  readonly def: ArtifactDef;
  readonly instance: ArtifactInstance;
}

/** O que o artefato soma ao herói, já resolvido para os pontos da cadeia que o consomem. */
export interface ResolvedArtifact {
  readonly equipmentFlat: readonly StatModifier[]; // §4.1 passo 3
  readonly equipmentPct: readonly StatModifier[]; // §4.1 passo 4
  readonly startingApBonus: number;
  readonly startingPpBonus: number;
  readonly grantedReactionIds: readonly Id[];
  readonly skillPatches: Readonly<Record<Id, Partial<SkillDef>>>;
}
