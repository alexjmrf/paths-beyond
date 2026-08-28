import { describe, expect, it } from 'vitest';
import { hashState } from '../../src/determinism/hash.js';
import { rollDungeonRun } from '../../src/economy/drops.js';
import type { DungeonDef } from '../../src/economy/types.js';
import type { MainstatWeightEntry, SubstatWeightEntry } from '../../src/items/types.js';

// M14, sub-sessão 1/N — §10: "Masmorras de farm com foco definido: Equipamento (drop por
// set), Experiência, Ouro, Chefe (materiais de promoção)."
//
// A run é uma função pura de (masmorra, seed, id da run): mesma entrada, mesmo drop.
// Nenhum número de drop mora aqui — tudo vem da `DungeonDef`, que é dado.

const substatWeights: readonly SubstatWeightEntry[] = [
  { stat: 'atk', weight: 10, valueRange: { min: 10, max: 20 }, reforgeBonusPct: 100 },
  { stat: 'def', weight: 10, valueRange: { min: 8, max: 16 }, reforgeBonusPct: 100 },
  { stat: 'spd', weight: 5, valueRange: { min: 1, max: 4 }, reforgeBonusPct: 100 },
  { stat: 'chc', weight: 5, valueRange: { min: 10, max: 40 }, reforgeBonusPct: 100 },
];

const mainstatWeights: readonly MainstatWeightEntry[] = [
  { slot: 'weapon', stat: 'atk', weight: 1, valueRange: { min: 50, max: 90 } },
  { slot: 'boots', stat: 'spd', weight: 1, valueRange: { min: 4, max: 9 } },
  { slot: 'necklace', stat: 'chc', weight: 1, valueRange: { min: 40, max: 90 } },
];

const masmorraDeEquipamento: DungeonDef = {
  id: 'dungeon-teste-gear',
  name: 'Masmorra de teste — equipamento',
  focus: 'gear',
  difficulty: 'normal',
  encounterId: 'encounter-teste-gear',
  energyCost: 3,
  gold: { min: 10, max: 20 },
  gearDropCount: 2,
  gearDrops: [
    { weight: 3, setId: 'set-teste-a', slot: 'weapon', rarity: 'rare', ilvl: 70 },
    { weight: 1, setId: 'set-teste-b', slot: 'boots', rarity: 'epic', ilvl: 80 },
  ],
};

const masmorraDeChefe: DungeonDef = {
  id: 'dungeon-teste-chefe',
  name: 'Masmorra de teste — chefe',
  focus: 'boss',
  difficulty: 'elite',
  encounterId: 'encounter-teste-chefe',
  energyCost: 6,
  gold: { min: 40, max: 60 },
  materialDropCount: 2,
  materialDrops: [
    { weight: 2, materialId: 'material-teste-nucleo', amount: { min: 1, max: 3 } },
    { weight: 1, materialId: 'material-teste-fragmento', amount: { min: 1, max: 1 } },
  ],
};

const contexto = { substatWeights, mainstatWeights };

describe('rollDungeonRun — determinismo', () => {
  it('mesma seed e mesma run produzem exatamente o mesmo resultado (hash)', () => {
    const a = rollDungeonRun({ dungeon: masmorraDeEquipamento, seed: 42, runId: 'run-1', ...contexto });
    const b = rollDungeonRun({ dungeon: masmorraDeEquipamento, seed: 42, runId: 'run-1', ...contexto });
    expect(hashState(a)).toBe(hashState(b));
  });

  it('runs diferentes com a mesma seed não são a mesma recompensa', () => {
    const a = rollDungeonRun({ dungeon: masmorraDeEquipamento, seed: 42, runId: 'run-1', ...contexto });
    const b = rollDungeonRun({ dungeon: masmorraDeEquipamento, seed: 42, runId: 'run-2', ...contexto });
    expect(hashState(a)).not.toBe(hashState(b));
  });

  it('seeds diferentes na mesma run não são a mesma recompensa', () => {
    const a = rollDungeonRun({ dungeon: masmorraDeEquipamento, seed: 42, runId: 'run-1', ...contexto });
    const b = rollDungeonRun({ dungeon: masmorraDeEquipamento, seed: 43, runId: 'run-1', ...contexto });
    expect(hashState(a)).not.toBe(hashState(b));
  });

  it('os itens de uma mesma run têm ids distintos', () => {
    const run = rollDungeonRun({ dungeon: masmorraDeEquipamento, seed: 7, runId: 'run-x', ...contexto });
    expect(new Set(run.items.map((i) => i.id)).size).toBe(run.items.length);
  });
});

describe('rollDungeonRun — o foco decide o que cai', () => {
  it('masmorra de equipamento dropa item e nenhum material', () => {
    const run = rollDungeonRun({ dungeon: masmorraDeEquipamento, seed: 1, runId: 'r', ...contexto });
    expect(run.items).toHaveLength(2);
    expect(Object.keys(run.materials)).toHaveLength(0);
    expect(run.exp).toBe(0);
  });

  it('masmorra de chefe dropa material e nenhum item', () => {
    const run = rollDungeonRun({ dungeon: masmorraDeChefe, seed: 1, runId: 'r', ...contexto });
    expect(run.items).toHaveLength(0);
    const total = Object.values(run.materials).reduce((sum, n) => sum + n, 0);
    expect(total).toBeGreaterThan(0);
  });

  it('só dropa dos sets e slots declarados pela masmorra', () => {
    for (let seed = 0; seed < 40; seed++) {
      const run = rollDungeonRun({ dungeon: masmorraDeEquipamento, seed, runId: 'r', ...contexto });
      for (const item of run.items) {
        const entrada = masmorraDeEquipamento.gearDrops!.find((e) => e.setId === item.setId);
        expect(entrada).toBeDefined();
        expect(item.slot).toBe(entrada!.slot);
        expect(item.rarity).toBe(entrada!.rarity);
        expect(item.ilvl).toBe(entrada!.ilvl);
      }
    }
  });

  it('só dropa os materiais declarados, dentro da faixa declarada', () => {
    for (let seed = 0; seed < 40; seed++) {
      const run = rollDungeonRun({ dungeon: masmorraDeChefe, seed, runId: 'r', ...contexto });
      for (const [materialId, quantidade] of Object.entries(run.materials)) {
        const entrada = masmorraDeChefe.materialDrops!.find((e) => e.materialId === materialId);
        expect(entrada).toBeDefined();
        expect(quantidade).toBeGreaterThanOrEqual(entrada!.amount.min);
        // Duas rolagens podem cair no mesmo material e somar: o teto é o máximo vezes o
        // número de rolagens, não o máximo de uma.
        expect(quantidade).toBeLessThanOrEqual(entrada!.amount.max * masmorraDeChefe.materialDropCount!);
      }
    }
  });

  it('a peso maior corresponde mais drops ao longo de muitas runs', () => {
    // `set-teste-a` tem peso 3 contra 1 — não é uma prova de distribuição exata, só a
    // garantia de que o peso do dado é lido em vez de ignorado.
    let a = 0;
    let b = 0;
    for (let seed = 0; seed < 200; seed++) {
      for (const item of rollDungeonRun({ dungeon: masmorraDeEquipamento, seed, runId: 'r', ...contexto }).items) {
        if (item.setId === 'set-teste-a') a++;
        else b++;
      }
    }
    expect(a).toBeGreaterThan(b);
  });

  it('ouro e exp saem dentro da faixa declarada', () => {
    for (let seed = 0; seed < 40; seed++) {
      const run = rollDungeonRun({ dungeon: masmorraDeEquipamento, seed, runId: 'r', ...contexto });
      expect(run.gold).toBeGreaterThanOrEqual(10);
      expect(run.gold).toBeLessThanOrEqual(20);
    }
  });

  it('masmorra sem tabela nenhuma devolve recompensa vazia em vez de estourar', () => {
    const vazia: DungeonDef = {
      id: 'd', name: 'vazia', focus: 'exp', difficulty: 'normal', encounterId: 'encounter-vazio', energyCost: 1,
    };
    const run = rollDungeonRun({ dungeon: vazia, seed: 1, runId: 'r', ...contexto });
    expect(run).toEqual({ gold: 0, exp: 0, stones: 0, items: [], materials: {} });
  });
});
