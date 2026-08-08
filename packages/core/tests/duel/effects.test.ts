import { describe, expect, it } from 'vitest';
import {
  applyActiveEffectsToStats,
  computeEffectApplicationChance,
  computePeriodicEffects,
  sumDamageDealtPct,
  sumDamageTakenReductionPct,
  upsertActiveEffect,
} from '../../src/duel/effects.js';
import type { ActiveEffect, EffectDef } from '../../src/duel/types.js';
import type { EffectApplication } from '../../src/skills/types.js';
import type { StatSheet } from '../../src/stats/types.js';

function emptySheet(overrides: Partial<StatSheet> = {}): StatSheet {
  return {
    hp: 0,
    atk: 0,
    def: 0,
    spd: 0,
    chc: 0,
    chd: 0,
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

const atkBuffDef: EffectDef = {
  id: 'effect-atk-buff',
  name: 'Fúria',
  kind: 'buff',
  dispellable: true,
  maxStacks: 3,
  statMods: [{ stat: 'atk', flat: 50 }],
  damageDealtPct: 100,
};

const defenseDownDef: EffectDef = {
  id: 'effect-defense-down',
  name: 'Armadura Quebrada',
  kind: 'debuff',
  dispellable: true,
  maxStacks: 1,
  statMods: [{ stat: 'def', pct: -200 }],
  damageTakenReductionPct: -150, // reduz a "redução", isto é, o alvo recebe MAIS dano
};

describe('computeEffectApplicationChance — §6.9', () => {
  it('base sem eff/efr passa direto', () => {
    expect(computeEffectApplicationChance({ baseChance: 500, attackerEff: 0, defenderEfr: 0 })).toBe(500);
  });

  it('eff do atacante aumenta a chance', () => {
    // fpMul(500, 1200) = 600
    expect(computeEffectApplicationChance({ baseChance: 500, attackerEff: 200, defenderEfr: 0 })).toBe(600);
  });

  it('efr do defensor reduz a chance', () => {
    // fpMul(500, 700) = 350
    expect(computeEffectApplicationChance({ baseChance: 500, attackerEff: 0, defenderEfr: 300 })).toBe(350);
  });

  it('nunca ultrapassa 1000 nem fica abaixo de 0', () => {
    expect(computeEffectApplicationChance({ baseChance: 1200, attackerEff: 0, defenderEfr: 0 })).toBe(1000);
    expect(computeEffectApplicationChance({ baseChance: 500, attackerEff: 0, defenderEfr: 2000 })).toBe(0);
  });
});

describe('applyActiveEffectsToStats — §4.1 passo 8 (buffs ativos, só dentro do duelo)', () => {
  it('aplica statMods flat e pct dos efeitos ativos sobre o stat sheet estático', () => {
    const base = emptySheet({ atk: 1000, def: 1000 });
    const active: ActiveEffect[] = [
      { id: 'effect-atk-buff', duration: 'duel', stacks: 1, maxStacks: 3, dispellable: true },
    ];
    const result = applyActiveEffectsToStats(base, active, { [atkBuffDef.id]: atkBuffDef });
    expect(result.atk).toBe(1050);
    expect(result.def).toBe(1000);
  });

  it('stacks multiplicam o efeito do modificador (2 stacks de +50 flat = +100)', () => {
    const base = emptySheet({ atk: 1000 });
    const active: ActiveEffect[] = [
      { id: 'effect-atk-buff', duration: 'duel', stacks: 2, maxStacks: 3, dispellable: true },
    ];
    const result = applyActiveEffectsToStats(base, active, { [atkBuffDef.id]: atkBuffDef });
    expect(result.atk).toBe(1100);
  });

  it('modificadores percentuais somam antes de multiplicar (mesmo padrão de stats/aggregate.ts)', () => {
    const base = emptySheet({ def: 1000 });
    const active: ActiveEffect[] = [
      { id: 'effect-defense-down', duration: 'duel', stacks: 1, maxStacks: 1, dispellable: true },
    ];
    const result = applyActiveEffectsToStats(base, active, { [defenseDownDef.id]: defenseDownDef });
    // fpMul(1000, -200) = -200 -> 1000 - 200 = 800
    expect(result.def).toBe(800);
  });

  it('não muta o stat sheet recebido', () => {
    const base = emptySheet({ atk: 1000 });
    const before = { ...base };
    applyActiveEffectsToStats(base, [], {});
    expect(base).toEqual(before);
  });
});

describe('sumDamageDealtPct / sumDamageTakenReductionPct — §6.6 passo 8', () => {
  it('soma damageDealtPct de todos os efeitos ativos, escalado por stacks', () => {
    const active: ActiveEffect[] = [
      { id: 'effect-atk-buff', duration: 'duel', stacks: 2, maxStacks: 3, dispellable: true },
    ];
    expect(sumDamageDealtPct(active, { [atkBuffDef.id]: atkBuffDef })).toBe(200);
  });

  it('efeitos sem damageDealtPct não contribuem', () => {
    const active: ActiveEffect[] = [
      { id: 'effect-defense-down', duration: 'duel', stacks: 1, maxStacks: 1, dispellable: true },
    ];
    expect(sumDamageDealtPct(active, { [defenseDownDef.id]: defenseDownDef })).toBe(0);
  });

  it('soma damageTakenReductionPct de todos os efeitos ativos, escalado por stacks', () => {
    const active: ActiveEffect[] = [
      { id: 'effect-defense-down', duration: 'duel', stacks: 1, maxStacks: 1, dispellable: true },
    ];
    expect(sumDamageTakenReductionPct(active, { [defenseDownDef.id]: defenseDownDef })).toBe(-150);
  });
});

const poisonDef: EffectDef = {
  id: 'effect-veneno',
  name: 'Veneno',
  kind: 'debuff',
  dispellable: true,
  maxStacks: 3,
  statMods: [],
  periodicDamagePct: 30,
};

const regenDef: EffectDef = {
  id: 'effect-regeneracao',
  name: 'Regeneração',
  kind: 'buff',
  dispellable: true,
  maxStacks: 2,
  statMods: [],
  periodicHealPct: 50,
};

describe('computePeriodicEffects — §6.9 (DoT/regeneração, % do HP máximo, fp-scale)', () => {
  it('calcula dano periódico como % do HP máximo (fpPct(5000, 30) = 150)', () => {
    const active: ActiveEffect[] = [{ id: poisonDef.id, duration: 3, stacks: 1, maxStacks: 3, dispellable: true }];
    const result = computePeriodicEffects(active, { [poisonDef.id]: poisonDef }, 5000);
    expect(result).toEqual({ damage: 150, heal: 0 });
  });

  it('calcula cura periódica como % do HP máximo', () => {
    const active: ActiveEffect[] = [{ id: regenDef.id, duration: 3, stacks: 1, maxStacks: 2, dispellable: true }];
    const result = computePeriodicEffects(active, { [regenDef.id]: regenDef }, 5000);
    expect(result).toEqual({ damage: 0, heal: 250 });
  });

  it('escala por stacks via soma repetida (2 stacks de 150 = 300)', () => {
    const active: ActiveEffect[] = [{ id: poisonDef.id, duration: 3, stacks: 2, maxStacks: 3, dispellable: true }];
    const result = computePeriodicEffects(active, { [poisonDef.id]: poisonDef }, 5000);
    expect(result.damage).toBe(300);
  });

  it('efeitos sem periodicDamagePct/periodicHealPct não contribuem', () => {
    const active: ActiveEffect[] = [{ id: atkBuffDef.id, duration: 'duel', stacks: 1, maxStacks: 3, dispellable: true }];
    const result = computePeriodicEffects(active, { [atkBuffDef.id]: atkBuffDef }, 5000);
    expect(result).toEqual({ damage: 0, heal: 0 });
  });

  it('ignora efeitos cujo id não está no catálogo de defs, sem lançar', () => {
    const active: ActiveEffect[] = [{ id: 'effect-fantasma', duration: 3, stacks: 1, maxStacks: 1, dispellable: true }];
    expect(() => computePeriodicEffects(active, {}, 5000)).not.toThrow();
    expect(computePeriodicEffects(active, {}, 5000)).toEqual({ damage: 0, heal: 0 });
  });

  it('soma dano e cura de vários efeitos ativos simultaneamente', () => {
    const active: ActiveEffect[] = [
      { id: poisonDef.id, duration: 3, stacks: 1, maxStacks: 3, dispellable: true },
      { id: regenDef.id, duration: 3, stacks: 1, maxStacks: 2, dispellable: true },
    ];
    const defs = { [poisonDef.id]: poisonDef, [regenDef.id]: regenDef };
    const result = computePeriodicEffects(active, defs, 5000);
    expect(result).toEqual({ damage: 150, heal: 250 });
  });
});

describe('upsertActiveEffect — §6.9/§8.3 (M10: skill.effects criando/empilhando ActiveEffect)', () => {
  const application: EffectApplication = {
    effectId: atkBuffDef.id,
    target: 'target',
    chance: 1000,
    duration: 'battle',
  };

  it('cria um ActiveEffect novo quando o efeito ainda não está ativo', () => {
    const result = upsertActiveEffect([], atkBuffDef, application);
    expect(result).toEqual([
      { id: atkBuffDef.id, duration: 'battle', stacks: 1, maxStacks: atkBuffDef.maxStacks, dispellable: true },
    ]);
  });

  it('respeita application.stacks ao criar (em vez de sempre 1)', () => {
    const result = upsertActiveEffect([], atkBuffDef, { ...application, stacks: 2 });
    expect(result[0]?.stacks).toBe(2);
  });

  it('incrementa stacks de um efeito já ativo, sem duplicar a entrada', () => {
    const existing: ActiveEffect[] = [
      { id: atkBuffDef.id, duration: 'duel', stacks: 1, maxStacks: 3, dispellable: true },
    ];
    const result = upsertActiveEffect(existing, atkBuffDef, application);
    expect(result).toHaveLength(1);
    expect(result[0]?.stacks).toBe(2);
  });

  it('nunca excede maxStacks do EffectDef', () => {
    const existing: ActiveEffect[] = [
      { id: atkBuffDef.id, duration: 'duel', stacks: 3, maxStacks: 3, dispellable: true },
    ];
    const result = upsertActiveEffect(existing, atkBuffDef, application);
    expect(result[0]?.stacks).toBe(3);
  });

  it('reaplicar atualiza (refresca) a duration para a da nova aplicação', () => {
    const existing: ActiveEffect[] = [
      { id: atkBuffDef.id, duration: 2, stacks: 1, maxStacks: 3, dispellable: true },
    ];
    const result = upsertActiveEffect(existing, atkBuffDef, { ...application, duration: 'battle' });
    expect(result[0]?.duration).toBe('battle');
  });

  it('não muta o array recebido', () => {
    const existing: ActiveEffect[] = [
      { id: atkBuffDef.id, duration: 'duel', stacks: 1, maxStacks: 3, dispellable: true },
    ];
    const before = existing.map((e) => ({ ...e }));
    upsertActiveEffect(existing, atkBuffDef, application);
    expect(existing).toEqual(before);
  });

  it('outros efeitos ativos na lista permanecem intocados', () => {
    const existing: ActiveEffect[] = [
      { id: defenseDownDef.id, duration: 'duel', stacks: 1, maxStacks: 1, dispellable: true },
    ];
    const result = upsertActiveEffect(existing, atkBuffDef, application);
    expect(result).toHaveLength(2);
    expect(result.find((e) => e.id === defenseDownDef.id)).toEqual(existing[0]);
  });
});
