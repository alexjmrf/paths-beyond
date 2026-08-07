import type { Terrain } from '@paths-beyond/core';

// Conteúdo de demonstração pra M6 (cliente jogável) — não é conteúdo de jogo real nem
// balanceado. Conteúdo de verdade é M8 (ver DECISIONS.md).
export const plain: Terrain = {
  id: 'plain',
  moveCost: { foot: 1, cavalry: 1, flying: 1, heavy: 1, aquatic: 2 },
  defBonus: 0,
  evaBonus: 0,
  blocksSight: false,
};

export const forest: Terrain = {
  id: 'forest',
  moveCost: { foot: 2, cavalry: 3, flying: 1, heavy: 3, aquatic: 'impassable' },
  defBonus: 100,
  evaBonus: 50,
  blocksSight: true,
};

export const mountain: Terrain = {
  id: 'mountain',
  moveCost: { foot: 'impassable', cavalry: 'impassable', flying: 1, heavy: 'impassable', aquatic: 'impassable' },
  defBonus: 150,
  evaBonus: 100,
  blocksSight: true,
};

export const campaignTerrains: Record<string, Terrain> = { plain, forest, mountain };
