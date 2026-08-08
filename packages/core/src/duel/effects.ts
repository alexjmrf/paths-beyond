import { fpMul, FP_SCALE } from '../math/fixed.js';
import { addFlat, multiplyByPctSum } from '../stats/aggregate.js';
import type { EffectApplication } from '../skills/types.js';
import type { StatModifier, StatSheet } from '../stats/types.js';
import type { Id } from '../types.js';
import type { ActiveEffect, EffectDef } from './types.js';

// §6.9 — "chanceFinal = clamp(base × (1 + eff_atacante) × (1 - efr_defensor), 0, 1000)".
export interface EffectApplicationChanceInput {
  readonly baseChance: number;
  readonly attackerEff: number;
  readonly defenderEfr: number;
}

export function computeEffectApplicationChance(input: EffectApplicationChanceInput): number {
  const afterEff = fpMul(input.baseChance, FP_SCALE + input.attackerEff);
  const afterEfr = fpMul(afterEff, FP_SCALE - input.defenderEfr);
  return Math.min(Math.max(afterEfr, 0), FP_SCALE);
}

// Repete o StatModifier de um efeito uma vez por stack — 2 stacks de "+50 flat atk"
// vira duas entradas de +50, que addFlat/multiplyByPctSum somam normalmente.
function statModsForEffect(active: ActiveEffect, def: EffectDef): StatModifier[] {
  const mods: StatModifier[] = [];
  for (let i = 0; i < active.stacks; i++) {
    mods.push(...def.statMods);
  }
  return mods;
}

// §4.1 passo 8 — "× (1 + buffs/debuffs ativos)": só existe dentro do duelo, nunca
// persiste no stat sheet estático de M1. Reusa o mesmo padrão flat-depois-pct dos
// outros passos de aggregate.ts em vez de duplicar a lógica.
export function applyActiveEffectsToStats(
  sheet: StatSheet,
  activeEffects: readonly ActiveEffect[],
  defs: Readonly<Record<Id, EffectDef>>,
): StatSheet {
  const allMods: StatModifier[] = [];
  for (const active of activeEffects) {
    const def = defs[active.id];
    if (!def) continue;
    allMods.push(...statModsForEffect(active, def));
  }
  const flatMods = allMods.filter((m) => m.flat !== undefined);
  const pctMods = allMods.filter((m) => m.pct !== undefined);
  return multiplyByPctSum(addFlat(sheet, flatMods), pctMods);
}

function sumEffectField(
  activeEffects: readonly ActiveEffect[],
  defs: Readonly<Record<Id, EffectDef>>,
  field: 'damageDealtPct' | 'damageTakenReductionPct',
): number {
  let total = 0;
  for (const active of activeEffects) {
    const value = defs[active.id]?.[field];
    if (value === undefined) continue;
    // soma repetida em vez de `value * stacks` — core/duel proíbe `*` cru fora dos
    // helpers de math/fixed.ts, mesmo quando a conta é exata (regra 2 do CLAUDE.md).
    for (let i = 0; i < active.stacks; i++) {
      total += value;
    }
  }
  return total;
}

export function sumDamageDealtPct(
  activeEffects: readonly ActiveEffect[],
  defs: Readonly<Record<Id, EffectDef>>,
): number {
  return sumEffectField(activeEffects, defs, 'damageDealtPct');
}

export function sumDamageTakenReductionPct(
  activeEffects: readonly ActiveEffect[],
  defs: Readonly<Record<Id, EffectDef>>,
): number {
  return sumEffectField(activeEffects, defs, 'damageTakenReductionPct');
}

// §6.9/§8.3 (M10) — cria ou empilha um ActiveEffect a partir de uma EffectApplication já
// aprovada pela rolagem de chance. Reaplicar um efeito já ativo refresca a duration para a
// da nova aplicação (decisão registrada em DECISIONS.md) e soma stacks até o teto do
// EffectDef. Compartilhado por resolveDuel.ts (skill.effects em duelo) e
// battle/commands.ts (applyMapSkill) — a mesma lógica existia duplicada só neste último
// antes de M10.
export function upsertActiveEffect(
  effects: readonly ActiveEffect[],
  def: EffectDef,
  application: EffectApplication,
): ActiveEffect[] {
  const stacksToAdd = application.stacks ?? 1;
  const existing = effects.find((e) => e.id === application.effectId);
  if (existing) {
    const stacks = Math.min(existing.stacks + stacksToAdd, def.maxStacks);
    return effects.map((e) =>
      e.id === application.effectId ? { ...e, stacks, duration: application.duration } : e,
    );
  }
  return [
    ...effects,
    {
      id: application.effectId,
      duration: application.duration,
      stacks: Math.min(stacksToAdd, def.maxStacks),
      maxStacks: def.maxStacks,
      dispellable: def.dispellable,
    },
  ];
}
