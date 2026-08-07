import type { GridMap, Tile } from '@paths-beyond/core';
import { campaignTerrains } from './terrains.js';

const SIZE = 15;

// Arena aberta pro confronto com o chefe, com bolsões de floresta nas bordas e uma
// elevação central.
function buildTiles(): Tile[][] {
  const tiles: Tile[][] = [];
  for (let y = 0; y < SIZE; y++) {
    const row: Tile[] = [];
    for (let x = 0; x < SIZE; x++) {
      let terrain = 'plain';
      if ((x <= 1 || x >= 13) && y >= 4 && y <= 10) terrain = 'forest';
      if (x >= 6 && x <= 8 && y >= 6 && y <= 8) terrain = 'mountain';
      row.push({ terrain, height: 0 });
    }
    tiles.push(row);
  }
  return tiles;
}

// Mapa 3 de demonstração pra M6 — não é conteúdo de campanha real (ver DECISIONS.md).
export const map3: GridMap = {
  width: SIZE,
  height: SIZE,
  tiles: buildTiles(),
  terrains: campaignTerrains,
  zocEnabled: true,
};
