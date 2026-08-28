import { generateItem } from '../items/generate.js';
import type { ItemInstance, MainstatWeightEntry, SubstatWeightEntry, ValueRange } from '../items/types.js';
import { rngFor } from '../rng/rngFor.js';
import { nextUint32 } from '../rng/xoshiro128.js';
import type { Id } from '../types.js';
import type { DungeonDef, DungeonRunRewards, MaterialBag } from './types.js';

// §10 — "Masmorras de farm com foco definido: Equipamento (drop por set), Experiência,
// Ouro, Chefe (materiais de promoção)."
//
// A run é pura: (masmorra, seed, id da run) → recompensa. Nenhum número de drop mora aqui
// — quanto cai, de qual set e em que faixa é tudo `DungeonDef`, que é dado (regra 4). O
// que o motor decide é só a MECÂNICA: peso, faixa e streams de RNG isolados.
//
// Cada tipo de rolagem tem `purpose` próprio (regra do projeto: nunca reaproveitar stream
// entre sistemas). Assim, acrescentar material a uma masmorra não desloca o ouro dela nem
// os itens — e um replay de conta gravado antes continua batendo naquilo que não mudou.

export interface RollDungeonRunInput {
  readonly dungeon: DungeonDef;
  readonly seed: number;
  // Identifica ESTA entrada na masmorra. Duas runs da mesma masmorra com a mesma seed
  // precisam diferir, senão farmar seria repetir o mesmo drop para sempre.
  readonly runId: string;
  readonly substatWeights: readonly SubstatWeightEntry[];
  readonly mainstatWeights: readonly MainstatWeightEntry[];
}

function rollUint32(seed: number, runId: string, purpose: string): number {
  return nextUint32(rngFor(seed, 0, runId, purpose)).value;
}

// Mesma mecânica de `items/generate.ts` (peso acumulado sobre um uint32), repetida aqui
// porque lá é privado do módulo e exportá-lo acoplaria geração de item a tabela de drop.
function pickWeighted<T extends { readonly weight: number }>(entries: readonly T[], rngValue: number): T | undefined {
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

function rollInRange(rngValue: number, range: ValueRange | undefined): number {
  if (!range) return 0;
  const span = range.max - range.min + 1;
  return range.min + (rngValue % span);
}

export function rollDungeonRun(input: RollDungeonRunInput): DungeonRunRewards {
  const { dungeon, seed, runId } = input;

  const gold = rollInRange(rollUint32(seed, runId, 'dungeon:gold'), dungeon.gold);
  const exp = rollInRange(rollUint32(seed, runId, 'dungeon:exp'), dungeon.exp);
  const stones = rollInRange(rollUint32(seed, runId, 'dungeon:stones'), dungeon.stones);

  const items: ItemInstance[] = [];
  const gearDrops = dungeon.gearDrops ?? [];
  for (let i = 0; i < (dungeon.gearDropCount ?? 0); i++) {
    const entry = pickWeighted(gearDrops, rollUint32(seed, runId, `dungeon:gear:${i}`));
    if (!entry) break;
    items.push(
      generateItem({
        // Id determinístico e único dentro da run: é o que permite guardar o item no banco
        // sem inventar um id de fora e sem dois drops da mesma run colidirem.
        id: `${runId}:item:${i}`,
        setId: entry.setId,
        slot: entry.slot,
        rarity: entry.rarity,
        ilvl: entry.ilvl,
        // A seed do item deriva da rolagem desta posição de drop: sem isso os N itens de
        // uma run sairiam do mesmo stream e viriam idênticos entre si.
        seed: rollUint32(seed, runId, `dungeon:gear-seed:${i}`),
        substatWeights: input.substatWeights,
        mainstatWeights: input.mainstatWeights,
      }),
    );
  }

  const materials: Record<Id, number> = {};
  const materialDrops = dungeon.materialDrops ?? [];
  for (let i = 0; i < (dungeon.materialDropCount ?? 0); i++) {
    const entry = pickWeighted(materialDrops, rollUint32(seed, runId, `dungeon:material:${i}`));
    if (!entry) break;
    const amount = rollInRange(rollUint32(seed, runId, `dungeon:material-amount:${i}`), entry.amount);
    materials[entry.materialId] = (materials[entry.materialId] ?? 0) + amount;
  }

  return { gold, exp, stones, items, materials: materials as MaterialBag };
}
