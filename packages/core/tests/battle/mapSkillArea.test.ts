import { describe, expect, it } from 'vitest';
import { unitsInArea } from '../../src/battle/area.js';
import { applyCommand } from '../../src/battle/commands.js';
import { computeInitiativeOrder } from '../../src/battle/initiative.js';
import type { BattleState, BattleUnit } from '../../src/battle/types.js';
import { HEAL_TAG } from '../../src/duel/heal.js';
import type { EffectDef } from '../../src/duel/types.js';
import type { GridMap, Terrain } from '../../src/grid/types.js';
import type { SkillDef } from '../../src/skills/types.js';
import type { StatSheet } from '../../src/stats/types.js';

// §5.4 (M11, sub-sessão 2/N) — "Usa skill de mapa (cura em área, artilharia, buff de
// zona)". Até aqui `applyMapSkill` ignorava `cmd.target` por completo e aplicava efeito só
// em `target:'self'` ("alvo em área não suportado em M3"). Quem a área atinge é DERIVADO
// do que a skill faz (decisão do usuário, ver DECISIONS.md): tag `heal` → aliados; dano →
// inimigos; efeito → pelo `EffectDef.kind` (buff → aliados, debuff → inimigos).

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

const buffId = 'effect-inspiracao';
const debuffId = 'effect-lentidao';
const effectDefs: Readonly<Record<string, EffectDef>> = {
  [buffId]: { id: buffId, name: 'Inspiração', kind: 'buff', dispellable: true, maxStacks: 1, statMods: [{ stat: 'atk', pct: 100 }] },
  [debuffId]: { id: debuffId, name: 'Lentidão', kind: 'debuff', dispellable: true, maxStacks: 1, statMods: [{ stat: 'def', pct: -100 }] },
};

// §5.4 — os três exemplos da spec, um a um.
const artilharia: SkillDef = {
  id: 'skill-artilharia', name: 'Artilharia', kind: 'map', apCost: 1, cooldown: 0,
  multiplier: 1200, flat: 0, scalesWith: 'atk', duelRange: 4, areaRadius: 1,
  effects: [], tags: ['physical'],
};

const curaEmArea: SkillDef = {
  id: 'skill-cura-area', name: 'Cura em Área', kind: 'map', apCost: 1, cooldown: 0,
  multiplier: 1000, flat: 0, scalesWith: 'atk', duelRange: 4, areaRadius: 1,
  effects: [], tags: [HEAL_TAG],
};

const buffDeZona: SkillDef = {
  id: 'skill-buff-zona', name: 'Buff de Zona', kind: 'map', apCost: 1, cooldown: 0,
  multiplier: 0, flat: 0, scalesWith: 'atk', duelRange: 4, areaRadius: 1,
  effects: [{ effectId: buffId, target: 'target', chance: 1000, duration: 'battle' }],
  tags: ['buff'],
};

const debuffDeZona: SkillDef = {
  ...buffDeZona,
  id: 'skill-debuff-zona', name: 'Praga',
  effects: [{ effectId: debuffId, target: 'target', chance: 1000, duration: 'battle' }],
};

// Comportamento de M3, preservado: `target:'self'` continua sendo só o lançador.
const buffProprio: SkillDef = {
  ...buffDeZona,
  id: 'skill-buff-proprio', name: 'Foco',
  effects: [{ effectId: buffId, target: 'self', chance: 1000, duration: 'battle' }],
};

const allSkills: Readonly<Record<string, SkillDef>> = {
  [artilharia.id]: artilharia,
  [curaEmArea.id]: curaEmArea,
  [buffDeZona.id]: buffDeZona,
  [debuffDeZona.id]: debuffDeZona,
  [buffProprio.id]: buffProprio,
};

function buildUnit(overrides: Partial<BattleUnit> = {}): BattleUnit {
  return {
    unitId: 'u1', heroId: 'h1', side: 'player',
    pos: { x: 0, y: 0 }, height: 0,
    hp: 5000, ap: 3, pp: 2, hasActedThisRound: false,
    effects: [], cooldowns: {},
    stats: statSheet(), unitType: 'infantry', weaponType: 'sword', duelRange: 1, assistRange: 2,
    moveType: 'foot', moveRange: 4,
    tacticsScript: [], reactionScript: [], knownSkills: allSkills,
    ...overrides,
  };
}

function buildState(units: readonly BattleUnit[], overrides: Partial<BattleState> = {}): BattleState {
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
    effectDefs,
    outcome: 'ongoing',
    seed: 42,
    ...overrides,
  };
}

const hpOf = (state: BattleState, unitId: string): number | undefined => state.units.find((u) => u.unitId === unitId)?.hp;
const effectIdsOf = (state: BattleState, unitId: string): readonly string[] =>
  state.units.find((u) => u.unitId === unitId)?.effects.map((e) => e.id) ?? [];

// Lançador em (0,0); centro da área em (2,0), dentro do duelRange 4 da skill.
const caster = buildUnit({ unitId: 'lancador', side: 'player', pos: { x: 0, y: 0 } });
const center = { x: 2, y: 0 };

describe('unitsInArea — seleção por distância Manhattan (§5.1)', () => {
  it('inclui quem está exatamente no raio e exclui quem está um a mais', () => {
    const units = [
      buildUnit({ unitId: 'no-centro', pos: { x: 2, y: 0 } }),
      buildUnit({ unitId: 'na-borda', pos: { x: 3, y: 0 } }),
      buildUnit({ unitId: 'fora', pos: { x: 4, y: 0 } }),
    ];
    const ids = unitsInArea(buildState(units), center, 1).map((u) => u.unitId);
    expect(ids).toContain('no-centro');
    expect(ids).toContain('na-borda');
    expect(ids).not.toContain('fora');
  });

  it('raio 0 é só o tile alvo', () => {
    const units = [
      buildUnit({ unitId: 'no-centro', pos: { x: 2, y: 0 } }),
      buildUnit({ unitId: 'vizinho', pos: { x: 3, y: 0 } }),
    ];
    expect(unitsInArea(buildState(units), center, 0).map((u) => u.unitId)).toEqual(['no-centro']);
  });

  it('ignora unidades mortas', () => {
    const units = [buildUnit({ unitId: 'morto', pos: center, hp: 0 }), buildUnit({ unitId: 'vivo', pos: center })];
    expect(unitsInArea(buildState(units), center, 1).map((u) => u.unitId)).toEqual(['vivo']);
  });

  it('devolve na ordem FIXA de iniciativa, não na ordem do array de unidades', () => {
    const units = [
      buildUnit({ unitId: 'z-lento', pos: center, stats: statSheet({ spd: 50 }) }),
      buildUnit({ unitId: 'a-rapido', pos: center, stats: statSheet({ spd: 900 }) }),
    ];
    const state = buildState(units);
    const expected = state.initiativeOrder.map((e) => e.unitId);
    expect(unitsInArea(state, center, 1).map((u) => u.unitId)).toEqual(expected);
  });
});

describe('artilharia — dano em área atinge os INIMIGOS', () => {
  const inimigoA = buildUnit({ unitId: 'inimigo-a', side: 'enemy', pos: { x: 2, y: 0 } });
  const inimigoB = buildUnit({ unitId: 'inimigo-b', side: 'enemy', pos: { x: 2, y: 1 } });
  const inimigoLonge = buildUnit({ unitId: 'inimigo-longe', side: 'enemy', pos: { x: 5, y: 5 } });
  const aliadoNaArea = buildUnit({ unitId: 'aliado', side: 'player', pos: { x: 3, y: 0 } });

  const cast = (state: BattleState) =>
    applyCommand(state, { t: 'mapSkill', unitId: 'lancador', skillId: artilharia.id, target: center });

  it('atinge MAIS DE UMA unidade (critério de aceite de M11)', () => {
    const state = buildState([caster, inimigoA, inimigoB, inimigoLonge, aliadoNaArea]);
    const result = cast(state);
    expect(result.applied).toBe(true);
    expect(hpOf(result.state, 'inimigo-a')).toBeLessThan(5000);
    expect(hpOf(result.state, 'inimigo-b')).toBeLessThan(5000);
  });

  it('não toca em quem está fora do raio', () => {
    const result = cast(buildState([caster, inimigoA, inimigoB, inimigoLonge, aliadoNaArea]));
    expect(hpOf(result.state, 'inimigo-longe')).toBe(5000);
  });

  it('não fere aliados dentro da área nem o próprio lançador', () => {
    const result = cast(buildState([caster, inimigoA, inimigoB, inimigoLonge, aliadoNaArea]));
    expect(hpOf(result.state, 'aliado')).toBe(5000);
    expect(hpOf(result.state, 'lancador')).toBe(5000);
  });

  it('gasta o AP uma vez só, independente de quantos alvos, e consome o turno', () => {
    const result = cast(buildState([caster, inimigoA, inimigoB]));
    const lancador = result.state.units.find((u) => u.unitId === 'lancador');
    expect(lancador?.ap).toBe(caster.ap - artilharia.apCost);
    expect(lancador?.hasActedThisRound).toBe(true);
  });

  it('não mata ninguém abaixo de 0 HP', () => {
    const quaseMorto = buildUnit({ unitId: 'inimigo-a', side: 'enemy', pos: { x: 2, y: 0 }, hp: 10 });
    const result = cast(buildState([caster, quaseMorto]));
    expect(hpOf(result.state, 'inimigo-a')).toBe(0);
  });
});

describe('cura em área — atinge os ALIADOS', () => {
  const aliadoFerido = buildUnit({ unitId: 'aliado-ferido', side: 'player', pos: { x: 2, y: 0 }, hp: 1000 });
  const inimigoFerido = buildUnit({ unitId: 'inimigo-ferido', side: 'enemy', pos: { x: 2, y: 1 }, hp: 1000 });

  const cast = (state: BattleState) =>
    applyCommand(state, { t: 'mapSkill', unitId: 'lancador', skillId: curaEmArea.id, target: center });

  it('cura o aliado na área e não cura o inimigo', () => {
    const result = cast(buildState([caster, aliadoFerido, inimigoFerido]));
    expect(hpOf(result.state, 'aliado-ferido')).toBeGreaterThan(1000);
    expect(hpOf(result.state, 'inimigo-ferido')).toBe(1000);
  });

  it('uma skill de cura não causa dano nenhum', () => {
    const result = cast(buildState([caster, aliadoFerido, inimigoFerido]));
    expect(hpOf(result.state, 'inimigo-ferido')).toBe(1000);
  });

  it('não passa do HP máximo e não ressuscita (mesma regra de M10)', () => {
    const cheio = buildUnit({ unitId: 'cheio', side: 'player', pos: { x: 2, y: 0 } });
    const morto = buildUnit({ unitId: 'morto', side: 'player', pos: { x: 2, y: 1 }, hp: 0 });
    const result = cast(buildState([caster, cheio, morto]));
    expect(hpOf(result.state, 'cheio')).toBe(5000);
    expect(hpOf(result.state, 'morto')).toBe(0);
  });
});

describe('buff de zona — o `EffectDef.kind` decide o lado', () => {
  const aliado = buildUnit({ unitId: 'aliado', side: 'player', pos: { x: 2, y: 0 } });
  const inimigo = buildUnit({ unitId: 'inimigo', side: 'enemy', pos: { x: 2, y: 1 } });
  const foraDaArea = buildUnit({ unitId: 'fora', side: 'player', pos: { x: 5, y: 5 } });

  it('buff cai nos aliados da área, não nos inimigos', () => {
    const result = applyCommand(buildState([caster, aliado, inimigo, foraDaArea]), {
      t: 'mapSkill', unitId: 'lancador', skillId: buffDeZona.id, target: center,
    });
    expect(effectIdsOf(result.state, 'aliado')).toContain(buffId);
    expect(effectIdsOf(result.state, 'inimigo')).not.toContain(buffId);
    expect(effectIdsOf(result.state, 'fora')).toHaveLength(0);
  });

  it('debuff cai nos inimigos da área, não nos aliados', () => {
    const result = applyCommand(buildState([caster, aliado, inimigo]), {
      t: 'mapSkill', unitId: 'lancador', skillId: debuffDeZona.id, target: center,
    });
    expect(effectIdsOf(result.state, 'inimigo')).toContain(debuffId);
    expect(effectIdsOf(result.state, 'aliado')).not.toContain(debuffId);
  });

  it('`target:self` continua sendo só o lançador (comportamento de M3)', () => {
    const result = applyCommand(buildState([caster, aliado, inimigo]), {
      t: 'mapSkill', unitId: 'lancador', skillId: buffProprio.id, target: center,
    });
    expect(effectIdsOf(result.state, 'lancador')).toContain(buffId);
    expect(effectIdsOf(result.state, 'aliado')).not.toContain(buffId);
  });
});

describe('alcance de lançamento — `duelRange` da skill (§5.4)', () => {
  it('rejeita alvo além do alcance da skill', () => {
    const result = applyCommand(buildState([caster]), {
      t: 'mapSkill', unitId: 'lancador', skillId: artilharia.id, target: { x: 5, y: 5 },
    });
    expect(result.applied).toBe(false);
    expect(result.reason).toContain('alcance');
  });

  it('aceita alvo exatamente no alcance', () => {
    const result = applyCommand(buildState([caster]), {
      t: 'mapSkill', unitId: 'lancador', skillId: artilharia.id, target: { x: 4, y: 0 },
    });
    expect(result.applied).toBe(true);
  });

  it('skill sem `duelRange` herda o alcance da unidade', () => {
    const semAlcance: SkillDef = { ...artilharia, id: 'skill-sem-alcance', duelRange: undefined };
    const unidade = { ...caster, duelRange: 1, knownSkills: { [semAlcance.id]: semAlcance } };
    const perto = applyCommand(buildState([unidade]), {
      t: 'mapSkill', unitId: 'lancador', skillId: semAlcance.id, target: { x: 1, y: 0 },
    });
    const longe = applyCommand(buildState([unidade]), {
      t: 'mapSkill', unitId: 'lancador', skillId: semAlcance.id, target: { x: 3, y: 0 },
    });
    expect(perto.applied).toBe(true);
    expect(longe.applied).toBe(false);
  });

  it('AP insuficiente continua rejeitando antes de qualquer efeito', () => {
    const semAp = { ...caster, ap: 0 };
    const inimigo = buildUnit({ unitId: 'inimigo', side: 'enemy', pos: center });
    const result = applyCommand(buildState([semAp, inimigo]), {
      t: 'mapSkill', unitId: 'lancador', skillId: artilharia.id, target: center,
    });
    expect(result.applied).toBe(false);
    expect(hpOf(result.state, 'inimigo')).toBe(5000);
  });
});

describe('determinismo', () => {
  it('a mesma conjuração com a mesma seed dá exatamente o mesmo estado', () => {
    const units = [
      caster,
      buildUnit({ unitId: 'inimigo-a', side: 'enemy', pos: { x: 2, y: 0 } }),
      buildUnit({ unitId: 'inimigo-b', side: 'enemy', pos: { x: 2, y: 1 } }),
    ];
    const cast = (): BattleState =>
      applyCommand(buildState(units), { t: 'mapSkill', unitId: 'lancador', skillId: artilharia.id, target: center }).state;
    expect(JSON.stringify(cast())).toBe(JSON.stringify(cast()));
  });

  it('alvos diferentes recebem rolagens de variância independentes', () => {
    // Dois inimigos idênticos na mesma área: se compartilhassem o stream, levariam
    // exatamente o mesmo dano sempre — o que denunciaria reuso de rolagem.
    const units = [
      caster,
      buildUnit({ unitId: 'inimigo-a', side: 'enemy', pos: { x: 2, y: 0 } }),
      buildUnit({ unitId: 'inimigo-b', side: 'enemy', pos: { x: 2, y: 1 } }),
    ];
    const result = applyCommand(buildState(units), {
      t: 'mapSkill', unitId: 'lancador', skillId: artilharia.id, target: center,
    });
    expect(hpOf(result.state, 'inimigo-a')).not.toBe(hpOf(result.state, 'inimigo-b'));
  });
});
