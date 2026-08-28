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

// §5.1 declara `object?: 'wall'|'fort'|'gate'|'chest'|'camp'`. M15 D3 (briefing) removeu
// `chest`: loot em mapa é sistema de exploração que este jogo não tem, e um valor de enum
// que nada lê e nada escreve é dívida, não recurso. Os quatro restantes têm leitor no motor:
// `fort`/`camp` dão +1 AP no `wait` (§5.4) e são objetivo de captura (§5.6); `wall` e `gate`
// bloqueiam movimento (pathfinding.ts).
export const TILE_OBJECTS = ['wall', 'fort', 'gate', 'camp'] as const;

export type TileObject = (typeof TILE_OBJECTS)[number];

// §5.6 — "+2 ao capturar objetivo". A spec nomeia "objetivo" e não o define; a leitura
// decidida com o usuário (M15 1/N) é o tile de controle, que é o mesmo par que §5.4 já
// trata como valioso.
const CONTROL_OBJECTS: readonly TileObject[] = ['fort', 'camp'];

export function isControlObject(object: TileObject | undefined): boolean {
  return object !== undefined && CONTROL_OBJECTS.includes(object);
}

// Quem consegue ABRIR o portão encerrando o turno ao lado dele (§5.4 `wait`). Quem não
// consegue precisa arrombá-lo, gastando `durability` turnos-unidade — requisito do usuário
// para as fases de PvE (ver DECISIONS.md, M15 1/N).
//
// `'none'` é o portão TRANCADO: ninguém tem a chave e os dois lados só passam arrombando.
// Ele existe porque a alternativa se mostrou degenerada na prática (M15 2/N): com um lado
// dono da chave, a IA de mapa daquele lado anda até o portão e o `wait` do mesmo turno o
// abre — a fortaleza destrancava no round 1 e a durabilidade nunca era exercida.
export type GateOpensFor = 'player' | 'enemy' | 'any' | 'none';

export interface GateDef {
  readonly opensFor: GateOpensFor;
  readonly durability: number; // turnos-unidade para arrombar pelo lado travado
}

// Portão sem declaração no tile: qualquer um abre, num turno. É o portão simples, e é o que
// mantém `{ object: 'gate' }` sozinho sendo conteúdo válido.
export const DEFAULT_GATE: GateDef = { opensFor: 'any', durability: 1 };

export interface Tile {
  readonly terrain: TerrainId;
  readonly height: 0 | 1 | 2 | 3;
  readonly object?: TileObject;
  // Lido só quando `object === 'gate'`. Ausente = DEFAULT_GATE.
  readonly gate?: GateDef;
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
