import type { GridMap, Tile } from '@paths-beyond/core';
import { campaignTerrains } from './terrains.js';

const SIZE = 15;

// Muralha de montanha no meio do mapa, com duas passagens (y=2 e y=12).
function buildTiles(): Tile[][] {
  const tiles: Tile[][] = [];
  for (let y = 0; y < SIZE; y++) {
    const row: Tile[] = [];
    for (let x = 0; x < SIZE; x++) {
      let terrain = 'plain';
      if (x === 7 && y !== 2 && y !== 12) terrain = 'mountain';
      if ((x === 5 || x === 9) && y >= 5 && y <= 9) terrain = 'forest';
      row.push({ terrain, height: 0 });
    }
    tiles.push(row);
  }
  return tiles;
}

// Mapa 2 de demonstração pra M6 — não é conteúdo de campanha real (ver DECISIONS.md).
export const map2: GridMap = {
  width: SIZE,
  height: SIZE,
  tiles: buildTiles(),
  terrains: campaignTerrains,
  zocEnabled: true,
};
