import { describe, expect, it } from 'vitest';
import { applyCommand } from '../../src/battle/commands.js';
import { computeInitiativeOrder } from '../../src/battle/initiative.js';
import { hashState } from '../../src/determinism/hash.js';
import type { ValorSkillDef } from '../../src/battle/valor.js';
import type { BattleState, BattleUnit } from '../../src/battle/types.js';
import type { GridMap, Terrain, Tile } from '../../src/grid/types.js';
import type { SkillDef } from '../../src/skills/types.js';
import type { StatSheet } from '../../src/stats/types.js';

// §5.6 — Valor é "gasto em: restaurar AP/PP de uma unidade, **invocar reforço**, artilharia
// de mapa, buff global". Três dos quatro resolvem desde M11 3/N; `summonReinforcement`
// rejeitava alto com "ainda não tem resolução", porque invocar exige o blueprint completo de
// um `BattleUnit` e o core não importa `packages/data` (regra 1).
//
// M15 D2 fecha isso do jeito que a regra 4 exige: **a unidade invocada é CONTEÚDO**. O
// payload nomeia um `blueprintId`, o blueprint chega pronto em `BattleSetup.summonBlueprints`
// (mesmo padrão de `valorSkills` em M11), e o core só posiciona, nomeia e insere na
// iniciativa. §5.3 já autoriza a inserção: "unidades que entram depois (reforços, invocações)
// são inseridas na posição correspondente ao seu valor de iniciativa".

const plain: Terrain = {
  id: 'plain', moveCost: { foot: 1, cavalry: 1, flying: 1, heavy: 1, aquatic: 2 },
  defBonus: 0, evaBonus: 0, blocksSight: false,
};
const mountain: Terrain = {
  id: 'mountain',
  moveCost: { foot: 'impassable', cavalry: 'impassable', flying: 1, heavy: 'impassable', aquatic: 'impassable' },
  defBonus: 150, evaBonus: 100, blocksSight: true,
};

const strike: SkillDef = {
  id: 'skill-strike', name: 'Golpe', kind: 'duel', apCost: 1, cooldown: 0,
  multiplier: 1200, flat: 0, scalesWith: 'atk', effects: [], tags: ['physical'],
};

function statSheet(overrides: Partial<StatSheet> = {}): StatSheet {
  return {
    hp: 5000, atk: 1000, def: 300, spd: 100, chc: 0, chd: 1500,
    eff: 0, efr: 0, pen: 0, heal: 0, lifesteal: 0, focus: 0, vigor: 0,
    ...overrides,
  };
}

// 4x4 de planície, com montanha em (3,0) e muro em (3,1) — os dois jeitos de um tile ser
// impróprio para nascer alguém.
function buildMap(): GridMap {
  const tiles = Array.from({ length: 4 }, (_unused, y) =>
    Array.from({ length: 4 }, (_unused2, x): Tile => {
      if (x === 3 && y === 0) return { terrain: 'mountain', height: 2 };
      if (x === 3 && y === 1) return { terrain: 'plain', height: 0, object: 'wall' };
      return { terrain: 'plain', height: y === 2 ? 1 : 0 };
    }),
  );
  return { width: 4, height: 4, tiles, terrains: { plain, mountain }, zocEnabled: false };
}

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

// O blueprint é um BattleUnit já resolvido — quem o monta a partir do catálogo é a camada de
// conteúdo, exatamente como faz para as unidades iniciais do mapa.
const blueprint: BattleUnit = buildUnit({
  unitId: 'blueprint-milicia',
  heroId: 'hero-milicia',
  side: 'enemy', // sobrescrito pelo motor: quem invoca é o exército do jogador
  pos: { x: 0, y: 0 },
  height: 0,
  stats: statSheet({ spd: 500 }),
});

const invocar: ValorSkillDef = {
  id: 'valor-invocar', name: 'Convocar Milícia', cost: 3,
  kind: 'summonReinforcement', payload: { blueprintId: 'blueprint-milicia' },
};

function buildState(overrides: Partial<BattleState> = {}): BattleState {
  const units = [buildUnit(), buildUnit({ unitId: 'e1', side: 'enemy', pos: { x: 2, y: 0 }, stats: statSheet({ spd: 90 }) })];
  return {
    map: buildMap(),
    units,
    initiativeOrder: computeInitiativeOrder(units.map((u) => ({ id: u.unitId, spd: u.stats.spd })), 42),
    round: 1,
    valor: 5,
    distanceMovedThisTurn: {},
    freeAssistUsedThisRound: [],
    permadeath: 'classic',
    winCondition: { t: 'rout' },
    effectDefs: {},
    valorSkills: { [invocar.id]: invocar },
    summonBlueprints: { 'blueprint-milicia': blueprint },
    outcome: 'ongoing',
    seed: 42,
    ...overrides,
  };
}

const ALVO = { x: 1, y: 1 };

function summon(state: BattleState, target = ALVO): ReturnType<typeof applyCommand> {
  return applyCommand(state, { t: 'useValor', skillId: invocar.id, target });
}

describe('§5.6 summonReinforcement — invocar reforço (M15 D2)', () => {
  it('a unidade nasce no tile alvo, do lado do jogador, e o Valor é debitado', () => {
    const outcome = summon(buildState());

    expect(outcome.applied).toBe(true);
    expect(outcome.state.valor).toBe(2);
    expect(outcome.state.units).toHaveLength(3);

    const invocada = outcome.state.units[2] as BattleUnit;
    expect(invocada.side).toBe('player');
    expect(invocada.pos).toEqual(ALVO);
    expect(invocada.heroId).toBe('hero-milicia');
    expect(invocada.hp).toBe(5000);
  });

  it('a altura vem do tile, não do blueprint (§5.5 — vantagem posicional é do terreno)', () => {
    const outcome = summon(buildState(), { x: 1, y: 2 });
    expect((outcome.state.units[2] as BattleUnit).height).toBe(1);
  });

  it('não age no round em que nasce', () => {
    const outcome = summon(buildState());
    expect((outcome.state.units[2] as BattleUnit).hasActedThisRound).toBe(true);
  });

  it('recebe um unitId próprio: invocar duas vezes não cria duas unidades com o mesmo id', () => {
    let state = summon(buildState()).state;
    state = summon(state, { x: 2, y: 1 }).state;

    const ids = state.units.map((u) => u.unitId);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).not.toContain('blueprint-milicia');
  });
});

describe('§5.3 — a invocada entra na lista de iniciativa sem reordenar ninguém', () => {
  it('a lista cresce de um e as entradas antigas ficam idênticas', () => {
    const before = buildState();
    const after = summon(before).state;

    expect(after.initiativeOrder).toHaveLength(before.initiativeOrder.length + 1);
    const antigas = after.initiativeOrder.filter((e) => before.initiativeOrder.some((o) => o.unitId === e.unitId));
    expect(antigas).toEqual(before.initiativeOrder);
  });

  it('entra na posição correspondente ao próprio valor de iniciativa', () => {
    const after = summon(buildState()).state;
    const valores = after.initiativeOrder.map((e) => e.initiative);
    const ordenado = [...valores].sort((a, b) => b - a);
    expect(valores).toEqual(ordenado);

    // spd 500 contra 100 e 90: a invocada é a mais rápida da lista, logo entra na frente.
    expect(after.initiativeOrder[0]?.unitId).toBe(after.units[2]?.unitId);
  });
});

describe('summonReinforcement — recusas que NÃO cobram Valor (D2)', () => {
  it('tile ocupado por unidade viva', () => {
    const outcome = summon(buildState(), { x: 2, y: 0 });
    expect(outcome.applied).toBe(false);
    expect(outcome.state.valor).toBe(5);
    expect(outcome.state.units).toHaveLength(2);
  });

  it('tile fora do mapa', () => {
    const outcome = summon(buildState(), { x: 9, y: 9 });
    expect(outcome.applied).toBe(false);
    expect(outcome.state.valor).toBe(5);
  });

  it('terreno intransponível para o tipo de movimento do blueprint', () => {
    const outcome = summon(buildState(), { x: 3, y: 0 });
    expect(outcome.applied).toBe(false);
    expect(outcome.state.valor).toBe(5);
  });

  it('tile com muro', () => {
    const outcome = summon(buildState(), { x: 3, y: 1 });
    expect(outcome.applied).toBe(false);
    expect(outcome.state.valor).toBe(5);
  });

  it('blueprint que não está no catálogo', () => {
    const semCatalogo = buildState({ summonBlueprints: {} });
    const outcome = summon(semCatalogo);
    expect(outcome.applied).toBe(false);
    expect(outcome.state.valor).toBe(5);
    expect(outcome.state.units).toHaveLength(2);
  });

  it('Valor insuficiente', () => {
    const outcome = summon(buildState({ valor: 2 }));
    expect(outcome.applied).toBe(false);
    expect(outcome.state.valor).toBe(2);
  });
});

describe('critério de aceite 3 — nenhum kind de valor-skill rejeita por falta de implementação', () => {
  it('`summonReinforcement` não devolve mais "sem resolução"', () => {
    const outcome = summon(buildState());
    expect(outcome.reason ?? '').not.toMatch(/resolu[çc]/i);
    expect(outcome.applied).toBe(true);
  });
});

describe('determinismo', () => {
  it('duas invocações da mesma seed produzem o mesmo estado', () => {
    expect(hashState(summon(buildState()).state.units)).toBe(hashState(summon(buildState()).state.units));
  });

  it('a iniciativa da invocada é derivada da seed da batalha, não de contador global', () => {
    const a = summon(buildState()).state.initiativeOrder;
    const b = summon(buildState({ seed: 43 })).state.initiativeOrder;
    expect(a).not.toEqual(b);
  });
});
