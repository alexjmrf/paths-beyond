import { describe, expect, it } from 'vitest';
import { aggregateStatSheet, type AggregateStatsInput } from '../../src/stats/aggregate.js';
import type { StatSheet } from '../../src/stats/types.js';

// "Herói fixo" — snapshot de referência do M1 (§4.1). Números escolhidos à mão para que
// cada um dos 7 passos da fórmula produza um resultado verificável independentemente.
const fixedHeroInput: AggregateStatsInput = {
  baseCurve: { hp: 5000, atk: 800, def: 500, spd: 100 },
  awakeningMultiplier: 1100, // awakening 3: +10%
  classAndImprintFlat: [
    { stat: 'hp', flat: 200 },
    { stat: 'atk', flat: 50 },
    { stat: 'chc', flat: 50 },
  ],
  equipmentFlat: [
    { stat: 'atk', flat: 300 },
    { stat: 'hp', flat: 800 },
    { stat: 'chc', flat: 100 },
    { stat: 'chd', flat: 200 },
  ],
  equipmentPct: [
    { stat: 'atk', pct: 150 },
    { stat: 'atk', pct: 100 },
    { stat: 'hp', pct: 100 },
  ],
  talentFlat: [
    { stat: 'def', flat: 80 },
    { stat: 'spd', flat: 20 },
  ],
  talentPct: [{ stat: 'def', pct: 50 }],
  setBonus: [
    { stat: 'atk', pct: 350 }, // set Ataque 4pc: +35% atk
    { stat: 'hp', flat: 100 },
  ],
};

const expectedSheet: StatSheet = {
  hp: 7250,
  atk: 2074,
  def: 661,
  spd: 130,
  chc: 150,
  chd: 200,
  eff: 0,
  efr: 0,
  pen: 0,
  heal: 0,
  lifesteal: 0,
  focus: 0,
  vigor: 0,
};

describe('aggregateStatSheet — stat sheet de um herói fixo (§4.1)', () => {
  it('bate exatamente com o snapshot esperado, passo a passo', () => {
    expect(aggregateStatSheet(fixedHeroInput)).toEqual(expectedSheet);
  });

  it('é determinística: mesma entrada produz o mesmo hash duas vezes', () => {
    const a = JSON.stringify(aggregateStatSheet(fixedHeroInput));
    const b = JSON.stringify(aggregateStatSheet(fixedHeroInput));
    expect(a).toBe(b);
  });

  it('é pura: não muta o input recebido', () => {
    const frozenInput = structuredClone(fixedHeroInput);
    aggregateStatSheet(fixedHeroInput);
    expect(fixedHeroInput).toEqual(frozenInput);
  });

  it('zera stats sem nenhuma fonte declarada em vez de deixar undefined', () => {
    const result = aggregateStatSheet({
      baseCurve: {},
      awakeningMultiplier: 1000,
      classAndImprintFlat: [],
      equipmentFlat: [],
      equipmentPct: [],
      talentFlat: [],
      talentPct: [],
      setBonus: [],
    });
    for (const value of Object.values(result)) {
      expect(value).toBe(0);
    }
  });

  it('soma múltiplos modificadores % do mesmo passo antes de multiplicar (não compõe multiplicativamente)', () => {
    // Duas peças de equipamento dando +15% atk e +10% atk cada devem virar uma
    // multiplicação única por 1.25, não duas multiplicações sucessivas (1.15 * 1.10).
    const result = aggregateStatSheet({
      baseCurve: { atk: 1000 },
      awakeningMultiplier: 1000,
      classAndImprintFlat: [],
      equipmentFlat: [],
      equipmentPct: [
        { stat: 'atk', pct: 150 },
        { stat: 'atk', pct: 100 },
      ],
      talentFlat: [],
      talentPct: [],
      setBonus: [],
    });
    // 1000 + fpMul(1000, 250) = 1000 + 250 = 1250 (não 1000 * 1.15 * 1.10 = 1265)
    expect(result.atk).toBe(1250);
  });
});
