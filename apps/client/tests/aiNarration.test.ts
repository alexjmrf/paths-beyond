import {
  buildInitialState,
  resolveAiTurnsLogged,
  type AiTurnStep,
  type BattleSetup,
  type BattleState,
  type BattleUnit,
  type Coord,
  type DuelResult,
  type GridMap,
  type MapAiArchetype,
  type SkillDef,
  type StatSheet,
  type Terrain,
} from '@paths-beyond/core';
import { describe, expect, it } from 'vitest';
import { narrateAiTurns, type AiScene } from '../src/data/aiNarration.js';

// M16, sub-sessão 4/N — a narração do turno da IA.
//
// A mesma inversão de 1/N (a forma) e de 3/N (o tempo), aplicada agora à SEQUÊNCIA: este módulo
// converte o relato que o core produz numa lista ordenada de cenas, e não anima nada. Quem tem
// relógio continua sendo o `MapCanvas`, num ponto só. É o que permite AFIRMAR a propriedade que
// dá nome à fatia — **toda unidade que mudou de tile tem uma cena que a leva até lá** — em vez
// de olhar o tabuleiro e torcer para não ter sobrado um teletransporte.
//
// Este arquivo não importa Pixi nem toca no DOM.

const plain: Terrain = {
  id: 'plain',
  moveCost: { foot: 1, cavalry: 1, flying: 1, heavy: 1, aquatic: 2 },
  defBonus: 0,
  evaBonus: 0,
  blocksSight: false,
};

function buildMap(): GridMap {
  const tiles = Array.from({ length: 7 }, () => Array.from({ length: 7 }, () => ({ terrain: 'plain', height: 0 as const })));
  return { width: 7, height: 7, tiles, terrains: { plain }, zocEnabled: false };
}

function statSheet(overrides: Partial<StatSheet> = {}): StatSheet {
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
    ...overrides,
  };
}

const strike: SkillDef = {
  id: 'skill-strike',
  name: 'Golpe',
  kind: 'duel',
  apCost: 1,
  cooldown: 0,
  multiplier: 1500,
  flat: 100,
  scalesWith: 'atk',
  effects: [],
  tags: ['physical'],
};

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
    tacticsScript: [{ enabled: true, skillId: strike.id, conditions: [] }],
    reactionScript: [],
    knownSkills: { [strike.id]: strike },
    ...overrides,
  };
}

function buildSetup(units: readonly BattleUnit[]): BattleSetup {
  return {
    map: buildMap(),
    units,
    permadeath: 'classic',
    winCondition: { t: 'rout' },
    effectDefs: {},
    initialValor: 5,
  };
}

// Mesmo motivo do teste do core: `buildInitialState` drena a IA na hora, então o estado nasce
// sem arquétipo e ele é declarado depois — é assim que sobra um turno de IA para narrar.
function comIaPendente(inimigos: readonly { id: string; pos: Coord; archetype: MapAiArchetype }[]): BattleState {
  const human = buildUnit({
    unitId: 'atk',
    side: 'player',
    pos: { x: 0, y: 0 },
    hp: 4000,
    stats: statSheet({ hp: 4000, def: 0 }),
  });
  const ias = inimigos.map((i) => buildUnit({ unitId: i.id, side: 'enemy', pos: i.pos }));
  const base = buildInitialState(buildSetup([human, ...ias]), 1);
  const arquetipos = new Map(inimigos.map((i) => [i.id, i.archetype]));
  return {
    ...base,
    units: base.units.map((u) => {
      const archetype = arquetipos.get(u.unitId);
      return archetype ? { ...u, aiArchetype: archetype } : u;
    }),
  };
}

function passoMove(unitId: string, path: readonly Coord[]): AiTurnStep {
  return { stateBefore: {} as BattleState, command: { t: 'move', unitId, path } };
}

function cenasDeMovimento(scenes: readonly AiScene[]): readonly Extract<AiScene, { kind: 'move' }>[] {
  return scenes.filter((s): s is Extract<AiScene, { kind: 'move' }> => s.kind === 'move');
}

describe('M16 4/N — `narrateAiTurns`: o relato do core vira cenas', () => {
  it('um `wait` não vira cena: parar o tabuleiro sem nada na tela é o tabuleiro travando, não uma jogada', () => {
    const steps: readonly AiTurnStep[] = [{ stateBefore: {} as BattleState, command: { t: 'wait', unitId: 'def' } }];
    expect(narrateAiTurns(steps)).toEqual([]);
  });

  it('um `move` vira cena com o caminho DO COMANDO, e não com um caminho reconstruído', () => {
    const path: readonly Coord[] = [
      { x: 4, y: 4 },
      { x: 3, y: 4 },
      { x: 3, y: 3 },
    ];
    const scenes = narrateAiTurns([passoMove('def', path)]);

    expect(scenes).toHaveLength(1);
    expect(scenes[0]!.kind).toBe('move');
    // Identidade, não igualdade: é a prova de que a cena carrega o caminho que a IA andou, o
    // mesmo objeto que o core relatou. Um caminho recalculado seria `toEqual` sem ser `toBe`.
    expect(cenasDeMovimento(scenes)[0]!.path).toBe(path);
    expect(cenasDeMovimento(scenes)[0]!.unitId).toBe('def');
  });

  it('um `move` degenerado (um tile só) não vira cena — não há o que mostrar', () => {
    expect(narrateAiTurns([passoMove('def', [{ x: 2, y: 2 }])])).toEqual([]);
  });

  it('um `engage` vira cena de duelo com o `duelResult` do passo', () => {
    const state = comIaPendente([{ id: 'def', pos: { x: 1, y: 0 }, archetype: 'aggressive' }]);
    const { steps } = resolveAiTurnsLogged(state);
    const scenes = narrateAiTurns(steps);

    const duelo = scenes.find((s) => s.kind === 'duel');
    expect(duelo).toBeDefined();
    const passo = steps.find((s) => s.command.t === 'engage')!;
    if (duelo!.kind !== 'duel') throw new Error('esperava um duelo');
    expect(duelo!.duelResult).toBe(passo.duelResult as DuelResult);
    expect(duelo!.stateBefore).toBe(passo.stateBefore);
  });

  it('um `engage` sem `duelResult` não vira cena: a narração não inventa duelo', () => {
    const steps: readonly AiTurnStep[] = [
      { stateBefore: {} as BattleState, command: { t: 'engage', unitId: 'def', targetId: 'atk' } },
    ];
    expect(narrateAiTurns(steps)).toEqual([]);
  });

  it('uma IA que anda e engaja no mesmo turno vira duas cenas, nessa ordem', () => {
    const state = comIaPendente([{ id: 'def', pos: { x: 3, y: 0 }, archetype: 'aggressive' }]);
    const scenes = narrateAiTurns(resolveAiTurnsLogged(state).steps);
    expect(scenes.map((s) => s.kind)).toEqual(['move', 'duel']);
  });

  it('as cenas saem na ordem dos passos, que é a ordem de iniciativa — nunca duas IAs andando juntas', () => {
    const state = comIaPendente([
      { id: 'ia1', pos: { x: 6, y: 0 }, archetype: 'aggressive' },
      { id: 'ia2', pos: { x: 6, y: 6 }, archetype: 'aggressive' },
    ]);
    const { steps } = resolveAiTurnsLogged(state);
    const scenes = narrateAiTurns(steps);

    const ordemRelatada = steps
      .filter((s) => s.command.t === 'move' || s.command.t === 'engage')
      .map((s) => ('unitId' in s.command ? s.command.unitId : ''));
    const ordemNarrada = scenes.map((s) => (s.kind === 'move' ? s.unitId : s.duelResult.attackerId));
    expect(ordemNarrada).toEqual(ordemRelatada);
    // E as duas unidades aparecem: uma narração que só contasse a primeira deixaria a outra
    // teletransportando.
    expect(new Set(ordemNarrada)).toEqual(new Set(['ia1', 'ia2']));
  });

  it('lista de passos vazia produz lista de cenas vazia', () => {
    expect(narrateAiTurns([])).toEqual([]);
  });

  it('é pura: narrar duas vezes dá o mesmo, e a entrada não é mutada', () => {
    const state = comIaPendente([{ id: 'def', pos: { x: 3, y: 0 }, archetype: 'aggressive' }]);
    const { steps } = resolveAiTurnsLogged(state);
    const antes = JSON.stringify(steps);

    expect(JSON.stringify(narrateAiTurns(steps))).toBe(JSON.stringify(narrateAiTurns(steps)));
    expect(JSON.stringify(steps)).toBe(antes);
  });
});

describe('M16 4/N — a garantia anti-teletransporte', () => {
  // A propriedade que dá nome à fatia, e a única que prova que o defeito acabou: se uma peça
  // está num tile diferente depois do turno da IA, existe uma cena que a LEVA até lá. Sem isso
  // o jogador vê o inimigo aparecer noutro lugar e tem de deduzir por onde ele passou — e a
  // ameaça do round seguinte se decide olhando exatamente esse caminho (§1.1).
  function verificar(state: BattleState) {
    const { state: depois, steps } = resolveAiTurnsLogged(state);
    const scenes = narrateAiTurns(steps);
    const movimentos = cenasDeMovimento(scenes);
    expect(steps.length).toBeGreaterThan(0);

    for (const antes of state.units) {
      const final = depois.units.find((u) => u.unitId === antes.unitId);
      if (!final) continue;
      const mudou = final.pos.x !== antes.pos.x || final.pos.y !== antes.pos.y;
      const doUnit = movimentos.filter((m) => m.unitId === antes.unitId);

      if (!mudou) {
        // O recíproco importa tanto quanto: uma cena para quem não saiu do lugar faria a peça
        // andar na tela e voltar, mentindo sobre o que o core decidiu.
        expect(doUnit).toEqual([]);
        continue;
      }

      expect(doUnit.length).toBeGreaterThan(0);
      const ultimo = doUnit[doUnit.length - 1]!;
      expect(ultimo.path[ultimo.path.length - 1]).toEqual(final.pos);
      // E a primeira cena da peça começa onde ela estava antes do turno: junto com a linha
      // acima, isso fecha o percurso inteiro entre o tile de origem e o de destino.
      expect(doUnit[0]!.path[0]).toEqual(antes.pos);
    }
  }

  it('uma IA que persegue de longe: o percurso inteiro é narrado', () => {
    verificar(comIaPendente([{ id: 'def', pos: { x: 6, y: 6 }, archetype: 'aggressive' }]));
  });

  it('duas IAs perseguindo ao mesmo tempo: nenhuma das duas teletransporta', () => {
    verificar(
      comIaPendente([
        { id: 'ia1', pos: { x: 6, y: 0 }, archetype: 'aggressive' },
        { id: 'ia2', pos: { x: 6, y: 6 }, archetype: 'aggressive' },
      ]),
    );
  });

  it('uma IA que anda e engaja: quem só engajou não ganha cena de movimento', () => {
    verificar(comIaPendente([{ id: 'def', pos: { x: 3, y: 0 }, archetype: 'aggressive' }]));
  });

  it('IA que fica parada (hold-position fora de alcance) não produz cena nenhuma', () => {
    const state = comIaPendente([{ id: 'def', pos: { x: 6, y: 6 }, archetype: 'hold-position' }]);
    const { state: depois, steps } = resolveAiTurnsLogged(state);
    expect(steps.length).toBeGreaterThan(0); // ela AGIU (wait), só não se mexeu
    expect(narrateAiTurns(steps)).toEqual([]);
    expect(depois.units.find((u) => u.unitId === 'def')?.pos).toEqual({ x: 6, y: 6 });
  });
});
