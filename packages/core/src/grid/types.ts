// §5.1 — Coord não tem shape normativo na spec; {x,y} é a leitura óbvia (ver DECISIONS.md).
export interface Coord {
  readonly x: number;
  readonly y: number;
}

// §5.1 — "MoveType DEVE incluir foot, cavalry, flying, heavy, aquatic".
export type MoveType = 'foot' | 'cavalry' | 'flying' | 'heavy' | 'aquatic';

// TerrainId não tem enum fechado na spec — é uma chave livre definida em packages/data.
export type TerrainId = string;

export interface Terrain {
  readonly id: TerrainId;
  readonly moveCost: Readonly<Record<MoveType, number | 'impassable'>>;
  readonly defBonus: number; // fp-scale, % de mitigação
  readonly evaBonus: number; // fp-scale
  readonly blocksSight: boolean;
}

export interface Tile {
  readonly terrain: TerrainId;
  readonly height: 0 | 1 | 2 | 3;
  readonly object?: 'wall' | 'fort' | 'gate' | 'chest' | 'camp';
}

export interface GridMap {
  readonly width: number;
  readonly height: number;
  readonly tiles: readonly (readonly Tile[])[]; // tiles[y][x]
  readonly terrains: Readonly<Record<TerrainId, Terrain>>;
  readonly zocEnabled: boolean;
}

export function tileAt(map: GridMap, coord: Coord): Tile | undefined {
  return map.tiles[coord.y]?.[coord.x];
}

export function isInBounds(map: GridMap, coord: Coord): boolean {
  return coord.x >= 0 && coord.x < map.width && coord.y >= 0 && coord.y < map.height;
}

export function manhattanDistance(a: Coord, b: Coord): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

export function coordKey(coord: Coord): string {
  return `${coord.x},${coord.y}`;
}

export function coordsEqual(a: Coord, b: Coord): boolean {
  return a.x === b.x && a.y === b.y;
}

export function orthogonalNeighbors(coord: Coord): readonly Coord[] {
  return [
    { x: coord.x, y: coord.y - 1 },
    { x: coord.x, y: coord.y + 1 },
    { x: coord.x - 1, y: coord.y },
    { x: coord.x + 1, y: coord.y },
  ];
}
