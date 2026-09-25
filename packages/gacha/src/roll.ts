import { nextUint32, rngFor, type BaseRank, type Id } from '@paths-beyond/core';
import { advancePity, isPityArmed, ranksSemEntrada } from './pity.js';
import { softRate } from './softPity.js';
import type { BannerDef, BannerEntry, SummonInput, SummonOutcome, SummonResult } from './types.js';

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

/**
 * O que uma entrada entrega a quem tem `owned`/`ownedArtifacts`: o prêmio, ou a duplicata que
 * paga o fragmento declarado. Compartilhado com o token e com a escolha do genérico, que
 * entregam pelas mesmas regras sem passar pelo sorteio.
 */
export function outcomeFor(entry: BannerEntry, owned: readonly Id[], ownedArtifacts: readonly Id[]): SummonOutcome {
  if (entry.artifactId !== undefined) {
    return ownedArtifacts.includes(entry.artifactId)
      ? { kind: 'artifactDuplicate', artifactId: entry.artifactId, rank: entry.rank, fragmentMaterialId: entry.fragmentMaterialId }
      : { kind: 'artifact', artifactId: entry.artifactId, rank: entry.rank };
  }
  return owned.includes(entry.characterId)
    ? { kind: 'duplicate', characterId: entry.characterId, rank: entry.rank, fragmentMaterialId: entry.fragmentMaterialId }
    : { kind: 'character', characterId: entry.characterId, rank: entry.rank };
}

function doRank(banner: BannerDef, rank: BaseRank): readonly BannerEntry[] {
  return banner.pool.filter((entry) => entry.rank === rank);
}

export function rollSummon(input: SummonInput): SummonResult {
  const { banner, owned, ownedArtifacts, pity, seed, rollId } = input;

  const heroes = doRank(banner, 'hero');
  const adventurers = doRank(banner, 'adventurer');

  // D54 — QUAL RANK sai é decidido pela curva de soft pity, num stream próprio. Rank que o
  // pool não oferece nunca é escolhido: garantir o que o pool não pode pagar deixaria a
  // rolagem sem entrada sorteável (o congelamento do M18, que `advancePity` aplica).
  const numero = pity.hero + 1;
  const tetoDuro = heroes.length > 0 && isPityArmed(pity, banner.pityThresholds, 'hero');
  const taxa = heroes.length === 0 ? 0 : softRate(banner.softPity, banner.pityThresholds.hero, numero);
  const sorteioDeRank = nextUint32(rngFor(seed, 0, rollId, `summon-rank:${banner.id}`)).value % 1000;
  const saiHero = heroes.length > 0 && (adventurers.length === 0 || tetoDuro || sorteioDeRank < taxa);

  // O `Hero` tem precedência sobre o andar de `Adventurer` (D50c): se a rampa ou o teto
  // tirou o `Hero`, o andar de baixo fica armado e dispara na seguinte, sem nada se perder.
  const candidatos = saiHero ? heroes : adventurers;
  let guaranteed: BaseRank | null = null;
  if (saiHero && tetoDuro) guaranteed = 'hero';
  else if (!saiHero && isPityArmed(pity, banner.pityThresholds, 'adventurer')) guaranteed = 'adventurer';

  // Stream próprio por banner para QUEM sai dentro do rank. Acrescentar um banner não
  // desloca as rolagens de outro, nem o drop de masmorra da mesma conta.
  const rngValue = nextUint32(rngFor(seed, 0, rollId, `summon:${banner.id}`)).value;
  const entry = pickWeighted(candidatos, rngValue);

  // Pool vazio é erro de quem autora, e `validateBanner` o pega antes de o banner existir.
  // Aqui ele não pode virar `undefined` silencioso: um summon cobrado que não devolve nada
  // é o pior desfecho possível.
  if (!entry) {
    throw new Error(`Banner '${banner.id}' não tem nenhuma entrada sorteável.`);
  }

  return {
    outcome: outcomeFor(entry, owned, ownedArtifacts),
    guaranteed,
    pity: advancePity(pity, { grantedRank: entry.rank, ranksSemEntrada: ranksSemEntrada(banner) }),
  };
}
