import { computeReachableTiles, manhattanDistance, openGateCoords, type BattleState, type Coord } from '@paths-beyond/core';

// §11 — "Overlay de movimento e de ameaça". Ameaça = tiles que uma unidade inimiga viva
// consegue alcançar (moveRange) e, de lá, engajar (duelRange). Simplificação de M6: não
// considera ZoC/ocupação ao redor de OUTROS inimigos, só do próprio mapa — refinamento
// fica pra uma fatia futura de polish.
//
// M35 4/N (D44) — saiu de `MapCanvas.tsx` para cá, puro e sem Pixi, porque a PRÉVIA da missão
// passou a mostrar a mesma ameaça antes de entrar (§1.1 inteiro antes de escolher quem vai). É
// o mesmo cálculo nos dois lugares; a alternativa era copiá-lo. `computeReachableTiles` é do
// core (regra 3: o cliente não reimplementa alcance).
export function tilesAmeacados(battleState: BattleState): readonly Coord[] {
  const vistos = new Set<string>();
  const resultado: Coord[] = [];
  const enemies = battleState.units.filter((u) => u.side === 'enemy' && u.hp > 0);

  for (const enemy of enemies) {
    const allies = battleState.units.filter((u) => u.side === enemy.side && u.unitId !== enemy.unitId && u.hp > 0).map((u) => u.pos);
    const foes = battleState.units.filter((u) => u.side !== enemy.side && u.hp > 0).map((u) => u.pos);
    const reachable = computeReachableTiles(
      {
        map: battleState.map,
        moveType: enemy.moveType,
        occupiedByAlly: allies,
        occupiedByEnemy: foes,
        // §5.1 (M15) — sem isto a ameaça atravessaria muralha: o jogador se acharia em
        // perigo atrás de uma parede que o inimigo não pode cruzar.
        openGates: openGateCoords(battleState),
      },
      enemy.pos,
      enemy.moveRange,
    );
    const fromTiles = [enemy.pos, ...reachable.map((r) => r.coord)];
    for (const from of fromTiles) {
      for (let dx = -enemy.duelRange; dx <= enemy.duelRange; dx++) {
        for (let dy = -enemy.duelRange; dy <= enemy.duelRange; dy++) {
          const candidate = { x: from.x + dx, y: from.y + dy };
          if (manhattanDistance(from, candidate) > enemy.duelRange) continue;
          if (candidate.x < 0 || candidate.y < 0 || candidate.x >= battleState.map.width || candidate.y >= battleState.map.height) continue;
          const chave = `${candidate.x},${candidate.y}`;
          if (vistos.has(chave)) continue;
          vistos.add(chave);
          resultado.push(candidate);
        }
      }
    }
  }

  return resultado;
}
