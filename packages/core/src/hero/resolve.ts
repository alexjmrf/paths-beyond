import { aggregateStatSheet } from '../stats/aggregate.js';
import type { StatModifier, StatSheet } from '../stats/types.js';
import type { ItemInstance, ItemSet } from '../items/types.js';
import { resolveSetBonuses } from '../items/sets.js';
import type { ColumnTalentNode } from '../talents/columnTree.js';
import { resolveTalentEffects } from '../talents/resolve.js';
import type { Id } from '../types.js';
import type { ClassDef, Hero } from './types.js';

export interface ResolveHeroStatSheetInput {
  readonly hero: Hero;
  readonly classDef: ClassDef;
  // Itens já resolvidos (buscados por `hero.equipment` fora desta função) — mesmo padrão
  // de `resolveSetBonuses`, que também recebe a lista pronta, não os ids.
  readonly equippedItems: readonly ItemInstance[];
  readonly itemSets: Readonly<Record<Id, ItemSet>>;
  // §8.1/§8.2 (M17) — os nós da árvore DO PERSONAGEM. Antes vinham de `classDef.talentTree`;
  // agora quem resolve o herói busca a árvore de `hero.characterId` no catálogo e a passa
  // aqui. Vazio é legítimo e significa "sem árvore" (inimigo de fase, até a 3/N).
  readonly talentTree: readonly ColumnTalentNode[];
}

function itemStatMods(item: ItemInstance): readonly StatModifier[] {
  return [
    { stat: item.mainstat.stat, flat: item.mainstat.value },
    ...item.substats.map((s) => ({ stat: s.stat, flat: s.value })),
  ];
}

// §4.1/§4.2 — primeira vez no projeto que a cadeia Hero→Class→Item→Talento é montada de
// ponta a ponta (M2-M6 usaram dados self-contained, com stat sheet já resolvido — ver
// DECISIONS.md). Monta o `AggregateStatsInput` a partir de dados reais e delega toda a
// matemática pra `aggregateStatSheet` (M1), que não muda. `equipmentPct` é sempre []
// nesta milestone: `ItemInstance.mainstat/substats` só guardam um `value` flat (decisão
// desta sub-sessão, ver DECISIONS.md) — itens percentuais ficam pra um milestone futuro.
export function resolveHeroStatSheet(input: ResolveHeroStatSheetInput): StatSheet {
  const { hero, classDef, equippedItems, itemSets, talentTree } = input;

  const baseCurve = classDef.statCurve[hero.level - 1] ?? {};
  const awakeningMultiplier = classDef.awakeningMultipliers[hero.awakening] ?? 1000;
  const classAndImprintFlat: readonly StatModifier[] = [
    ...classDef.promotionFlat,
    ...(classDef.imprintFlat[hero.imprint] ?? []),
  ];

  const equipmentFlat = equippedItems.flatMap(itemStatMods);
  const equipmentPct: readonly StatModifier[] = [];

  const resolvedTalents = resolveTalentEffects(talentTree, hero.talents);

  const setBonus = resolveSetBonuses(equippedItems, itemSets);

  return aggregateStatSheet({
    baseCurve,
    awakeningMultiplier,
    classAndImprintFlat,
    equipmentFlat,
    equipmentPct,
    // addFlat/multiplyByPctSum cada um só olha o campo que lhe interessa (flat ou pct) em
    // cada modificador — passar o mesmo array pros dois parâmetros é seguro mesmo quando
    // um efeito de talento carrega flat E pct simultaneamente (§8.2, TalentEffect.stat).
    talentFlat: resolvedTalents.statMods,
    talentPct: resolvedTalents.statMods,
    setBonus,
  });
}
