import { describe, expect, it } from 'vitest';
import { loadReplay, runBattleCommand } from '../src/battle.js';
import type { BattleSetup } from '@paths-beyond/core';

function statSheet() {
  return {
    hp: 400, atk: 1000, def: 100, spd: 100, chc: 100, chd: 1500,
    eff: 0, efr: 0, pen: 0, heal: 0, lifesteal: 0, focus: 0, vigor: 0,
  };
}

const strike = {
  id: 'skill-strike', name: 'Golpe', kind: 'duel', apCost: 1, cooldown: 0,
  multiplier: 1500, flat: 100, scalesWith: 'atk', effects: [], tags: ['physical'],
};

function unit(id: string, side: 'player' | 'enemy', x: number) {
  return {
    unitId: id, heroId: `hero-${id}`, side,
    pos: { x, y: 0 }, height: 0,
    hp: 400, ap: 3, pp: 2, hasActedThisRound: false,
    effects: [], cooldowns: {},
    stats: statSheet(), unitType: 'infantry', weaponType: 'sword', duelRange: 1, assistRange: 2,
    moveType: 'foot', moveRange: 4,
    tacticsScript: [{ enabled: true, skillId: strike.id, conditions: [] }],
    reactionScript: [],
    knownSkills: { [strike.id]: strike },
  };
}

function buildMapFile() {
  const tiles = Array.from({ length: 15 }, () => Array.from({ length: 15 }, () => ({ terrain: 'plain', height: 0 as const })));
  const initialState: BattleSetup = {
    map: { width: 15, height: 15, tiles, terrains: { plain: { id: 'plain', moveCost: { foot: 1, cavalry: 1, flying: 1, heavy: 1, aquatic: 2 }, defBonus: 0, evaBonus: 0, blocksSight: false } }, zocEnabled: false },
    units: [unit('atk', 'player', 0), unit('def', 'enemy', 1)] as unknown as BattleSetup['units'],
    permadeath: 'classic',
    winCondition: { t: 'rout' },
    effectDefs: {},
    initialValor: 5,
  };
  return { rulesVersion: '0.0.0', seed: 42, initialState };
}

function fakeReadFile(files: Record<string, unknown>) {
  return (path: string): string => {
    const content = files[path];
    if (content === undefined) throw new Error(`arquivo não encontrado: ${path}`);
    return JSON.stringify(content);
  };
}

describe('loadReplay', () => {
  it('combina map.json (setup) e --replay r.json (comandos) num único Replay', () => {
    const readFile = fakeReadFile({
      'map.json': buildMapFile(),
      'r.json': { commands: [{ t: 'engage', unitId: 'atk', targetId: 'def' }] },
    });
    const replay = loadReplay(readFile, 'map.json', 'r.json');
    expect(replay.seed).toBe(42);
    expect(replay.commands).toHaveLength(1);
    expect(replay.initialState.units).toHaveLength(2);
  });

  it('sem --replay, usa uma lista de comandos vazia', () => {
    const readFile = fakeReadFile({ 'map.json': buildMapFile() });
    const replay = loadReplay(readFile, 'map.json', undefined);
    expect(replay.commands).toEqual([]);
  });
});

describe('runBattleCommand — sim-cli battle map.json --replay r.json', () => {
  it('roda a batalha e imprime rounds, resultado, iniciativa e unidades finais', () => {
    const readFile = fakeReadFile({
      'map.json': buildMapFile(),
      'r.json': { commands: [{ t: 'engage', unitId: 'atk', targetId: 'def' }] },
    });
    const output = runBattleCommand({ mapFile: 'map.json', replayFile: 'r.json' }, readFile);
    expect(output).toContain('Resultado:');
    expect(output).toContain('Ordem de iniciativa');
    expect(output).toContain('atk');
    expect(output).toContain('def');
  });
});
