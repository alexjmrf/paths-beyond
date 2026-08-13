import { manhattanDistance, type Coord } from '../grid/types.js';
import type { BattleState, BattleUnit } from './types.js';

// §5.4/§5.1 (M11, sub-sessão 2/N) — alvo em área de `mapSkill`. Distância é Manhattan por
// §5.1 ("Grid quadrado ortogonal [...] Distância = Manhattan"), não é decisão de design.

// Unidades VIVAS dentro do raio, na ordem FIXA de iniciativa da batalha (§5.3) — a mesma
// escolha de `buildAssistCandidates`: a ordem do array `state.units` é de montagem e não
// tem garantia nenhuma, e o resultado precisa ser idêntico no cliente, no servidor e no
// sim-cli.
export function unitsInArea(state: BattleState, center: Coord, radius: number): readonly BattleUnit[] {
  const inArea = state.units.filter((unit) => unit.hp > 0 && manhattanDistance(unit.pos, center) <= radius);
  const orderIndex = new Map(state.initiativeOrder.map((entry, index) => [entry.unitId, index]));
  return [...inArea].sort(
    (a, b) => (orderIndex.get(a.unitId) ?? Infinity) - (orderIndex.get(b.unitId) ?? Infinity),
  );
}
