import type { ItemInstance, ItemSet } from '@paths-beyond/core';

// Conteúdo de demonstração pra M6 — não balanceado (ver DECISIONS.md, M8 substitui).
export const guerreiroSet: ItemSet = {
  id: 'set-guerreiro',
  name: 'Conjunto do Guerreiro',
  effects: [
    { t: 'stat', pieces: 2, stat: 'atk', flat: 100 },
    { t: 'stat', pieces: 4, stat: 'atk', pct: 150 },
  ],
};

export const sentinelaSet: ItemSet = {
  id: 'set-sentinela',
  name: 'Conjunto da Sentinela',
  effects: [
    { t: 'stat', pieces: 2, stat: 'def', flat: 80 },
    { t: 'stat', pieces: 4, stat: 'hp', pct: 120 },
  ],
};

export const campaignItemSets: readonly ItemSet[] = [guerreiroSet, sentinelaSet];

function item(overrides: Omit<ItemInstance, 'reforged'> & { reforged?: boolean }): ItemInstance {
  return { reforged: false, ...overrides };
}

export const campaignItems: readonly ItemInstance[] = [
  item({
    id: 'item-espada-guerreiro',
    setId: 'set-guerreiro',
    slot: 'weapon',
    rarity: 'epic',
    ilvl: 85,
    mainstat: { stat: 'atk', value: 320 },
    substats: [
      { stat: 'chc', value: 60, rolls: 3 },
      { stat: 'chd', value: 150, rolls: 3 },
      { stat: 'spd', value: 15, rolls: 2 },
    ],
    enhance: 12,
  }),
  item({
    id: 'item-elmo-guerreiro',
    setId: 'set-guerreiro',
    slot: 'helmet',
    rarity: 'heroic',
    ilvl: 78,
    mainstat: { stat: 'hp', value: 900 },
    substats: [
      { stat: 'def', value: 70, rolls: 2 },
      { stat: 'spd', value: 10, rolls: 1 },
    ],
    enhance: 9,
  }),
  item({
    id: 'item-botas-guerreiro',
    setId: 'set-guerreiro',
    slot: 'boots',
    rarity: 'common',
    ilvl: 60,
    mainstat: { stat: 'spd', value: 25 },
    substats: [
      { stat: 'eff', value: 40, rolls: 1 },
      { stat: 'pen', value: 30, rolls: 1 },
    ],
    enhance: 0,
  }),
  item({
    id: 'item-armadura-sentinela',
    setId: 'set-sentinela',
    slot: 'armor',
    rarity: 'epic',
    ilvl: 90,
    mainstat: { stat: 'def', value: 260 },
    substats: [
      { stat: 'hp', value: 400, rolls: 3 },
      { stat: 'efr', value: 90, rolls: 2 },
    ],
    enhance: 15,
    reforged: true,
  }),
  item({
    id: 'item-colar-sentinela',
    setId: 'set-sentinela',
    slot: 'necklace',
    rarity: 'rare',
    ilvl: 65,
    mainstat: { stat: 'focus', value: 200 },
    substats: [
      { stat: 'atk', value: 40, rolls: 1 },
      { stat: 'chc', value: 30, rolls: 1 },
    ],
    enhance: 3,
  }),
  item({
    id: 'item-anel-sentinela',
    setId: 'set-sentinela',
    slot: 'ring',
    rarity: 'heroic',
    ilvl: 72,
    mainstat: { stat: 'vigor', value: 180 },
    substats: [
      { stat: 'def', value: 50, rolls: 1 },
      { stat: 'hp', value: 200, rolls: 1 },
    ],
    enhance: 6,
  }),
];
