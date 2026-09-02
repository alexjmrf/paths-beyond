import type { Hero } from '../hero/types.js';
import type { Id } from '../types.js';
import type { ImprintResult, ImprintStep, MaterialBag, MaterialDef } from './types.js';

// §10 — "Imprint: duplicatas viram bônus permanente de stat."
//
// A "duplicata" virou um **fragmento do personagem** (decisão do usuário, M14 1/N;
// corrigida de instância para personagem em M18): é um consumível que dropa na masmorra de
// Chefe e, desde a aquisição de M18, sai de uma invocação que repete alguém que o jogador
// já possui.
//
// O teto 5 não é escolha: `ClassDef.imprintFlat` tem 6 entradas (imprint 0..5) desde M1, e
// `Hero.imprint` é a união literal `0|1|2|3|4|5`. Subir além disso não teria bônus algum
// para ler.

export const MAX_IMPRINT = 5;

export interface ApplyImprintInput {
  readonly hero: Hero;
  readonly materials: MaterialBag;
  // A definição do fragmento, não só o id: é ela que diz de QUEM ele é. Sem isso, o
  // fragmento de um personagem viraria imprint de outro, e o motor não teria como notar.
  readonly fragment: MaterialDef;
  readonly steps: readonly ImprintStep[]; // índice 0 = passo 0→1
}

export function applyImprint(input: ApplyImprintInput): ImprintResult {
  const { fragment, hero } = input;

  if (fragment.kind !== 'heroFragment') {
    return { ok: false, reason: `${fragment.id} não é fragmento de herói (kind: ${fragment.kind})` };
  }
  // M18 — a comparação é contra o PERSONAGEM. Um herói sem `characterId` (inimigo de fase,
  // vaga de masmorra, herói de fixture antigo) não tem imprint a receber, e recusar alto
  // aqui é o que impede o modo de falha anterior: comparar com `hero.id` fazia esses casos
  // simplesmente nunca casarem, sem dizer por quê.
  if (hero.characterId === undefined) {
    return { ok: false, reason: `${hero.id} não é personagem: não declara characterId e não tem imprint a receber` };
  }
  if (fragment.forCharacterId !== hero.characterId) {
    return {
      ok: false,
      reason: `${fragment.id} pertence a ${fragment.forCharacterId ?? 'ninguém'}, não a ${hero.characterId}`,
    };
  }

  const current = hero.imprint;
  if (current >= MAX_IMPRINT) {
    return { ok: false, reason: `imprint já está no teto de ${MAX_IMPRINT}` };
  }

  const step = input.steps[current];
  if (!step) {
    return { ok: false, reason: `tabela de imprint não define o passo ${current}→${current + 1}` };
  }

  const owned = input.materials[fragment.id] ?? 0;
  if (owned < step.fragments) {
    return { ok: false, reason: `fragmentos insuficientes: ${owned} de ${step.fragments}` };
  }

  const materials: Record<Id, number> = { ...input.materials };
  materials[fragment.id] = owned - step.fragments;

  return {
    ok: true,
    hero: { ...hero, imprint: (current + 1) as Hero['imprint'] },
    materials,
  };
}
