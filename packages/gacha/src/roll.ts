import { nextUint32, rngFor } from '@paths-beyond/core';
import { advancePity, isPityArmed } from './pity.js';
import type { BannerEntry, SummonInput, SummonResult } from './types.js';

// Mesma mecânica de peso acumulado sobre um uint32 que `items/generate.ts` e
// `economy/drops.ts` usam no core. Repetida aqui, e não importada, porque lá ela é privada
// do módulo — e porque D15 quer este pacote autônomo em regra: o que ele toma emprestado
// do core é RNG e ponto fixo, não decisão.
function pickWeighted(entries: readonly BannerEntry[], rngValue: number): BannerEntry | undefined {
  const total = entries.reduce((sum, entry) => sum + entry.weight, 0);
  if (total <= 0) return undefined;

  const roll = rngValue % total;
  let cursor = 0;
  for (const entry of entries) {
    cursor += entry.weight;
    if (roll < cursor) return entry;
  }
  return entries[entries.length - 1];
}

export function rollSummon(input: SummonInput): SummonResult {
  const { banner, owned, pity, seed, rollId } = input;

  const ownedSet = new Set(owned);
  const unowned = banner.pool.filter((entry) => !ownedSet.has(entry.characterId));
  const poolExhausted = unowned.length === 0;

  // A garantia só vale se houver o que garantir. Com o pool inteiro possuído ela fica
  // armada e intocada (ver `advancePity`).
  const guaranteed = isPityArmed(pity, banner.pityThreshold) && !poolExhausted;
  const candidates = guaranteed ? unowned : banner.pool;

  // Stream próprio por banner, pela mesma regra que o core aplica a todo sorteio: nunca
  // reaproveitar stream entre sistemas. Acrescentar um banner não desloca as rolagens de
  // outro, nem o drop de masmorra da mesma conta.
  const rngValue = nextUint32(rngFor(seed, 0, rollId, `summon:${banner.id}`)).value;
  const entry = pickWeighted(candidates, rngValue);

  // Pool vazio é erro de quem autora, e `validateBanner` o pega antes de o banner existir.
  // Aqui ele não pode virar `undefined` silencioso: um summon cobrado que não devolve nada
  // é o pior desfecho possível.
  if (!entry) {
    throw new Error(`Banner '${banner.id}' não tem nenhuma entrada sorteável.`);
  }

  const grantedNew = !ownedSet.has(entry.characterId);
  const nextPity = advancePity(pity, { grantedNew, poolExhausted });

  if (grantedNew) {
    return {
      outcome: { kind: 'character', characterId: entry.characterId, guaranteed },
      pity: nextPity,
    };
  }

  return {
    outcome: {
      kind: 'duplicate',
      characterId: entry.characterId,
      fragmentMaterialId: entry.fragmentMaterialId,
    },
    pity: nextPity,
  };
}
