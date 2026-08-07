// §4.1 — os 13 stats do jogo.
export const STAT_KEYS = [
  'hp',
  'atk',
  'def',
  'spd',
  'chc',
  'chd',
  'eff',
  'efr',
  'pen',
  'heal',
  'lifesteal',
  'focus',
  'vigor',
] as const;

export type StatKey = (typeof STAT_KEYS)[number];

export type StatSheet = Record<StatKey, number>;

// Mesmo shape usado por TalentEffect (§8.2): um modificador ou soma flat a um stat,
// ou aplica uma % sobre ele — nunca os dois indistintamente.
export interface StatModifier {
  readonly stat: StatKey;
  readonly flat?: number;
  readonly pct?: number;
}
