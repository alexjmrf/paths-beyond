import { describe, expect, it } from 'vitest';
import { resolveTalentEffects } from '../../src/talents/resolve.js';
import type { ColumnTalentNode } from '../../src/talents/columnTree.js';

// M17 2/N — os nós passaram a declarar `column` no lugar de `tree`. `resolveTalentEffects`
// não lê nenhum dos dois (ele agrega efeito por rank alocado, §8.2), então a troca aqui é
// só de forma: o que este arquivo mede continua sendo a agregação dos 12 efeitos.
const tree: ColumnTalentNode[] = [
  { id: 'hp-node', column: 'a', row: 1, maxRank: 3, effects: [{ t: 'stat', stat: 'hp', flat: 50 }] },
  { id: 'atk-pct-node', column: 'a', row: 1, maxRank: 2, effects: [{ t: 'stat', stat: 'atk', pct: 30 }] },
  { id: 'grant-node', column: 'a', row: 2, maxRank: 1, effects: [{ t: 'grantSkill', skillId: 'skill-x' }] },
  { id: 'grant-reaction-node', column: 'a', row: 2, maxRank: 1, effects: [{ t: 'grantReaction', reactionId: 'reaction-y' }] },
  {
    id: 'patch-node',
    column: 'a',
    row: 2,
    maxRank: 1,
    effects: [{ t: 'modifySkill', skillId: 'skill-z', patch: { flat: 100 } }],
  },
  { id: 'ap-node', column: 'b', row: 1, maxRank: 2, effects: [{ t: 'maxAp', n: 1 }] },
  { id: 'pp-node', column: 'b', row: 1, maxRank: 1, effects: [{ t: 'maxPp', n: 1 }] },
  {
    id: 'refund-node',
    column: 'b',
    row: 1,
    maxRank: 1,
    effects: [{ t: 'apRefund', on: 'duelWon', n: 1 }],
  },
  { id: 'assist-node', column: 'b', row: 1, maxRank: 1, effects: [{ t: 'assistRangeBonus', n: 1 }] },
  { id: 'cap-node', column: 'b', row: 1, maxRank: 1, effects: [{ t: 'duelApCap', n: 1 }] },
  { id: 'slot-node', column: 'b', row: 1, maxRank: 1, effects: [{ t: 'extraTacticsSlot' }] },
  { id: 'condition-node', column: 'b', row: 1, maxRank: 1, effects: [{ t: 'extraTacticsCondition' }] },
  { id: 'passive-node', column: 'b', row: 1, maxRank: 1, effects: [{ t: 'passive', passiveId: 'passive-1' }] },
];

describe('resolveTalentEffects — efeitos stat escalam por rank (§8.2)', () => {
  it('rank 1 aplica o flat/pct declarado uma vez', () => {
    const result = resolveTalentEffects(tree, { 'hp-node': 1 });
    expect(result.statMods).toEqual([{ stat: 'hp', flat: 50, pct: undefined }]);
  });

  it('rank 3 multiplica o flat por 3', () => {
    const result = resolveTalentEffects(tree, { 'hp-node': 3 });
    expect(result.statMods).toEqual([{ stat: 'hp', flat: 150, pct: undefined }]);
  });

  it('rank 2 multiplica o pct por 2', () => {
    const result = resolveTalentEffects(tree, { 'atk-pct-node': 2 });
    expect(result.statMods).toEqual([{ stat: 'atk', flat: undefined, pct: 60 }]);
  });
});

describe('resolveTalentEffects — skills concedidas/modificadas', () => {
  it('coleta grantSkill e grantReaction', () => {
    const result = resolveTalentEffects(tree, { 'grant-node': 1, 'grant-reaction-node': 1 });
    expect(result.grantedSkillIds).toEqual(['skill-x']);
    expect(result.grantedReactionIds).toEqual(['reaction-y']);
  });

  it('coleta os patches de modifySkill por skillId', () => {
    const result = resolveTalentEffects(tree, { 'patch-node': 1 });
    expect(result.skillPatches).toEqual({ 'skill-z': { flat: 100 } });
  });

  it('rank não duplica grantSkill/grantReaction/passive (não-numéricos aplicam uma vez)', () => {
    const result = resolveTalentEffects(tree, { 'grant-node': 1 });
    expect(result.grantedSkillIds).toHaveLength(1);
  });
});

describe('resolveTalentEffects — bônus numéricos escalam por rank', () => {
  it('maxAp em rank 2 soma 2', () => {
    const result = resolveTalentEffects(tree, { 'ap-node': 2 });
    expect(result.maxApBonus).toBe(2);
  });

  it('maxPp, duelApCap, assistRangeBonus em rank 1', () => {
    const result = resolveTalentEffects(tree, {
      'pp-node': 1,
      'cap-node': 1,
      'assist-node': 1,
    });
    expect(result.maxPpBonus).toBe(1);
    expect(result.duelApCapBonus).toBe(1);
    expect(result.assistRangeBonus).toBe(1);
  });

  it('apRefund coleta a regra com on/n', () => {
    const result = resolveTalentEffects(tree, { 'refund-node': 1 });
    expect(result.apRefundRules).toEqual([{ on: 'duelWon', n: 1 }]);
  });

  it('extraTacticsSlot/Condition e passive são contados/coletados', () => {
    const result = resolveTalentEffects(tree, { 'slot-node': 1, 'condition-node': 1, 'passive-node': 1 });
    expect(result.extraTacticsSlots).toBe(1);
    expect(result.extraTacticsConditions).toBe(1);
    expect(result.passiveIds).toEqual(['passive-1']);
  });
});

describe('resolveTalentEffects — nós não alocados (rank 0 ou ausentes) não contribuem', () => {
  it('ignora entradas com rank 0', () => {
    const result = resolveTalentEffects(tree, { 'hp-node': 0 });
    expect(result.statMods).toEqual([]);
  });

  it('ignora ids de nó desconhecidos sem travar', () => {
    const result = resolveTalentEffects(tree, { fantasma: 1 });
    expect(result.statMods).toEqual([]);
  });
});

describe('resolveTalentEffects — reprodutível (critério de aceite do M5)', () => {
  it('a mesma árvore e a mesma alocação resolvidas duas vezes dão o mesmo resultado', () => {
    const allocation = { 'hp-node': 2, 'atk-pct-node': 1, 'grant-node': 1, 'ap-node': 1 };
    const a = resolveTalentEffects(tree, allocation);
    const b = resolveTalentEffects(tree, allocation);
    expect(a).toEqual(b);
  });
});
