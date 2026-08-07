import type { SkillDef } from '@paths-beyond/core';

// Conteúdo de demonstração pra M6 — não balanceado (ver DECISIONS.md).
export const basicStrike: SkillDef = {
  id: 'skill-golpe',
  name: 'Golpe',
  kind: 'duel',
  apCost: 1,
  cooldown: 0,
  multiplier: 1300,
  flat: 50,
  scalesWith: 'atk',
  effects: [],
  tags: ['physical'],
};

export const counterAttack: SkillDef = {
  id: 'skill-contra-ataque',
  name: 'Contra-ataque',
  kind: 'reaction',
  apCost: 0,
  ppCost: 1,
  cooldown: 0,
  multiplier: 900,
  flat: 0,
  scalesWith: 'atk',
  trigger: 'onAttacked',
  effects: [],
  tags: ['physical'],
};

export const campaignSkills: Record<string, SkillDef> = {
  [basicStrike.id]: basicStrike,
  [counterAttack.id]: counterAttack,
};
