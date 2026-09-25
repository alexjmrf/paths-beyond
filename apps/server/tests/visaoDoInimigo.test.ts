import { buildInitialState } from '@paths-beyond/core';
import type { BattleSetup, BattleState, BattleUnit } from '@paths-beyond/core';
import { describe, expect, it } from 'vitest';
import { CAMPOS_VISIVEIS_DO_INIMIGO, redigirEstado, redigirUnidade } from '../src/battle/visao.js';
import type { UnidadeInimigaVisivel } from '../src/battle/visao.js';

// M36 2/N (D47/D48) — O INIMIGO É DESCONHECIDO, provado POR FORMA.
//
// **O critério de aceite do M36, ao pé da letra:** "um teste prova que nenhuma resposta de rota
// de batalha carrega stat, skill, item, script, `moveType` ou alcance de unidade inimiga — por
// forma (o tipo redigido não tem os campos), não por varredura."
//
// Varrer a resposta atrás de `stats` seria o teste errado, e o M34 já aprendeu por quê: teste
// que enumera o que já está pronto fica vacuamente verde sobre o que falta. Uma varredura passa
// no dia em que alguém acrescenta um campo novo ao `BattleUnit` e esquece de redigi-lo — e é
// exatamente esse dia que importa. Então a prova é dupla, e as duas metades se fecham:
//
// 1. **Em tempo de compilação** (`visao.ts`): `CAMPOS_VISIVEIS_DO_INIMIGO` é declarada exaustiva
//    contra `keyof UnidadeInimigaVisivel`. É o idioma de `CAMPOS_COLETADOS` do M34 1/N.
// 2. **Aqui**: as chaves da unidade inimiga redigida são EXATAMENTE essa declaração, e a
//    diferença contra `keyof BattleUnit` — tudo que ficou de fora — é afirmada nome a nome.
//    Acrescentar um campo ao `BattleUnit` sem decidir o que fazer com ele reprova.
//
// **A exceção declarada é `hpMax`** (decisão do usuário, D48): a barra de HP do inimigo continua
// existindo, com número atual e máximo. É o único stat que atravessa, e está aqui por escrito
// para que "o único" continue sendo verdade.

const plain = {
  id: 'plain',
  moveCost: { foot: 1, cavalry: 1, flying: 1, heavy: 1, aquatic: 2 },
  defBonus: 0,
  evaBonus: 0,
  blocksSight: false,
} as const;

function statSheet() {
  return {
    hp: 5000,
    atk: 1000,
    def: 300,
    spd: 100,
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
}

const golpe = {
  id: 'skill-golpe',
  name: 'Golpe',
  kind: 'duel',
  apCost: 1,
  cooldown: 0,
  multiplier: 1500,
  flat: 100,
  scalesWith: 'atk',
  effects: [],
  tags: ['physical'],
} as const;

function buildUnit(overrides: Partial<BattleUnit> = {}): BattleUnit {
  return {
    unitId: 'u1',
    heroId: 'h1',
    side: 'player',
    pos: { x: 0, y: 0 },
    height: 0,
    hp: 5000,
    ap: 3,
    pp: 2,
    hasActedThisRound: false,
    effects: [],
    cooldowns: {},
    stats: statSheet(),
    unitType: 'infantry',
    weaponType: 'sword',
    duelRange: 1,
    assistRange: 2,
    moveType: 'foot',
    moveRange: 4,
    tacticsScript: [{ enabled: true, skillId: golpe.id, conditions: [] }],
    reactionScript: [],
    knownSkills: { [golpe.id]: golpe },
    setSpecialEffectIds: ['set-sentinela'],
    lethalTriggersUsed: ['gatilho-x'],
    ...overrides,
  } as BattleUnit;
}

function buildSetup(units: readonly BattleUnit[]): BattleSetup {
  const tiles = Array.from({ length: 5 }, () =>
    Array.from({ length: 5 }, () => ({ terrain: 'plain', height: 0 as const })),
  );
  return {
    map: { width: 5, height: 5, tiles, terrains: { plain }, zocEnabled: false },
    units,
    permadeath: 'classic',
    winCondition: { t: 'rout' },
    effectDefs: {},
    initialValor: 5,
    summonBlueprints: { 'bp-lobo': buildUnit({ unitId: 'lobo', heroId: 'h-lobo' }) },
  };
}

// O arquétipo de IA é declarado DEPOIS de `buildInitialState`, e não dentro do setup: a
// construção já drena o turno da IA, e uma peça que se move antes de ser fotografada tornaria a
// asserção sobre a posição uma asserção sobre o algoritmo da IA. Aqui ele existe só para provar
// que a redação o esconde.
function estadoComOsDoisLados(): BattleState {
  const meu = buildUnit({ unitId: 'meu', heroId: 'h-meu', side: 'player' });
  const dele = buildUnit({ unitId: 'dele', heroId: 'h-dele', side: 'enemy', pos: { x: 4, y: 4 }, hp: 3200 });
  const base = buildInitialState(buildSetup([meu, dele]), 1);
  return {
    ...base,
    units: base.units.map((u) => (u.unitId === 'dele' ? { ...u, aiArchetype: 'aggressive' as const } : u)),
  };
}

describe('M36 2/N — a unidade inimiga redigida, por forma', () => {
  it('as chaves são EXATAMENTE a declaração, sem sobra nem falta', () => {
    const state = estadoComOsDoisLados();
    const dele = state.units.find((u) => u.unitId === 'dele')!;

    const redigida = redigirUnidade(dele, 'player');

    expect(Object.keys(redigida).sort()).toEqual([...CAMPOS_VISIVEIS_DO_INIMIGO].sort());
  });

  it('nenhum campo de build atravessa — nome a nome, e a lista é DERIVADA de `keyof BattleUnit`', () => {
    const state = estadoComOsDoisLados();
    const dele = state.units.find((u) => u.unitId === 'dele')!;

    const redigida = redigirUnidade(dele, 'player') as unknown as Record<string, unknown>;

    // O que o `BattleUnit` tem e a declaração não cobre: tudo isso tem de estar ausente. A
    // lista não é escrita à mão — sai do objeto real, então um campo NOVO no `BattleUnit`
    // entra aqui sozinho e reprova até alguém decidir o que fazer com ele.
    const visiveis = new Set<string>(CAMPOS_VISIVEIS_DO_INIMIGO);
    const ocultos = Object.keys(dele).filter((campo) => !visiveis.has(campo));

    expect(ocultos.length).toBeGreaterThan(0); // não é vacuamente verdadeiro
    for (const campo of ocultos) {
      expect(redigida[campo]).toBeUndefined();
    }

    // E os que D47 nomeia, explicitamente, para que a leitura da decisão fique no teste.
    for (const campo of [
      'stats',
      'knownSkills',
      'tacticsScript',
      'reactionScript',
      'moveType',
      'moveRange',
      'duelRange',
      'assistRange',
      'weaponType',
      'cooldowns',
      'setSpecialEffectIds',
      'lethalTriggersUsed',
      'aiArchetype',
      'heroId',
    ]) {
      expect(ocultos).toContain(campo);
      expect(campo in redigida).toBe(false);
    }
  });

  // M38 3/N (D47/D54) — o ARTEFATO do inimigo é build, e build não atravessa. Na unidade de
  // batalha ele não existe como campo: vira status (passo 3/4 da agregação), pool de entrada
  // e skill de reação. Os três lugares onde ele pousa são ocultos, e nenhum campo visível
  // fala de artefato — um campo `artifact` novo no `BattleUnit` reprova o teste acima sozinho.
  it('o artefato do inimigo não atravessa: os lugares onde ele pousa são todos ocultos', () => {
    const state = estadoComOsDoisLados();
    const dele = state.units.find((u) => u.unitId === 'dele')!;
    const redigida = redigirUnidade(dele, 'player') as unknown as Record<string, unknown>;

    expect(CAMPOS_VISIVEIS_DO_INIMIGO.some((campo) => /artifact|artefato/i.test(campo))).toBe(false);
    for (const campo of ['stats', 'knownSkills', 'reactionScript']) {
      expect(campo in dele).toBe(true);
      expect(campo in redigida).toBe(false);
    }
  });

  it('o que D47 promete que o jogador vê, ele vê: posição, HP, AP, PP', () => {
    const state = estadoComOsDoisLados();
    const dele = state.units.find((u) => u.unitId === 'dele')!;

    const redigida = redigirUnidade(dele, 'player');

    expect(redigida).toMatchObject({
      unitId: 'dele',
      side: 'enemy',
      pos: { x: 4, y: 4 },
      hp: 3200,
      ap: dele.ap,
      pp: dele.pp,
    });
  });

  it('`unitType` atravessa e `weaponType` não — identidade é visível, equipamento não (D48)', () => {
    // A linha que separa as duas: `unitType` é o que a peça É, e a arte já o mostra. `weaponType`
    // vem da arma EQUIPADA, que D47 nomeia, e §6.8 faz dela uma vantagem calculável.
    const state = estadoComOsDoisLados();
    const dele = state.units.find((u) => u.unitId === 'dele')!;

    const redigida = redigirUnidade(dele, 'player') as unknown as Record<string, unknown>;

    expect(redigida.unitType).toBe(dele.unitType);
    expect('weaponType' in redigida).toBe(false);
  });

  it('`hpMax` é a exceção declarada (D48): a barra existe, e ela é o HP resolvido', () => {
    const state = estadoComOsDoisLados();
    const dele = state.units.find((u) => u.unitId === 'dele')!;

    const redigida = redigirUnidade(dele, 'player');

    expect((redigida as UnidadeInimigaVisivel).hpMax).toBe(dele.stats.hp);
    // E é o ÚNICO stat: nenhum outro valor de `stats` aparece na unidade redigida.
    const valores = Object.values(redigida as unknown as Record<string, unknown>);
    expect(valores).not.toContain(dele.stats.atk);
    expect(valores).not.toContain(dele.stats.def);
    expect(valores).not.toContain(dele.stats.spd);
  });

  it('a unidade do JOGADOR não é redigida — ele lê o próprio compromisso inteiro (§1.1)', () => {
    const state = estadoComOsDoisLados();
    const meu = state.units.find((u) => u.unitId === 'meu')!;

    expect(redigirUnidade(meu, 'player')).toEqual(meu);
  });
});

describe('M36 2/N — o estado visível inteiro', () => {
  it('redige todo mundo do outro lado e ninguém do seu', () => {
    const visivel = redigirEstado(estadoComOsDoisLados(), 'player');

    const meu = visivel.units.find((u) => u.unitId === 'meu')!;
    const dele = visivel.units.find((u) => u.unitId === 'dele')!;

    expect('stats' in meu).toBe(true);
    expect('stats' in dele).toBe(false);
  });

  it('o lado é um PARÂMETRO: na arena, quem defende é o inimigo de quem ataca, e vice-versa', () => {
    const state = estadoComOsDoisLados();

    const doAtacante = redigirEstado(state, 'player');
    const doDefensor = redigirEstado(state, 'enemy');

    expect('stats' in doAtacante.units.find((u) => u.unitId === 'dele')!).toBe(false);
    expect('stats' in doDefensor.units.find((u) => u.unitId === 'dele')!).toBe(true);
    expect('stats' in doDefensor.units.find((u) => u.unitId === 'meu')!).toBe(false);
  });

  it('não leva a seed: quem resolve é o servidor, e o cliente não tem o que reproduzir com ela', () => {
    const visivel = redigirEstado(estadoComOsDoisLados(), 'player') as unknown as Record<string, unknown>;
    expect('seed' in visivel).toBe(false);
  });

  it('não leva `summonBlueprints`: são `BattleUnit` inteiros, e um deles é perfil de combate pronto', () => {
    const visivel = redigirEstado(estadoComOsDoisLados(), 'player') as unknown as Record<string, unknown>;
    expect('summonBlueprints' in visivel).toBe(false);
  });

  it('leva o que a tela precisa para desenhar e para o jogador mover o SEU lado', () => {
    const state = estadoComOsDoisLados();
    const visivel = redigirEstado(state, 'player');

    expect(visivel.map).toEqual(state.map);
    expect(visivel.initiativeOrder).toEqual(state.initiativeOrder);
    expect(visivel.round).toBe(state.round);
    expect(visivel.valor).toBe(state.valor);
    expect(visivel.outcome).toBe(state.outcome);
    expect(visivel.winCondition).toEqual(state.winCondition);
    expect(visivel.permadeath).toBe(state.permadeath);
  });

  it('`distanceMovedThisTurn` só traz as unidades do próprio lado', () => {
    const state = estadoComOsDoisLados();
    const comAndanca: BattleState = { ...state, distanceMovedThisTurn: { meu: 2, dele: 3 } };

    const visivel = redigirEstado(comAndanca, 'player');

    expect(visivel.distanceMovedThisTurn).toEqual({ meu: 2 });
  });

  it('é pura: redigir não muta o estado recebido', () => {
    const state = estadoComOsDoisLados();
    const congelado = structuredClone(state);
    redigirEstado(state, 'player');
    expect(state).toEqual(congelado);
  });
});
