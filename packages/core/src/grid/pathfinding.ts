import {
  coordKey,
  coordsEqual,
  isInBounds,
  manhattanDistance,
  orthogonalNeighbors,
  tileAt,
  type Coord,
  type GridMap,
  type MoveType,
} from './types.js';

export interface PathfindingContext {
  readonly map: GridMap;
  readonly moveType: MoveType;
  readonly occupiedByAlly: readonly Coord[];
  readonly occupiedByEnemy: readonly Coord[];
}

export interface ReachableTile {
  readonly coord: Coord;
  readonly cost: number;
  // Caminho completo do `start` (inclusive) até `coord` (inclusive) — o comando `move`
  // exige o caminho inteiro, não só o destino (M6: cliente monta o comando a partir daqui).
  readonly path: readonly Coord[];
}

export interface PathValidationResult {
  readonly valid: boolean;
  readonly cost: number;
  readonly reason?: string;
}

function terrainMoveCost(map: GridMap, coord: Coord, moveType: MoveType): number | 'impassable' | undefined {
  const tile = tileAt(map, coord);
  if (!tile) return undefined;
  const terrain = map.terrains[tile.terrain];
  if (!terrain) return undefined;
  return terrain.moveCost[moveType];
}

function isOccupied(coord: Coord, occupants: readonly Coord[]): boolean {
  return occupants.some((occupant) => coordsEqual(occupant, coord));
}

// §5.2 — Zone of Control: tiles ortogonalmente adjacentes a inimigo encerram o movimento.
function isZoc(map: GridMap, coord: Coord, enemies: readonly Coord[]): boolean {
  if (!map.zocEnabled) return false;
  return orthogonalNeighbors(coord).some((neighbor) => isOccupied(neighbor, enemies));
}

// §5.2 — Dijkstra limitado por moveRange. Tiles com inimigo são intransponíveis; tiles
// com aliado são atravessáveis mas não aparecem no resultado final (não dá pra parar
// neles). ZoC impede expandir a partir de um tile adjacente a inimigo (exceto o início).
export function computeReachableTiles(ctx: PathfindingContext, start: Coord, moveRange: number): readonly ReachableTile[] {
  const dist = new Map<string, number>();
  const predecessor = new Map<string, Coord>();
  const visited = new Set<string>();
  dist.set(coordKey(start), 0);

  const frontier: Coord[] = [start];

  while (frontier.length > 0) {
    let bestIndex = 0;
    let bestCost = dist.get(coordKey(frontier[0] as Coord)) ?? Infinity;
    for (let i = 1; i < frontier.length; i++) {
      const cost = dist.get(coordKey(frontier[i] as Coord)) ?? Infinity;
      if (cost < bestCost) {
        bestCost = cost;
        bestIndex = i;
      }
    }
    const current = frontier.splice(bestIndex, 1)[0] as Coord;
    const key = coordKey(current);
    if (visited.has(key)) continue;
    visited.add(key);
    const currentCost = dist.get(key) ?? Infinity;

    const isStart = coordsEqual(current, start);
    if (!isStart && isZoc(ctx.map, current, ctx.occupiedByEnemy)) continue;

    for (const neighbor of orthogonalNeighbors(current)) {
      if (!isInBounds(ctx.map, neighbor)) continue;
      if (isOccupied(neighbor, ctx.occupiedByEnemy)) continue;

      const moveCost = terrainMoveCost(ctx.map, neighbor, ctx.moveType);
      if (moveCost === undefined || moveCost === 'impassable') continue;

      const newCost = currentCost + moveCost;
      if (newCost > moveRange) continue;

      const neighborKey = coordKey(neighbor);
      const existing = dist.get(neighborKey);
      if (existing === undefined || newCost < existing) {
        dist.set(neighborKey, newCost);
        predecessor.set(neighborKey, current);
        frontier.push(neighbor);
      }
    }
  }

  function reconstructPath(coord: Coord): Coord[] {
    const path: Coord[] = [coord];
    let cursor = coord;
    while (!coordsEqual(cursor, start)) {
      const prev = predecessor.get(coordKey(cursor));
      if (!prev) break; // não deveria acontecer — todo tile em `dist` tem predecessor até `start`
      path.push(prev);
      cursor = prev;
    }
    return path.reverse();
  }

  const results: ReachableTile[] = [];
  for (const [key, cost] of dist) {
    if (key === coordKey(start)) continue;
    const [xRaw, yRaw] = key.split(',');
    const coord: Coord = { x: Number(xRaw), y: Number(yRaw) };
    if (isOccupied(coord, ctx.occupiedByAlly)) continue;
    results.push({ coord, cost, path: reconstructPath(coord) });
  }
  return results;
}

// §5.2 — "O caminho vem inteiro no comando move e é revalidado pelo simulador. Nunca
// confie no cliente." Recalcula o custo passo a passo e aplica as mesmas regras de
// computeReachableTiles.
export function validatePath(ctx: PathfindingContext, path: readonly Coord[], moveRange: number): PathValidationResult {
  if (path.length === 0) {
    return { valid: false, cost: 0, reason: 'caminho vazio' };
  }

  const start = path[0] as Coord;
  let cost = 0;
  let haltedByZoc = false;

  for (let i = 1; i < path.length; i++) {
    const previous = path[i - 1] as Coord;
    const step = path[i] as Coord;

    if (!isInBounds(ctx.map, step)) return { valid: false, cost, reason: 'fora do mapa' };
    if (manhattanDistance(previous, step) !== 1) {
      return { valid: false, cost, reason: 'passo não ortogonalmente adjacente' };
    }
    if (haltedByZoc) return { valid: false, cost, reason: 'continuou andando depois de entrar em ZoC' };
    if (isOccupied(step, ctx.occupiedByEnemy)) return { valid: false, cost, reason: 'tile ocupado por inimigo' };

    const moveCost = terrainMoveCost(ctx.map, step, ctx.moveType);
    if (moveCost === undefined || moveCost === 'impassable') {
      return { valid: false, cost, reason: 'terreno impassável' };
    }

    cost += moveCost;
    if (cost > moveRange) return { valid: false, cost, reason: 'excede o moveRange' };

    if (isZoc(ctx.map, step, ctx.occupiedByEnemy)) haltedByZoc = true;
  }

  const destination = path[path.length - 1] as Coord;
  if (!coordsEqual(destination, start) && isOccupied(destination, ctx.occupiedByAlly)) {
    return { valid: false, cost, reason: 'termina sobre aliado' };
  }

  return { valid: true, cost };
}
