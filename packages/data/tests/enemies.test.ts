import { describe, expect, it } from 'vitest';
import enemySchema from '../schemas/enemies.schema.js';

// §8.1 (M17, 3/N) — o schema do INIMIGO AUTORADO.
//
// O que este arquivo protege não é a forma nova (essa o gerador produz certo por
// construção); é a forma ANTIGA falhando alto. Um inimigo que ainda trouxesse `classId`,
// `level`, `talents` ou `equipment` validaria em silêncio num schema permissivo, os campos
// seriam ignorados na resolução, e o autor de conteúdo teria um inimigo com a força errada
// e nenhum erro para lê-la. Daí `.strict()`, pelo mesmo motivo que a árvore de coluna da
// 1/N é estrita.

const STATS = {
  hp: 980,
  atk: 150,
  def: 92,
  spd: 84,
  chc: 100,
  chd: 1500,
  eff: 0,
  efr: 0,
  pen: 0,
  heal: 0,
  lifesteal: 0,
  focus: 0,
  vigor: 0,
};

function inimigo(overrides: Record<string, unknown> = {}) {
  return {
    id: 'enemy-patrulheiro',
    name: 'Patrulheiro',
    stats: STATS,
    unitType: 'infantry',
    weaponType: 'spear',
    moveType: 'foot',
    moveRange: 4,
    pools: { ap: 2, pp: 2 },
    duelSkills: ['skill-basico'],
    mapSkills: [],
    tacticsScript: [{ enabled: true, skillId: 'skill-basico', conditions: [] }],
    ...overrides,
  };
}

describe('schema de inimigo autorado', () => {
  it('aceita um inimigo bem formado', () => {
    expect(() => enemySchema.parse(inimigo())).not.toThrow();
  });

  it('a folha de stats é COMPLETA — meia folha não passa', () => {
    // Um inimigo com stats parciais teria zeros implícitos em metade dos campos, e um
    // `def: 0` acidental é diferença de dificuldade grande e silenciosa. `Hero` podia ter
    // curva parcial porque a agregação preenchia o resto; aqui não há agregação.
    expect(() => enemySchema.parse(inimigo({ stats: { hp: 980, atk: 150 } }))).toThrow();
  });

  it('recusa `classId`, `level`, `awakening`, `imprint`, `talents` e `equipment` — a forma antiga falha alto', () => {
    for (const campo of ['classId', 'level', 'awakening', 'imprint', 'talents', 'equipment']) {
      expect(() => enemySchema.parse(inimigo({ [campo]: 1 })), campo).toThrow();
    }
  });

  it('recusa `duelRange` — §6.1 diz que alcance sai da arma, e não da unidade', () => {
    expect(() => enemySchema.parse(inimigo({ duelRange: 5 }))).toThrow();
  });

  it('recusa `characterId` — inimigo não é personagem, e portanto não tem árvore', () => {
    expect(() => enemySchema.parse(inimigo({ characterId: 'ally-arqueiro' }))).toThrow();
  });

  it('os limites de skill e script são os mesmos do herói: 5 de duelo, 2 de mapa, 6 linhas', () => {
    // Mesmos tetos porque as razões deles são do DUELO e do script (§6.3), não de quem
    // porta a skill: um inimigo com 9 linhas de script seria ilegível pelo mesmo motivo
    // que um herói com 9 linhas seria.
    expect(() => enemySchema.parse(inimigo({ duelSkills: Array.from({ length: 6 }, (_u, i) => `s${i}`) }))).toThrow();
    expect(() => enemySchema.parse(inimigo({ mapSkills: ['a', 'b', 'c'] }))).toThrow();
    expect(() =>
      enemySchema.parse(
        inimigo({ tacticsScript: Array.from({ length: 7 }, () => ({ enabled: true, skillId: 's', conditions: [] })) }),
      ),
    ).toThrow();
  });

  it('pools e moveRange precisam ser inteiros não negativos', () => {
    expect(() => enemySchema.parse(inimigo({ pools: { ap: -1, pp: 2 } }))).toThrow();
    expect(() => enemySchema.parse(inimigo({ moveRange: 0 }))).toThrow();
    expect(() => enemySchema.parse(inimigo({ moveRange: 2.5 }))).toThrow();
  });

  it('unitType e moveType são os enums do jogo, não texto livre', () => {
    expect(() => enemySchema.parse(inimigo({ unitType: 'monstro' }))).toThrow();
    expect(() => enemySchema.parse(inimigo({ moveType: 'teleporte' }))).toThrow();
  });
});
