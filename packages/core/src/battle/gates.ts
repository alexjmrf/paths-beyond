import {
  coordKey,
  DEFAULT_GATE,
  orthogonalNeighbors,
  tileAt,
  type Coord,
  type GateDef,
} from '../grid/types.js';
import type { BattleState, BattleUnit, GateProgress } from './types.js';

// §5.1 `Tile.object === 'gate'` + M15 D3, com o requisito acrescentado pelo usuário na
// aprovação do plano: o portão **abre por um lado e quebra pelo outro**.
//
// Onde mora o estado: no `BattleState`, não no `GridMap`. O mapa é a FASE (conteúdo de
// `packages/data`, imutável e compartilhado entre partidas); qual portão já caiu é da
// PARTIDA. Misturar os dois faria uma batalha editar o conteúdo da outra.
//
// Por que `wait` e não uma ação nova: §5.4 lista quatro ações e o `wait` já é condicional ao
// tile ("+1 AP se terminar sobre fort ou camp"). Por que durabilidade em turnos-unidade e não
// HP com fórmula de dano: arrombar não passa por `computeDamage`, não rola RNG, não vira alvo
// de duelo e não entra na matriz de `pnpm balance` — e "3 turnos para arrombar" é um número
// que o autor de fase controla direto.

const EMPTY_PROGRESS: GateProgress = { opened: false, hits: 0 };

// Devolve a definição do portão no tile, ou `undefined` se ali não há portão nenhum.
export function gateDefAt(state: BattleState, coord: Coord): GateDef | undefined {
  const tile = tileAt(state.map, coord);
  if (tile?.object !== 'gate') return undefined;
  return tile.gate ?? DEFAULT_GATE;
}

function progressAt(state: BattleState, coord: Coord): GateProgress {
  return state.gateState?.[coordKey(coord)] ?? EMPTY_PROGRESS;
}

export function isGateOpen(state: BattleState, coord: Coord): boolean {
  return progressAt(state, coord).opened;
}

// Consumido pelo pathfinding (`PathfindingContext.openGates`) e pelo cliente, que desenha o
// alcance com a mesma função que o core usa para revalidar (regra 3 do CLAUDE.md). Ordenado
// por chave para não depender da ordem de inserção do Record.
export function openGateCoords(state: BattleState): readonly Coord[] {
  const gateState = state.gateState;
  if (!gateState) return [];
  return Object.keys(gateState)
    .sort()
    .filter((key) => gateState[key]?.opened === true)
    .map((key) => {
      const [x, y] = key.split(',');
      return { x: Number(x), y: Number(y) };
    });
}

function canOpen(gate: GateDef, side: BattleUnit['side']): boolean {
  // `'none'` = trancado: ninguém abre, os dois lados arrombam.
  return gate.opensFor === 'any' || gate.opensFor === side;
}

// §5.4 — chamado quando a unidade ENCERRA o turno (`wait`). Abre o primeiro portão fechado
// ortogonalmente adjacente se o lado dela o abre; se não, bate nele. Ortogonal e não
// diagonal porque §5.1 fixa distância Manhattan para todo o grid.
//
// "O primeiro" na ordem de `orthogonalNeighbors` (cima, baixo, esquerda, direita): uma
// unidade encurralada entre dois portões precisa de um critério, e ele tem de ser
// determinístico — cliente, servidor e `sim-cli` têm de escolher o mesmo.
export function interactWithAdjacentGate(state: BattleState, unit: BattleUnit): BattleState {
  for (const neighbor of orthogonalNeighbors(unit.pos)) {
    const gate = gateDefAt(state, neighbor);
    if (!gate) continue;

    const key = coordKey(neighbor);
    const progress = state.gateState?.[key] ?? EMPTY_PROGRESS;
    if (progress.opened) continue;

    const next: GateProgress = canOpen(gate, unit.side)
      ? { opened: true, hits: progress.hits }
      : // Arrombar: mais um turno-unidade de pancada. Cai quando os golpes alcançam a
        // durabilidade declarada pelo tile.
        { opened: progress.hits + 1 >= gate.durability, hits: progress.hits + 1 };

    return { ...state, gateState: { ...state.gateState, [key]: next } };
  }

  return state;
}
