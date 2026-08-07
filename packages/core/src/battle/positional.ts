import { manhattanDistance, type Coord } from '../grid/types.js';

// §5.5 — constantes fp-scale (1000 = 100%).
const FLANK_DAMAGE_BONUS = 100; // +10%
const SIEGE_EVASION_PENALTY = 150; // -15%
const HEIGHT_DAMAGE_PER_LEVEL = 50; // +5%
const HEIGHT_ACCURACY_PER_LEVEL = 100; // +10%
const AMBUSH_CRITICAL_DAMAGE_BONUS = 150; // +15%

export interface PositionalModifiersInput {
  readonly defenderPos: Coord;
  readonly attackerAllyPositions: readonly Coord[]; // aliados do atacante, exceto ele mesmo
  readonly attackerHeight: 0 | 1 | 2 | 3;
  readonly defenderHeight: 0 | 1 | 2 | 3;
  readonly defenderTerrainDefBonus: number; // fp-scale
  readonly defenderTerrainEvaBonus: number; // fp-scale
  readonly defenderPp: number;
}

export interface PositionalModifiers {
  readonly damageMultiplier: number; // fp-scale — vira DuelParticipant.positionalMultiplier (M2)
  readonly accuracyModifier: number; // fp-scale delta — soma a DuelEngagementContext (M2)
  readonly defenderEvasionModifier: number; // fp-scale delta — soma à evasão do defensor
  readonly criticalDamageBonus: number; // fp-scale delta — soma ao chd do atacante (emboscada)
  readonly ppLockedForTroca1: boolean; // flanco/cerco — defensor não gasta PP na troca 1
}

// `*` cru é proibido em battle/ fora dos helpers de math/fixed.ts (regra 2/CLAUDE.md);
// "N% por nível de diferença" é soma repetida, não multiplicação de dois fp-scale.
function repeatedSum(value: number, times: number): number {
  let total = 0;
  for (let i = 0; i < times; i++) total += value;
  return total;
}

function countAdjacentAllies(defenderPos: Coord, allyPositions: readonly Coord[]): number {
  return allyPositions.filter((pos) => manhattanDistance(pos, defenderPos) === 1).length;
}

// §5.5 — calculados no momento do `engage` e passados para o duelo como constantes.
export function computePositionalModifiers(input: PositionalModifiersInput): PositionalModifiers {
  const adjacentAllyCount = countAdjacentAllies(input.defenderPos, input.attackerAllyPositions);
  const isFlanco = adjacentAllyCount === 1;
  const isCerco = adjacentAllyCount >= 2;

  const heightAdvantage = input.attackerHeight > input.defenderHeight ? input.attackerHeight - input.defenderHeight : 0;

  let damageMultiplier = 1000;
  if (isFlanco || isCerco) damageMultiplier += FLANK_DAMAGE_BONUS; // cerco "é como flanco", não soma os dois
  damageMultiplier += repeatedSum(HEIGHT_DAMAGE_PER_LEVEL, heightAdvantage);
  damageMultiplier -= input.defenderTerrainDefBonus;

  const accuracyModifier = repeatedSum(HEIGHT_ACCURACY_PER_LEVEL, heightAdvantage);

  let defenderEvasionModifier = input.defenderTerrainEvaBonus;
  if (isCerco) defenderEvasionModifier -= SIEGE_EVASION_PENALTY;

  const criticalDamageBonus = input.defenderPp === 0 ? AMBUSH_CRITICAL_DAMAGE_BONUS : 0;

  return {
    damageMultiplier,
    accuracyModifier,
    defenderEvasionModifier,
    criticalDamageBonus,
    ppLockedForTroca1: isFlanco || isCerco,
  };
}
