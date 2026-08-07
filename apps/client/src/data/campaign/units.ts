import type { BattleUnit, Coord, StatSheet } from '@paths-beyond/core';
import { campaignSkills } from './skills.js';

function statSheet(overrides: Partial<StatSheet> = {}): StatSheet {
  return {
    hp: 3000,
    atk: 800,
    def: 250,
    spd: 100,
    chc: 100,
    chd: 1500,
    eff: 0,
    efr: 0,
    pen: 0,
    heal: 0,
    lifesteal: 0,
    focus: 0,
    vigor: 0,
    ...overrides,
  };
}

// Unidades de demonstração pra M6 — não é conteúdo de jogo real/balanceado (ver
// DECISIONS.md). Formato self-contained (BattleUnit), mesma decisão de M2/M3: sem
// pipeline de resolução Hero→stats ainda, os stats já vêm prontos.
//
// Sem sistema de persistência entre mapas ainda (decisão desta fatia, ver
// DECISIONS.md): o herói do jogador começa cada mapa com os stats/pools cheios de novo,
// não carrega HP/AP/PP do mapa anterior.
export function createPlayerHero(pos: Coord): BattleUnit {
  return {
    unitId: 'unit-soldado',
    heroId: 'hero-jogador',
    side: 'player',
    pos,
    height: 0,
    hp: 3000,
    ap: 3,
    pp: 2,
    hasActedThisRound: false,
    effects: [],
    cooldowns: {},
    stats: statSheet(),
    unitType: 'infantry',
    weaponType: 'sword',
    duelRange: 1,
    assistRange: 2,
    moveType: 'foot',
    moveRange: 5,
    tacticsScript: [{ enabled: true, skillId: 'skill-golpe', conditions: [] }],
    reactionScript: [{ enabled: true, skillId: 'skill-contra-ataque', conditions: [] }],
    knownSkills: campaignSkills,
  };
}

export const playerHero: BattleUnit = createPlayerHero({ x: 1, y: 7 });

function createEnemy(id: string, pos: Coord, overrides: Partial<BattleUnit> = {}): BattleUnit {
  return {
    unitId: id,
    heroId: `hero-${id}`,
    side: 'enemy',
    pos,
    height: 0,
    hp: 2000,
    ap: 3,
    pp: 2,
    hasActedThisRound: false,
    effects: [],
    cooldowns: {},
    stats: statSheet({ hp: 2000, atk: 700, def: 180 }),
    unitType: 'infantry',
    weaponType: 'axe',
    duelRange: 1,
    assistRange: 2,
    moveType: 'foot',
    moveRange: 4,
    tacticsScript: [{ enabled: true, skillId: 'skill-golpe', conditions: [] }],
    reactionScript: [{ enabled: true, skillId: 'skill-contra-ataque', conditions: [] }],
    knownSkills: campaignSkills,
    ...overrides,
  };
}

// Mapa 1 — patrulha pequena.
export const bandit1: BattleUnit = createEnemy('unit-bandido-1', { x: 12, y: 4 }, { weaponType: 'axe' });
export const bandit2: BattleUnit = createEnemy('unit-bandido-2', { x: 12, y: 10 }, {
  stats: statSheet({ hp: 2000, atk: 700, def: 180, spd: 130 }),
  weaponType: 'spear',
});

// Mapa 2 — patrulha maior, com um arqueiro.
export const map2Enemies: readonly BattleUnit[] = [
  createEnemy('unit-patrulheiro-1', { x: 11, y: 3 }, {
    stats: statSheet({ hp: 2200, atk: 750, def: 200, spd: 110 }),
    weaponType: 'spear',
  }),
  createEnemy('unit-patrulheiro-2', { x: 13, y: 7 }, {
    stats: statSheet({ hp: 2200, atk: 750, def: 200 }),
    weaponType: 'axe',
  }),
  createEnemy('unit-patrulheiro-3', { x: 11, y: 11 }, {
    stats: statSheet({ hp: 1600, atk: 900, def: 120, spd: 140 }),
    weaponType: 'bow',
    duelRange: 2,
  }),
];

// Mapa 3 — chefe com dois guardas.
export const map3Enemies: readonly BattleUnit[] = [
  createEnemy('unit-guarda-1', { x: 10, y: 6 }, { stats: statSheet({ hp: 2500, atk: 800, def: 250 }) }),
  createEnemy('unit-guarda-2', { x: 10, y: 8 }, { stats: statSheet({ hp: 2500, atk: 800, def: 250 }) }),
  createEnemy('unit-chefe', { x: 13, y: 7 }, {
    stats: statSheet({ hp: 5000, atk: 1100, def: 350, spd: 120, chc: 200 }),
    weaponType: 'axe',
  }),
];
