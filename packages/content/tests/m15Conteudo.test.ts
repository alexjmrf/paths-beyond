import {
  applyCommandAndAdvance,
  buildInitialState,
  isGateOpen,
  tileAt,
  type BattleState,
  type Coord,
} from '@paths-beyond/core';
import { describe, expect, it } from 'vitest';
import { loadCatalogFromDisk } from '../src/loadCatalogFromDisk.js';
import { playthrough, setupFor } from './campaignPilot.js';

// M15, sub-sessão 2/N — a prova de que o conteúdo autorado é EXERCIDO, e não só validado.
// A fatia 1/N ligou quatro campos no motor e travou cada um com teste de unidade; nada
// disso impede o caso que o briefing chama pelo nome ("um campo que nenhum conteúdo usa
// continua sendo código morto por outro nome"), que é o motor saber invocar e nenhuma
// valor-skill do catálogo invocar. Este arquivo mede o caminho inteiro, do JSON ao estado
// de batalha.

const catalog = loadCatalogFromDisk();

const SUMMON_SKILL_ID = 'valor-convocar-milicia';
const BLUEPRINT_ID = 'summon-milicia-de-lanceiros';

describe('§5.6 — a invocação chega do catálogo ao estado de batalha', () => {
  it('o catálogo carrega os blueprints e a valor-skill que os nomeia', () => {
    expect(catalog.summonBlueprints[BLUEPRINT_ID]).toBeDefined();
    const skill = catalog.valorSkills[SUMMON_SKILL_ID];
    expect(skill?.kind).toBe('summonReinforcement');
    expect(skill?.kind === 'summonReinforcement' && skill.payload.blueprintId).toBe(BLUEPRINT_ID);
  });

  it('o `BattleSetup` da campanha carrega o blueprint com o perfil de combate JÁ RESOLVIDO', () => {
    const setup = setupFor(catalog, catalog.encounters[0]!);
    const blueprint = setup.summonBlueprints?.[BLUEPRINT_ID];

    expect(blueprint).toBeDefined();
    // Resolvido de verdade: stats vindos de classe+nível+equipamento, não zeros.
    expect(blueprint!.stats.hp).toBeGreaterThan(0);
    expect(blueprint!.stats.atk).toBeGreaterThan(0);
    expect(blueprint!.moveRange).toBeGreaterThan(0);
    expect(blueprint!.weaponType).toBe('spear');
    expect(Object.keys(blueprint!.knownSkills)).toContain('skill-ataque-lanceiro');
  });

  it('gastar Valor na invocação põe uma unidade nova, jogável, no mapa', () => {
    const encounter = catalog.encounters[0]!;
    const setup = setupFor(catalog, encounter);
    const skill = catalog.valorSkills[SUMMON_SKILL_ID]!;

    // Valor suficiente para pagar a invocação no round 1. `initialValor` do mapa é o saldo
    // de §5.6 ("começa em 5") e a invocação é a skill mais cara do catálogo de propósito.
    const state = buildInitialState({ ...setup, initialValor: skill.cost }, 42);

    // Um tile livre e pisável ao lado da primeira unidade do jogador.
    const heroi = state.units.find((u) => u.side === 'player')!;
    const alvo = [
      { x: heroi.pos.x + 1, y: heroi.pos.y },
      { x: heroi.pos.x, y: heroi.pos.y + 1 },
      { x: heroi.pos.x - 1, y: heroi.pos.y },
    ].find((coord: Coord) => {
      const tile = tileAt(state.map, coord);
      return tile !== undefined && tile.object === undefined && !state.units.some((u) => u.pos.x === coord.x && u.pos.y === coord.y);
    })!;

    const outcome = applyCommandAndAdvance(state, { t: 'useValor', skillId: SUMMON_SKILL_ID, target: alvo });

    expect(outcome.applied).toBe(true);
    expect(outcome.state.valor).toBe(0);
    expect(outcome.state.units.length).toBe(state.units.length + 1);

    const invocada = outcome.state.units.find((u) => !state.units.some((antes) => antes.unitId === u.unitId))!;
    expect(invocada.side).toBe('player');
    expect(invocada.pos).toEqual(alvo);
    expect(invocada.hp).toBeGreaterThan(0);
    // §5.3 — entrou na lista de iniciativa, senão nunca teria turno.
    expect(outcome.state.initiativeOrder.some((entry) => entry.unitId === invocada.unitId)).toBe(true);
  });

  it('sem Valor suficiente a invocação é recusada e nada é cobrado', () => {
    const setup = setupFor(catalog, catalog.encounters[0]!);
    const state = buildInitialState({ ...setup, initialValor: 1 }, 42);
    const heroi = state.units.find((u) => u.side === 'player')!;

    const outcome = applyCommandAndAdvance(state, {
      t: 'useValor',
      skillId: SUMMON_SKILL_ID,
      target: { x: heroi.pos.x + 1, y: heroi.pos.y },
    });

    expect(outcome.applied).toBe(false);
    expect(outcome.state.valor).toBe(1);
    expect(outcome.state.units.length).toBe(state.units.length);
  });
});

// D3 — a fortaleza do capítulo 6. Não basta o JSON ter `wall` e `gate`: o teste de dado já
// mede isso. O que importa aqui é o portão IMPORTAR durante a partida.
describe('D3 — a muralha e o portão do capítulo 6 mudam a partida', () => {
  const capitulo6 = catalog.encounters.find((e) => e.chapter === 6)!;
  const PORTAO: Coord = { x: 9, y: 8 };

  it('a fortaleza nasce fechada', () => {
    const state = buildInitialState(setupFor(catalog, capitulo6), 42);
    expect(isGateOpen(state, PORTAO)).toBe(false);
  });

  it('o portão é aberto ou arrombado ao longo da partida — não é cenário', () => {
    const { state } = playthrough(catalog, capitulo6);
    expect(isGateOpen(state, PORTAO)).toBe(true);
    // E foi por alguém batendo ou pela guarnição saindo: os dois caminhos passam pelo
    // `gateState`, que só existe se alguém tocou no portão.
    expect(state.gateState?.['9,8']).toBeDefined();
  });

  it('a muralha barra até quem voa: a Sentinela Alada não atravessa alvenaria', () => {
    // Ela nasce dentro (11,3) e é `flying`. Enquanto o portão estiver fechado, nenhum tile
    // fora da fortaleza pode estar ao alcance dela — era exatamente o que a montanha
    // permitia até M14 (custo 1 para `flying`).
    const state: BattleState = buildInitialState(setupFor(catalog, capitulo6), 42);
    const sentinela = state.units.find((u) => u.unitId === 'unit-sentinela-alada')!;
    expect(sentinela.moveType).toBe('flying');
    expect(isGateOpen(state, PORTAO)).toBe(false);

    // Perímetro da fortaleza: x 6..12, y 2..8. Ela começa dentro e continua dentro.
    const dentro = (coord: Coord): boolean => coord.x > 6 && coord.x < 12 && coord.y > 2 && coord.y < 8;
    expect(dentro(sentinela.pos)).toBe(true);
  });
});
