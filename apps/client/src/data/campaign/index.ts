import type { BattleSetup } from '@paths-beyond/core';
import { map1 } from './map1.js';
import { map2 } from './map2.js';
import { map3 } from './map3.js';
import { bandit1, bandit2, createPlayerHero, map2Enemies, map3Enemies } from './units.js';

// Campanha de demonstração pra M6 (3 mapas — critério de aceite do milestone) — não é
// conteúdo real (ver DECISIONS.md, M8 substitui). Cada mapa recebe uma instância nova do
// herói do jogador porque não existe persistência entre mapas ainda (decisão desta
// fatia): HP/AP/PP não carregam de um mapa pro próximo.
export const campaignMap1: BattleSetup = {
  map: map1,
  units: [createPlayerHero({ x: 1, y: 7 }), bandit1, bandit2],
  permadeath: 'casual',
  winCondition: { t: 'rout' },
  effectDefs: {},
  initialValor: 5,
};

export const campaignMap2: BattleSetup = {
  map: map2,
  units: [createPlayerHero({ x: 1, y: 7 }), ...map2Enemies],
  permadeath: 'casual',
  winCondition: { t: 'rout' },
  effectDefs: {},
  initialValor: 5,
};

export const campaignMap3: BattleSetup = {
  map: map3,
  units: [createPlayerHero({ x: 1, y: 7 }), ...map3Enemies],
  permadeath: 'casual',
  winCondition: { t: 'rout' },
  effectDefs: {},
  initialValor: 5,
};

export const campaignMaps: readonly BattleSetup[] = [campaignMap1, campaignMap2, campaignMap3];
