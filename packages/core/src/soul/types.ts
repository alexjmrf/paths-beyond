import type { MaterialBag } from '../economy/types.js';
import type { ValueRange } from '../items/types.js';
import type { StatKey } from '../stats/types.js';
import type { Id } from '../types.js';

// M39 2/N — A SOUL, cópia própria do core (regra 1; o mirror em `packages/data` entra na 3/N).
//
// É o 8º slot (o 7º é o artefato, D53). Como o artefato, NÃO é `ItemInstance`: não tem set,
// enhance, reforge nem `slot` (decisão do usuário, 2026-09-26), então vive em `hero.soul` e
// `GEAR_SLOTS` continua com os 6 de item.
//
// **A trava é por PERSONAGEM, e o nome é `soulOf`** — de propósito diferente do `classId` (a
// trava do artefato) e do `signatureOf` (associação do artefato, não trava), para ninguém
// fundir as duas exclusividades depois (roadmap M39).
//
// **Catálogo × estado de conta:** `CharacterSoulDef` é o que a Soul daquele personagem PODE
// ser (as 2–3 opções de mainstat); `SoulInstance` é o que saiu no sorteio. A conta pode ter
// várias instâncias do mesmo personagem (decisão do usuário); o herói equipa uma.

/** Uma opção de mainstat da Soul de um personagem: o stat, o peso no sorteio e a faixa do valor. */
export interface SoulMainstatOption {
  readonly stat: StatKey;
  readonly weight: number;
  readonly valueRange: ValueRange;
}

/** A Soul de UM personagem no catálogo: as 2 a 3 opções de mainstat, ligadas ao kit dele. */
export interface CharacterSoulDef {
  readonly soulOf: Id;
  readonly mainstatOptions: readonly SoulMainstatOption[];
}

/** Peso e faixa de um substat na tabela PRÓPRIA da Soul (não a dos itens). */
export interface SoulSubstatEntry {
  readonly stat: StatKey;
  readonly weight: number;
  readonly valueRange: ValueRange;
}

export interface SoulCost {
  readonly gold: number;
  /** Material GENÉRICO: o mesmo serve a qualquer personagem, e a escolha é feita no craft. */
  readonly materials: MaterialBag;
}

/** As regras da Soul que são número — todas vêm de `packages/data`. */
export interface SoulRules {
  /** O nível a partir do qual o slot abre. Conteúdo, não constante (D58: 20). */
  readonly unlockLevel: number;
  readonly substats: readonly SoulSubstatEntry[];
  readonly craftCost: SoulCost;
  /** O recraft re-sorteia tudo; é o sumidouro repetível, com custo próprio. */
  readonly recraftCost: SoulCost;
}

export interface SoulInstance {
  readonly id: Id;
  readonly soulOf: Id;
  readonly mainstat: { readonly stat: StatKey; readonly value: number };
  /** Exatamente `SOUL_SUBSTAT_COUNT`, distintos, nenhum com o stat do mainstat. */
  readonly substats: readonly { readonly stat: StatKey; readonly value: number }[];
  /**
   * Quantas vezes esta instância foi sorteada (1 no craft, +1 a cada recraft). Entra no stream
   * do RNG: o recraft com a mesma seed não repete o sorteio anterior.
   */
  readonly crafts: number;
}
