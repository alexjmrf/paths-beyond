import type { TalentNode } from '@paths-beyond/core';

// Conteúdo de demonstração pra M6 — não balanceado (ver DECISIONS.md, M8 substitui).
// §8.2 — "Ao menos 2 nós por árvore DEVEM tocar a economia de AP/PP ou o sistema de
// assistência." Classe toca em maxAp/maxPp/assistRangeBonus (3 nós); Especialização toca
// em duelApCap/apRefund (2 nós).

export interface PositionedTalentNode {
  readonly node: TalentNode;
  readonly col: 0 | 1 | 2;
}

export const DEMO_CLASS_ID = 'demo-classe-soldado';

export const classTreeLayout: readonly PositionedTalentNode[] = [
  {
    col: 1,
    node: { id: 't-classe-foco', tree: 'class', row: 1, maxRank: 3, effects: [{ t: 'stat', stat: 'focus', flat: 40 }] },
  },
  {
    col: 1,
    node: { id: 't-classe-ap', tree: 'class', row: 2, maxRank: 1, effects: [{ t: 'maxAp', n: 1 }] },
  },
  {
    col: 1,
    node: { id: 't-classe-atk', tree: 'class', row: 3, maxRank: 2, effects: [{ t: 'stat', stat: 'atk', pct: 50 }] },
  },
  {
    col: 0,
    node: {
      id: 't-classe-golpe-forte',
      tree: 'class',
      row: 4,
      maxRank: 1,
      requires: ['t-classe-atk'],
      exclusiveWith: ['t-classe-esquiva'],
      effects: [{ t: 'modifySkill', skillId: 'skill-golpe', patch: { multiplier: 1600 } }],
    },
  },
  {
    col: 2,
    node: {
      id: 't-classe-esquiva',
      tree: 'class',
      row: 4,
      maxRank: 1,
      requires: ['t-classe-atk'],
      exclusiveWith: ['t-classe-golpe-forte'],
      effects: [{ t: 'stat', stat: 'def', flat: 120 }],
    },
  },
  {
    col: 1,
    node: { id: 't-classe-pp', tree: 'class', row: 5, maxRank: 1, effects: [{ t: 'maxPp', n: 1 }] },
  },
  {
    col: 1,
    node: { id: 't-classe-assist', tree: 'class', row: 6, maxRank: 1, effects: [{ t: 'assistRangeBonus', n: 1 }] },
  },
  {
    col: 1,
    node: {
      id: 't-classe-critico',
      tree: 'class',
      row: 7,
      maxRank: 1,
      effects: [
        { t: 'stat', stat: 'chc', flat: 50 },
        { t: 'stat', stat: 'chd', flat: 100 },
      ],
    },
  },
  {
    col: 1,
    node: {
      id: 't-classe-capstone',
      tree: 'class',
      row: 8,
      maxRank: 1,
      requires: ['t-classe-critico'],
      effects: [{ t: 'grantSkill', skillId: 'skill-especial-classe' }],
    },
  },
];

export const specTreeLayout: readonly PositionedTalentNode[] = [
  {
    col: 1,
    node: { id: 't-spec-hp', tree: 'spec', row: 1, maxRank: 3, effects: [{ t: 'stat', stat: 'hp', flat: 200 }] },
  },
  {
    col: 1,
    node: { id: 't-spec-duelapcap', tree: 'spec', row: 2, maxRank: 1, effects: [{ t: 'duelApCap', n: 1 }] },
  },
  {
    col: 1,
    node: { id: 't-spec-def', tree: 'spec', row: 3, maxRank: 2, effects: [{ t: 'stat', stat: 'def', pct: 40 }] },
  },
  {
    col: 0,
    node: {
      id: 't-spec-contra-forte',
      tree: 'spec',
      row: 4,
      maxRank: 1,
      requires: ['t-spec-def'],
      exclusiveWith: ['t-spec-defesa-total'],
      effects: [{ t: 'modifySkill', skillId: 'skill-contra-ataque', patch: { multiplier: 1200 } }],
    },
  },
  {
    col: 2,
    node: {
      id: 't-spec-defesa-total',
      tree: 'spec',
      row: 4,
      maxRank: 1,
      requires: ['t-spec-def'],
      exclusiveWith: ['t-spec-contra-forte'],
      effects: [{ t: 'stat', stat: 'efr', flat: 100 }],
    },
  },
  {
    col: 1,
    node: {
      id: 't-spec-refund',
      tree: 'spec',
      row: 5,
      maxRank: 1,
      effects: [{ t: 'apRefund', on: 'duelWon', n: 1 }],
    },
  },
  {
    col: 1,
    node: { id: 't-spec-extra-tactics', tree: 'spec', row: 6, maxRank: 1, effects: [{ t: 'extraTacticsSlot' }] },
  },
  {
    col: 1,
    node: {
      id: 't-spec-passiva',
      tree: 'spec',
      row: 7,
      maxRank: 1,
      effects: [{ t: 'passive', passiveId: 'passiva-regeneracao' }],
    },
  },
  {
    col: 1,
    node: {
      id: 't-spec-capstone',
      tree: 'spec',
      row: 8,
      maxRank: 1,
      requires: ['t-spec-passiva'],
      effects: [{ t: 'grantReaction', reactionId: 'skill-contra-ataque-especial' }],
    },
  },
];

export const allTalentNodes: readonly TalentNode[] = [
  ...classTreeLayout.map((p) => p.node),
  ...specTreeLayout.map((p) => p.node),
];

export const MAX_POINTS_PER_TREE = 8;
