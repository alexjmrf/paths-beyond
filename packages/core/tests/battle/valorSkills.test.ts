import { describe, expect, it } from 'vitest';
import { applyCommand } from '../../src/battle/commands.js';
import { computeInitiativeOrder } from '../../src/battle/initiative.js';
import { endRound } from '../../src/battle/round.js';
import type { BattleState, BattleUnit } from '../../src/battle/types.js';
import type { ValorSkillDef } from '../../src/battle/valor.js';
import type { EffectDef } from '../../src/duel/types.js';
import type { GridMap, Terrain } from '../../src/grid/types.js';
import type { StatSheet } from '../../src/stats/types.js';

// §5.6 (M11, sub-sessão 3/N) — "Recurso de exército [...] Gasto em: restaurar AP/PP de uma
// unidade, invocar reforço, artilharia de mapa, buff global de 1 round. Definidos em
// data/valor-skills/*.json." Até aqui `applyUseValor` IGNORAVA o `skillId` e debitava um
// custo fixo de 1, sem aplicar efeito nenhum. `summonReinforcement` continua sem resolução
// por decisão do usuário — fatia própria (ver DECISIONS.md).

const plain: Terrain = { id: 'plain', moveCost: { foot: 1, cavalry: 1, flying: 1, heavy: 1, aquatic: 2 }, defBonus: 0, evaBonus: 0, blocksSight: false };

function buildMap(): GridMap {
  const tiles = Array.from({ length: 6 }, () => Array.from({ length: 6 }, () => ({ terrain: 'plain', height: 0 as const })));
  return { width: 6, height: 6, tiles, terrains: { plain }, zocEnabled: false };
}

function statSheet(overrides: Partial<StatSheet> = {}): StatSheet {
  return {
    hp: 5000, atk: 1000, def: 300, spd: 100, chc: 0, chd: 1500,
    eff: 0, efr: 0, pen: 0, heal: 0, lifesteal: 0, focus: 0, vigor: 0,
    ...overrides,
  };
}

const buffId = 'effect-brado';
const effectDefs: Readonly<Record<string, EffectDef>> = {
  [buffId]: { id: buffId, name: 'Brado de Guerra', kind: 'buff', dispellable: true, maxStacks: 1, statMods: [{ stat: 'atk', pct: 150 }] },
};

const restaurar: ValorSkillDef = {
  id: 'valor-restaurar', name: 'Restaurar Recursos', cost: 2, kind: 'restoreApPp',
  payload: { ap: 2, pp: 1 },
};

const artilharia: ValorSkillDef = {
  id: 'valor-artilharia', name: 'Bombardeio', cost: 3, kind: 'artillery',
  payload: { damage: 2000, radius: 1 },
};

const brado: ValorSkillDef = {
  id: 'valor-brado', name: 'Brado de Guerra', cost: 4, kind: 'globalBuff',
  payload: { effectId: buffId },
};

const reforco: ValorSkillDef = {
  id: 'valor-reforco', name: 'Reforço', cost: 5, kind: 'summonReinforcement', payload: {},
};

const valorSkills: Readonly<Record<string, ValorSkillDef>> = {
  [restaurar.id]: restaurar,
  [artilharia.id]: artilharia,
  [brado.id]: brado,
  [reforco.id]: reforco,
};

function buildUnit(overrides: Partial<BattleUnit> = {}): BattleUnit {
  return {
    unitId: 'u1', heroId: 'h1', side: 'player',
    pos: { x: 0, y: 0 }, height: 0,
    hp: 5000, ap: 3, pp: 2, hasActedThisRound: false,
    effects: [], cooldowns: {},
    stats: statSheet(), unitType: 'infantry', weaponType: 'sword', duelRange: 1, assistRange: 2,
    moveType: 'foot', moveRange: 4,
    tacticsScript: [], reactionScript: [], knownSkills: {},
    ...overrides,
  };
}

function buildState(units: readonly BattleUnit[], overrides: Partial<BattleState> = {}): BattleState {
  return {
    map: buildMap(),
    units,
    initiativeOrder: computeInitiativeOrder(units.map((u) => ({ id: u.unitId, spd: u.stats.spd })), 42),
    round: 1,
    valor: 10,
    distanceMovedThisTurn: {},
    freeAssistUsedThisRound: [],
    permadeath: 'classic',
    winCondition: { t: 'rout' },
    effectDefs,
    valorSkills,
    outcome: 'ongoing',
    seed: 42,
    ...overrides,
  };
}

const unitOf = (state: BattleState, unitId: string): BattleUnit | undefined => state.units.find((u) => u.unitId === unitId);
const target = { x: 2, y: 0 };

describe('restoreApPp — "restaurar AP/PP de uma unidade" (§5.6)', () => {
  const alvo = buildUnit({ unitId: 'alvo', pos: target, ap: 1, pp: 0 });
  const outro = buildUnit({ unitId: 'outro', pos: { x: 5, y: 5 }, ap: 1, pp: 0 });

  const cast = (state: BattleState) => applyCommand(state, { t: 'useValor', skillId: restaurar.id, target });

  it('devolve AP e PP para a unidade sobre o tile alvo', () => {
    const result = cast(buildState([alvo, outro]));
    expect(result.applied).toBe(true);
    expect(unitOf(result.state, 'alvo')?.ap).toBe(3);
    expect(unitOf(result.state, 'alvo')?.pp).toBe(1);
  });

  it('não toca em nenhuma outra unidade', () => {
    const result = cast(buildState([alvo, outro]));
    expect(unitOf(result.state, 'outro')?.ap).toBe(1);
    expect(unitOf(result.state, 'outro')?.pp).toBe(0);
  });

  it('debita o `cost` declarado na skill, não o custo fixo de 1 do placeholder de M3', () => {
    const result = cast(buildState([alvo], { valor: 10 }));
    expect(result.state.valor).toBe(10 - restaurar.cost);
  });

  it('NÃO consome o turno de ninguém — Valor é recurso de exército (§5.6)', () => {
    const result = cast(buildState([alvo]));
    expect(unitOf(result.state, 'alvo')?.hasActedThisRound).toBe(false);
  });

  it('rejeita sem unidade aliada viva no tile, sem gastar Valor', () => {
    const morto = buildUnit({ unitId: 'morto', pos: target, hp: 0 });
    const result = cast(buildState([morto], { valor: 10 }));
    expect(result.applied).toBe(false);
    expect(result.state.valor).toBe(10);
  });

  it('rejeita mirar uma unidade INIMIGA — o Valor é do exército do jogador', () => {
    const inimigo = buildUnit({ unitId: 'inimigo', side: 'enemy', pos: target, ap: 1 });
    const result = cast(buildState([inimigo, outro]));
    expect(result.applied).toBe(false);
    expect(unitOf(result.state, 'inimigo')?.ap).toBe(1);
  });
});

describe('artillery — "artilharia de mapa" (§5.6)', () => {
  const inimigoA = buildUnit({ unitId: 'inimigo-a', side: 'enemy', pos: target });
  const inimigoB = buildUnit({ unitId: 'inimigo-b', side: 'enemy', pos: { x: 2, y: 1 } });
  const aliado = buildUnit({ unitId: 'aliado', pos: { x: 3, y: 0 } });
  const longe = buildUnit({ unitId: 'longe', side: 'enemy', pos: { x: 5, y: 5 } });

  const cast = (state: BattleState) => applyCommand(state, { t: 'useValor', skillId: artilharia.id, target });

  it('fere todos os inimigos no raio e nenhum aliado', () => {
    const result = cast(buildState([inimigoA, inimigoB, aliado, longe]));
    expect(result.applied).toBe(true);
    expect(unitOf(result.state, 'inimigo-a')!.hp).toBeLessThan(5000);
    expect(unitOf(result.state, 'inimigo-b')!.hp).toBeLessThan(5000);
    expect(unitOf(result.state, 'aliado')!.hp).toBe(5000);
    expect(unitOf(result.state, 'longe')!.hp).toBe(5000);
  });

  it('o dano é mitigado por `def` (§6.6 passos 2-4), não é dano cru', () => {
    const frageis = buildUnit({ unitId: 'fragil', side: 'enemy', pos: target, stats: statSheet({ def: 100 }) });
    const duro = buildUnit({ unitId: 'duro', side: 'enemy', pos: { x: 2, y: 1 }, stats: statSheet({ def: 3000 }) });
    const result = cast(buildState([frageis, duro]));
    const danoFragil = 5000 - unitOf(result.state, 'fragil')!.hp;
    const danoDuro = 5000 - unitOf(result.state, 'duro')!.hp;
    expect(danoDuro).toBeLessThan(danoFragil);
    // E nenhum dos dois é o número cru do payload.
    expect(danoFragil).toBeLessThan(artilharia.payload.damage);
  });

  it('não leva ninguém abaixo de 0 HP', () => {
    const quaseMorto = buildUnit({ unitId: 'inimigo-a', side: 'enemy', pos: target, hp: 5 });
    const result = cast(buildState([quaseMorto]));
    expect(unitOf(result.state, 'inimigo-a')!.hp).toBe(0);
  });

  it('em tile vazio o comando vale e o Valor é gasto — o jogador escolheu o tile', () => {
    const result = cast(buildState([aliado], { valor: 10 }));
    expect(result.applied).toBe(true);
    expect(result.state.valor).toBe(10 - artilharia.cost);
  });
});

describe('globalBuff — "buff global de 1 round" (§5.6)', () => {
  const cast = (state: BattleState) => applyCommand(state, { t: 'useValor', skillId: brado.id, target: { x: 0, y: 0 } });

  it('aplica o efeito em TODA unidade viva do jogador, onde quer que esteja', () => {
    const a = buildUnit({ unitId: 'a', pos: { x: 0, y: 0 } });
    const b = buildUnit({ unitId: 'b', pos: { x: 5, y: 5 } });
    const result = cast(buildState([a, b]));
    expect(unitOf(result.state, 'a')!.effects.map((e) => e.id)).toContain(buffId);
    expect(unitOf(result.state, 'b')!.effects.map((e) => e.id)).toContain(buffId);
  });

  it('não buffa inimigos nem unidades mortas', () => {
    const inimigo = buildUnit({ unitId: 'inimigo', side: 'enemy' });
    const morto = buildUnit({ unitId: 'morto', hp: 0 });
    const vivo = buildUnit({ unitId: 'vivo' });
    const result = cast(buildState([inimigo, morto, vivo]));
    expect(unitOf(result.state, 'inimigo')!.effects).toHaveLength(0);
    expect(unitOf(result.state, 'morto')!.effects).toHaveLength(0);
    expect(unitOf(result.state, 'vivo')!.effects).toHaveLength(1);
  });

  it('dura exatamente 1 round — some no `endRound` seguinte', () => {
    const vivo = buildUnit({ unitId: 'vivo', hasActedThisRound: true });
    const result = cast(buildState([vivo]));
    expect(unitOf(result.state, 'vivo')!.effects[0]?.duration).toBe(1);
    const depois = endRound(result.state);
    expect(unitOf(depois, 'vivo')!.effects).toHaveLength(0);
  });
});

describe('summonReinforcement — sem resolução, e falhando alto', () => {
  it('rejeita explicitamente em vez de gastar Valor em silêncio', () => {
    const result = applyCommand(buildState([buildUnit()], { valor: 10 }), {
      t: 'useValor', skillId: reforco.id, target,
    });
    expect(result.applied).toBe(false);
    expect(result.reason).toContain('summonReinforcement');
    expect(result.state.valor).toBe(10);
  });
});

describe('validação do comando', () => {
  it('rejeita skillId que não está no catálogo', () => {
    const result = applyCommand(buildState([buildUnit()], { valor: 10 }), {
      t: 'useValor', skillId: 'valor-inexistente', target,
    });
    expect(result.applied).toBe(false);
    expect(result.state.valor).toBe(10);
  });

  it('rejeita quando o saldo não cobre o `cost`, antes de qualquer efeito', () => {
    const inimigo = buildUnit({ unitId: 'inimigo', side: 'enemy', pos: target });
    const result = applyCommand(buildState([inimigo], { valor: artilharia.cost - 1 }), {
      t: 'useValor', skillId: artilharia.id, target,
    });
    expect(result.applied).toBe(false);
    expect(unitOf(result.state, 'inimigo')!.hp).toBe(5000);
  });

  it('batalha sem catálogo de valor-skills rejeita qualquer useValor', () => {
    const state = { ...buildState([buildUnit()]), valorSkills: undefined };
    const result = applyCommand(state, { t: 'useValor', skillId: restaurar.id, target });
    expect(result.applied).toBe(false);
  });
});

describe('determinismo', () => {
  it('a mesma artilharia com a mesma seed dá exatamente o mesmo estado', () => {
    const units = [
      buildUnit({ unitId: 'inimigo-a', side: 'enemy', pos: target }),
      buildUnit({ unitId: 'inimigo-b', side: 'enemy', pos: { x: 2, y: 1 } }),
    ];
    const cast = (): BattleState =>
      applyCommand(buildState(units), { t: 'useValor', skillId: artilharia.id, target }).state;
    expect(JSON.stringify(cast())).toBe(JSON.stringify(cast()));
  });

  it('alvos diferentes recebem rolagens de variância independentes', () => {
    const units = [
      buildUnit({ unitId: 'inimigo-a', side: 'enemy', pos: target }),
      buildUnit({ unitId: 'inimigo-b', side: 'enemy', pos: { x: 2, y: 1 } }),
    ];
    const result = applyCommand(buildState(units), { t: 'useValor', skillId: artilharia.id, target });
    expect(unitOf(result.state, 'inimigo-a')!.hp).not.toBe(unitOf(result.state, 'inimigo-b')!.hp);
  });
});
