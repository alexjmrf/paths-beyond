import type { GridMap, Tile } from '@paths-beyond/core';
import { campaignTerrains } from './terrains.js';

const SIZE = 15;

function buildTiles(): Tile[][] {
  const tiles: Tile[][] = [];
  for (let y = 0; y < SIZE; y++) {
    const row: Tile[] = [];
    for (let x = 0; x < SIZE; x++) {
      let terrain = 'plain';
      if ((x === 6 || x === 7) && y >= 3 && y <= 10) terrain = 'forest';
      if (x === 10 && y === 10) terrain = 'mountain';
      row.push({ terrain, height: 0 });
    }
    tiles.push(row);
  }
  return tiles;
}

// Mapa 1 de demonstração pra M6 — não é conteúdo de campanha real (ver DECISIONS.md).
export const map1: GridMap = {
  width: SIZE,
  height: SIZE,
  tiles: buildTiles(),
  terrains: campaignTerrains,
  zocEnabled: true,
};
