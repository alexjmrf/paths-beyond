import { describe, expect, it } from 'vitest';
import {
  applyActiveEffectsToStats,
  computeEffectApplicationChance,
  sumDamageDealtPct,
  sumDamageTakenReductionPct,
} from '../../src/duel/effects.js';
import type { ActiveEffect, EffectDef } from '../../src/duel/types.js';
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
