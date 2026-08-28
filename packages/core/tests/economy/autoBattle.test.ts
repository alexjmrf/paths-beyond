import { describe, expect, it } from 'vitest';
import type { BattleSetup, BattleUnit } from '../../src/battle/types.js';
import { hashState } from '../../src/determinism/hash.js';
import { AUTO_BATTLE_COMMAND_BUDGET, resolveAutoBattle } from '../../src/economy/autoBattle.js';
import type { GridMap, Terrain } from '../../src/grid/types.js';
import type { SkillDef } from '../../src/skills/types.js';
import type { StatSheet } from '../../src/stats/types.js';

// M14, sub-sessão 2/N — a varredura. Decisão do usuário: depois de limpar a masmorra à
// mão, o jogador pode deixar um time automático, "que ainda sim teria que ser forte o
// suficiente para passar".
//
// É por isso que a varredura NÃO é um sorteio de sucesso: é a batalha inteira resolvida
// com a IA de mapa (§9.1, M7) jogando os DOIS lados. "Forte o bastante" cai fora da
// simulação, sem número de dificuldade nenhum — se o time não vence, não vence.

const plain: Terrain = {
  id: 'plain',
  moveCost: { foot: 1, cavalry: 1, flying: 1, heavy: 1, aquatic: 2 },
  defBonus: 0,
  evaBonus: 0,
  blocksSight: false,
};

function buildMap(size = 6): GridMap {
  const tiles = Array.from({ length: size }, () =>
    Array.from({ length: size }, () => ({ terrain: 'plain', height: 0 as const })),
  );
  return { width: size, height: size, tiles, terrains: { plain }, zocEnabled: false };
}

function statSheet(overrides: Partial<StatSheet> = {}): StatSheet {
  return {
    hp: 5000, atk: 1000, def: 300, spd: 100, chc: 100, chd: 1500,
    eff: 0, efr: 0, pen: 0, heal: 0, lifesteal: 0, focus: 0, vigor: 0,
    ...overrides,
  };
}

const strike: SkillDef = {
  id: 'skill-strike', name: 'Golpe', kind: 'duel', apCost: 1, cooldown: 0,
  multiplier: 1500, flat: 100, scalesWith: 'atk', effects: [], tags: ['physical'],
};

function buildUnit(overrides: Partial<BattleUnit> = {}): BattleUnit {
  return {
    unitId: 'u1', heroId: 'h1', side: 'player',
    pos: { x: 0, y: 0 }, height: 0,
    hp: 5000, ap: 3, pp: 2, hasActedThisRound: false,
    effects: [], cooldowns: {},
    stats: statSheet(), unitType: 'infantry', weaponType: 'sword', duelRange: 1, assistRange: 2,
    moveType: 'foot', moveRange: 4,
    tacticsScript: [{ enabled: true, skillId: strike.id, conditions: [] }],
    reactionScript: [],
    knownSkills: { [strike.id]: strike },
    ...overrides,
  };
}

function buildSetup(units: readonly BattleUnit[]): BattleSetup {
  return {
    map: buildMap(),
    units,
    permadeath: 'classic',
    winCondition: { t: 'rout' },
    effectDefs: {},
    initialValor: 5,
  };
}

// Time do jogador forte contra um inimigo fraco, e o inverso — a mesma montagem, com os
// stats trocados.
function setupComVantagemDoJogador(): BattleSetup {
  return buildSetup([
    buildUnit({ unitId: 'heroi', side: 'player', pos: { x: 0, y: 0 }, hp: 9000, stats: statSheet({ hp: 9000, atk: 2500 }) }),
    buildUnit({
      unitId: 'inimigo', side: 'enemy', pos: { x: 4, y: 4 }, hp: 900,
      stats: statSheet({ hp: 900, atk: 200, def: 0 }), aiArchetype: 'aggressive',
    }),
  ]);
}

function setupComTimeFraco(): BattleSetup {
  return buildSetup([
    buildUnit({ unitId: 'heroi', side: 'player', pos: { x: 0, y: 0 }, hp: 700, stats: statSheet({ hp: 700, atk: 150, def: 0 }) }),
    buildUnit({
      unitId: 'inimigo', side: 'enemy', pos: { x: 4, y: 4 }, hp: 9000,
      stats: statSheet({ hp: 9000, atk: 3000 }), aiArchetype: 'aggressive',
    }),
  ]);
}

describe('resolveAutoBattle', () => {
  it('é determinística: a mesma seed devolve exatamente a mesma batalha', () => {
    const a = resolveAutoBattle({ setup: setupComVantagemDoJogador(), seed: 7 });
    const b = resolveAutoBattle({ setup: setupComVantagemDoJogador(), seed: 7 });
    expect(hashState(a.state)).toBe(hashState(b.state));
    expect(a.commands).toEqual(b.commands);
  });

  it('time forte vence sozinho, sem nenhum comando humano', () => {
    const r = resolveAutoBattle({ setup: setupComVantagemDoJogador(), seed: 7 });
    expect(r.outcome).toBe('victory');
    expect(r.commands.length).toBeGreaterThan(0);
  });

  it('time fraco PERDE — a varredura não é loot garantido', () => {
    const r = resolveAutoBattle({ setup: setupComTimeFraco(), seed: 7 });
    expect(r.outcome).toBe('defeat');
  });

  it('o teto de comandos existe para um mapa insolúvel não rodar para sempre', () => {
    // Ninguém alcança ninguém: os dois lados ficam parados (`hold-position`) e a condição
    // de vitória nunca é atingida.
    const parados = buildSetup([
      buildUnit({ unitId: 'heroi', side: 'player', pos: { x: 0, y: 0 } }),
      buildUnit({ unitId: 'inimigo', side: 'enemy', pos: { x: 5, y: 5 }, aiArchetype: 'hold-position' }),
    ]);
    const r = resolveAutoBattle({ setup: parados, seed: 1, playerArchetypes: { heroi: 'hold-position' } });
    expect(r.outcome).toBe('ongoing');
    expect(r.commands.length).toBeLessThanOrEqual(AUTO_BATTLE_COMMAND_BUDGET);
  });

  it('o arquétipo do time automático é escolha de quem chama, e muda a batalha', () => {
    const agressivo = resolveAutoBattle({ setup: setupComVantagemDoJogador(), seed: 3, playerArchetypes: { heroi: 'aggressive' } });
    const parado = resolveAutoBattle({ setup: setupComVantagemDoJogador(), seed: 3, playerArchetypes: { heroi: 'hold-position' } });
    expect(agressivo.outcome).toBe('victory');
    // Parado, o herói nunca alcança o inimigo — que por sua vez vem até ele. O desfecho
    // pode até ser vitória, mas a sequência de comandos não pode ser a mesma.
    expect(parado.commands).not.toEqual(agressivo.commands);
  });

  it('o padrão é agressivo: sem arquétipo declarado o time ainda joga', () => {
    const semArquetipo = resolveAutoBattle({ setup: setupComVantagemDoJogador(), seed: 3 });
    const agressivo = resolveAutoBattle({ setup: setupComVantagemDoJogador(), seed: 3, playerArchetypes: { heroi: 'aggressive' } });
    expect(semArquetipo.commands).toEqual(agressivo.commands);
  });

  it('devolve os comandos que jogou, então a varredura é auditável como um replay', () => {
    const r = resolveAutoBattle({ setup: setupComVantagemDoJogador(), seed: 7 });
    for (const command of r.commands) {
      expect(command.t === 'useValor' ? true : command.unitId).toBe(command.t === 'useValor' ? true : 'heroi');
    }
  });
});
