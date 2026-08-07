// Replay canônico usado pelo teste de determinismo entre runtimes.
//
// Este arquivo NÃO é um teste — é a fixture compartilhada. Ele é importado tanto pela
// execução em Node quanto pela execução em navegadores reais, de propósito: os dois lados
// precisam simular exatamente o mesmo replay para que a comparação de hash signifique
// alguma coisa.
//
// Ao mudar qualquer coisa aqui, o GOLDEN_HASH em crossRuntime.test.ts muda junto. Isso é
// intencional: a fixture é um contrato congelado. Se você precisou editá-la para um teste
// passar, pare — ou a regra mudou (e aí RULES_VERSION sobe também), ou há um bug.

import type { BattleSetup, BattleUnit, Replay } from '../../src/battle/types.js';
import type { EffectDef } from '../../src/duel/types.js';
import type { GridMap, Terrain } from '../../src/grid/types.js';
import type { SkillDef } from '../../src/skills/types.js';
import type { StatSheet } from '../../src/stats/types.js';

const plain: Terrain = {
  id: 'plain',
  moveCost: { foot: 1, cavalry: 1, flying: 1, heavy: 1, aquatic: 2 },
  defBonus: 0,
  evaBonus: 0,
  blocksSight: false,
};

const forest: Terrain = {
  id: 'forest',
  moveCost: { foot: 2, cavalry: 3, flying: 1, heavy: 3, aquatic: 'impassable' },
  defBonus: 150,
  evaBonus: 100,
  blocksSight: true,
};

function buildMap(): GridMap {
  // Tabuleiro 6x6 com uma faixa de floresta e desnível, para que o hash cubra também os
  // modificadores posicionais (§5.5), não só a troca de golpes.
  const tiles = Array.from({ length: 6 }, (_unused, y) =>
    Array.from({ length: 6 }, (_unused2, x) => ({
      terrain: x === 3 ? 'forest' : 'plain',
      height: (y === 5 ? 1 : 0) as 0 | 1,
    })),
  );
  return { width: 6, height: 6, tiles, terrains: { plain, forest }, zocEnabled: true };
}

function statSheet(overrides: Partial<StatSheet> = {}): StatSheet {
  return {
    hp: 5000, atk: 1000, def: 300, spd: 100, chc: 300, chd: 1500,
    eff: 200, efr: 100, pen: 0, heal: 0, lifesteal: 0, focus: 0, vigor: 0,
    ...overrides,
  };
}

const strike: SkillDef = {
  id: 'skill-strike', name: 'Golpe', kind: 'duel', apCost: 1, cooldown: 0,
  multiplier: 1500, flat: 100, scalesWith: 'atk', effects: [], tags: ['physical'],
};

const heavyBlow: SkillDef = {
  id: 'skill-heavy', name: 'Golpe Pesado', kind: 'duel', apCost: 2, cooldown: 1,
  multiplier: 2200, flat: 0, scalesWith: 'atk',
  effects: [{ effectId: 'effect-bleed', target: 'target', chance: 700 }],
  tags: ['physical'],
};

const counter: SkillDef = {
  id: 'react-counter', name: 'Contra-atacar', kind: 'reaction', apCost: 0, ppCost: 1,
  cooldown: 0, multiplier: 800, flat: 0, scalesWith: 'atk',
  trigger: 'onAttacked', effects: [], tags: ['physical'],
};

const bleed: EffectDef = {
  id: 'effect-bleed', name: 'Sangramento', kind: 'debuff', dispellable: true, maxStacks: 2,
  statMods: [{ stat: 'def', pct: -100 }],
};

const KNOWN = {
  [strike.id]: strike,
  [heavyBlow.id]: heavyBlow,
  [counter.id]: counter,
};

function buildUnit(overrides: Partial<BattleUnit> = {}): BattleUnit {
  return {
    unitId: 'u1', heroId: 'h1', side: 'player',
    pos: { x: 0, y: 0 }, height: 0,
    hp: 5000, ap: 4, pp: 3, hasActedThisRound: false,
    effects: [], cooldowns: {},
    stats: statSheet(), unitType: 'infantry', weaponType: 'sword',
    duelRange: 1, assistRange: 2, moveType: 'foot', moveRange: 4,
    tacticsScript: [
      // Duas linhas com condição, para que o interpretador de táticas (§6.3) entre no
      // hash e não só o ataque básico.
      { enabled: true, skillId: heavyBlow.id, conditions: [{ t: 'targetHpAbove', pct: 500 }] },
      { enabled: true, skillId: strike.id, conditions: [] },
    ],
    reactionScript: [{ enabled: true, skillId: counter.id, conditions: [] }],
    knownSkills: KNOWN,
    ...overrides,
  };
}

function buildSetup(units: readonly BattleUnit[]): BattleSetup {
  return {
    map: buildMap(),
    units,
    permadeath: 'classic',
    winCondition: { t: 'rout' },
    effectDefs: { [bleed.id]: bleed },
    initialValor: 5,
  };
}

/**
 * Replay congelado. Exercita de propósito: movimento com custo de terreno, ZoC, duelo com
 * script de duas linhas, reação com PP, triângulo de armas, assistência de aliado
 * adjacente, crítico, variância de dano e aplicação de debuff.
 */
export function buildGoldenReplay(): Replay {
  const swordsman = buildUnit({
    unitId: 'espadachim', heroId: 'h-espada', side: 'player',
    pos: { x: 0, y: 0 }, weaponType: 'sword',
  });

  // Aliado posicionado para entrar como assistência (§6.5) no duelo do espadachim.
  const archer = buildUnit({
    unitId: 'arqueiro', heroId: 'h-arco', side: 'player',
    pos: { x: 0, y: 1 }, weaponType: 'bow', unitType: 'infantry',
    duelRange: 2, assistRange: 3,
    stats: statSheet({ atk: 800, def: 200, spd: 130 }),
  });

  // Machado: perde para espada no triângulo (§6.8), então o multiplicador entra no hash.
  const axeman = buildUnit({
    unitId: 'machadeiro', heroId: 'h-machado', side: 'enemy',
    pos: { x: 2, y: 0 }, weaponType: 'axe',
    stats: statSheet({ hp: 6000, atk: 1100, def: 250, spd: 80 }),
    hp: 6000,
  });

  const armored = buildUnit({
    unitId: 'couracado', heroId: 'h-couraca', side: 'enemy',
    pos: { x: 4, y: 5 }, height: 1, weaponType: 'spear', unitType: 'armored',
    moveType: 'heavy', moveRange: 3,
    stats: statSheet({ hp: 7000, atk: 900, def: 600, spd: 50 }),
    hp: 7000,
  });

  return {
    rulesVersion: '0.0.0',
    seed: 20260803,
    initialState: buildSetup([swordsman, archer, axeman, armored]),
    commands: [
      { t: 'move', unitId: 'espadachim', path: [{ x: 0, y: 0 }, { x: 1, y: 0 }] },
      { t: 'engage', unitId: 'espadachim', targetId: 'machadeiro' },
      { t: 'rest', unitId: 'arqueiro' },
      { t: 'wait', unitId: 'machadeiro' },
      { t: 'wait', unitId: 'couracado' },
      { t: 'engage', unitId: 'espadachim', targetId: 'machadeiro' },
      { t: 'wait', unitId: 'arqueiro' },
      { t: 'wait', unitId: 'machadeiro' },
      { t: 'wait', unitId: 'couracado' },
    ],
  };
}
