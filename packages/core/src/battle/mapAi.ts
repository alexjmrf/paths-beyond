import { fpDiv } from '../math/fixed.js';
import { computeReachableTiles, type ReachableTile } from '../grid/pathfinding.js';
import { manhattanDistance, type Coord } from '../grid/types.js';
import { openGateCoords } from './gates.js';
import type { Id } from '../types.js';
import type { BattleCommand, BattleState, BattleUnit, MapAiArchetype } from './types.js';

// §9.1 — "IA de mapa declarativa por herói: aggressive | hold-position | guard-tile |
// flank | support-nearest." A spec só nomeia os 5 arquétipos; o algoritmo de cada um foi
// desenhado com o usuário nesta sub-sessão (ver DECISIONS.md) — literal, sem heurística
// nem busca, reaproveitando só primitivas já existentes (mesmo espírito do algoritmo de
// táticas de duelo, §6.3: previsibilidade é o produto). Decide UM comando por chamada —
// o chamador (`resolveAiTurns`, battle/aiTurn.ts, M7 sub-sessão 6) chama de novo pra
// mesma unidade se o comando devolvido não encerrar o turno (`move` não encerra;
// `engage`/`wait` encerram). `MapAiArchetype` mora em battle/types.ts (ver ali) —
// reexportado aqui só por compatibilidade de import.
export type { MapAiArchetype } from './types.js';

// Constante do motor, não conteúdo de packages/data (mesmo padrão de
// DEFEND_DAMAGE_REDUCTION_PCT/ASSIST_DAMAGE_MULTIPLIER) — quantos tiles guard-tile pode
// se afastar da posição atual pra interceptar um inimigo, em vez do moveRange inteiro.
export const GUARD_LEASH_TILES = 2;

export interface DecideMapAiCommandInput {
  readonly state: BattleState;
  readonly unitId: Id;
  readonly archetype: MapAiArchetype;
}

function hpPct(unit: BattleUnit): number {
  return unit.stats.hp > 0 ? fpDiv(unit.hp, unit.stats.hp) : 0;
}

function byUnitId(a: BattleUnit, b: BattleUnit): number {
  if (a.unitId < b.unitId) return -1;
  if (a.unitId > b.unitId) return 1;
  return 0;
}

function livingEnemies(state: BattleState, unit: BattleUnit): readonly BattleUnit[] {
  return state.units.filter((u) => u.side !== unit.side && u.hp > 0);
}

function livingAllies(state: BattleState, unit: BattleUnit): readonly BattleUnit[] {
  return state.units.filter((u) => u.side === unit.side && u.unitId !== unit.unitId && u.hp > 0);
}

function enemiesInRange(state: BattleState, unit: BattleUnit, range: number): readonly BattleUnit[] {
  return livingEnemies(state, unit).filter((e) => manhattanDistance(unit.pos, e.pos) <= range);
}

function countAdjacentAllies(target: Coord, allies: readonly BattleUnit[]): number {
  return allies.filter((a) => manhattanDistance(a.pos, target) === 1).length;
}

// Desempate: menor HP% primeiro, depois menor unitId — nunca aleatório (motor não decide
// por acaso fora de rngFor, e isso nem é uma rolagem, é uma prioridade fixa).
function pickLowestHp(units: readonly BattleUnit[]): BattleUnit | undefined {
  if (units.length === 0) return undefined;
  return [...units].sort((a, b) => {
    const diff = hpPct(a) - hpPct(b);
    if (diff !== 0) return diff;
    return byUnitId(a, b);
  })[0];
}

function nearestUnit(from: Coord, candidates: readonly BattleUnit[]): BattleUnit | undefined {
  if (candidates.length === 0) return undefined;
  return [...candidates].sort((a, b) => {
    const diff = manhattanDistance(from, a.pos) - manhattanDistance(from, b.pos);
    if (diff !== 0) return diff;
    return byUnitId(a, b);
  })[0];
}

function reachableTilesFor(state: BattleState, unit: BattleUnit, moveRange: number): readonly ReachableTile[] {
  const alreadyMoved = state.distanceMovedThisTurn[unit.unitId] ?? 0;
  const remaining = moveRange - alreadyMoved;
  if (remaining <= 0) return [];
  const allies = livingAllies(state, unit).map((u) => u.pos);
  const enemies = livingEnemies(state, unit).map((u) => u.pos);
  return computeReachableTiles(
    {
      map: state.map,
      moveType: unit.moveType,
      occupiedByAlly: allies,
      occupiedByEnemy: enemies,
      // §5.1 (M15 D3) — a IA enxerga muro e portão exatamente como o jogador: o alcance vem
      // da mesma função. Nada de arquétipo novo nem de heurística de porta (regra 6).
      openGates: openGateCoords(state),
    },
    unit.pos,
    remaining,
  );
}

// Entre os tiles alcançáveis, o que mais reduz a distância até `target` (tem que reduzir
// estritamente — senão a unidade "andaria" sem motivo). Desempate: menor y, depois menor x.
function bestTileToward(reachable: readonly ReachableTile[], from: Coord, target: Coord): ReachableTile | undefined {
  const currentDist = manhattanDistance(from, target);
  const candidates = reachable.filter((t) => manhattanDistance(t.coord, target) < currentDist);
  if (candidates.length === 0) return undefined;
  return [...candidates].sort((a, b) => {
    const da = manhattanDistance(a.coord, target);
    const db = manhattanDistance(b.coord, target);
    if (da !== db) return da - db;
    if (a.coord.y !== b.coord.y) return a.coord.y - b.coord.y;
    return a.coord.x - b.coord.x;
  })[0];
}

function moveOrWait(unit: BattleUnit, best: ReachableTile | undefined): BattleCommand {
  if (best) return { t: 'move', unitId: unit.unitId, path: best.path };
  return { t: 'wait', unitId: unit.unitId };
}

// aggressive / guard-tile compartilham a mesma lógica — só o alcance de movimento
// considerado muda (guard-tile usa um leash curto, aggressive usa o moveRange inteiro).
function decideChase(state: BattleState, unit: BattleUnit, moveRange: number): BattleCommand {
  const inRange = enemiesInRange(state, unit, unit.duelRange);
  if (inRange.length > 0) {
    const target = pickLowestHp(inRange);
    if (target) return { t: 'engage', unitId: unit.unitId, targetId: target.unitId };
  }

  const nearest = nearestUnit(unit.pos, livingEnemies(state, unit));
  if (!nearest) return { t: 'wait', unitId: unit.unitId };

  const reachable = reachableTilesFor(state, unit, moveRange);
  return moveOrWait(unit, bestTileToward(reachable, unit.pos, nearest.pos));
}

function decideHoldPosition(state: BattleState, unit: BattleUnit): BattleCommand {
  const inRange = enemiesInRange(state, unit, unit.duelRange);
  const target = pickLowestHp(inRange);
  if (target) return { t: 'engage', unitId: unit.unitId, targetId: target.unitId };
  return { t: 'wait', unitId: unit.unitId };
}

// Prioriza alvos que já têm aliado adjacente (Flanco/Cerco, mesma regra de contagem de
// positional.ts) — tanto pra escolher quem engajar dentre vários já em alcance quanto pra
// escolher rumo a quem se mover quando ninguém está em alcance ainda. Sem nenhum alvo com
// suporte de aliado, o comportamento cai pro mesmo do aggressive (mais próximo).
function decideFlank(state: BattleState, unit: BattleUnit): BattleCommand {
  const allies = livingAllies(state, unit);
  const inRange = enemiesInRange(state, unit, unit.duelRange);

  if (inRange.length > 0) {
    const target = [...inRange].sort((a, b) => {
      const bonusDiff = countAdjacentAllies(b.pos, allies) - countAdjacentAllies(a.pos, allies);
      if (bonusDiff !== 0) return bonusDiff;
      const hpDiff = hpPct(a) - hpPct(b);
      if (hpDiff !== 0) return hpDiff;
      return byUnitId(a, b);
    })[0];
    if (target) return { t: 'engage', unitId: unit.unitId, targetId: target.unitId };
  }

  const enemies = livingEnemies(state, unit);
  if (enemies.length === 0) return { t: 'wait', unitId: unit.unitId };

  const target = [...enemies].sort((a, b) => {
    const bonusDiff = countAdjacentAllies(b.pos, allies) - countAdjacentAllies(a.pos, allies);
    if (bonusDiff !== 0) return bonusDiff;
    const distDiff = manhattanDistance(unit.pos, a.pos) - manhattanDistance(unit.pos, b.pos);
    if (distDiff !== 0) return distDiff;
    return byUnitId(a, b);
  })[0];
  if (!target) return { t: 'wait', unitId: unit.unitId };

  const reachable = reachableTilesFor(state, unit, unit.moveRange);
  return moveOrWait(unit, bestTileToward(reachable, unit.pos, target.pos));
}

function nearestEnemyDistance(from: Coord, enemies: readonly BattleUnit[]): number {
  return Math.min(...enemies.map((e) => manhattanDistance(from, e.pos)));
}

// Ainda revida se for atacado (não fica parado apanhando), mas prioriza ficar dentro do
// assistRange do aliado mais perto de um inimigo ("linha de frente") em vez de buscar
// briga própria.
function decideSupportNearest(state: BattleState, unit: BattleUnit): BattleCommand {
  const inRange = enemiesInRange(state, unit, unit.duelRange);
  const directTarget = pickLowestHp(inRange);
  if (directTarget) return { t: 'engage', unitId: unit.unitId, targetId: directTarget.unitId };

  const allies = livingAllies(state, unit);
  const enemies = livingEnemies(state, unit);
  if (allies.length === 0 || enemies.length === 0) return { t: 'wait', unitId: unit.unitId };

  const frontAlly = [...allies].sort((a, b) => {
    const diff = nearestEnemyDistance(a.pos, enemies) - nearestEnemyDistance(b.pos, enemies);
    if (diff !== 0) return diff;
    return byUnitId(a, b);
  })[0];
  if (!frontAlly) return { t: 'wait', unitId: unit.unitId };

  if (manhattanDistance(unit.pos, frontAlly.pos) <= unit.assistRange) {
    return { t: 'wait', unitId: unit.unitId };
  }

  const reachable = reachableTilesFor(state, unit, unit.moveRange);
  return moveOrWait(unit, bestTileToward(reachable, unit.pos, frontAlly.pos));
}

export function decideMapAiCommand(input: DecideMapAiCommandInput): BattleCommand {
  const { state, unitId, archetype } = input;
  const unit = state.units.find((u) => u.unitId === unitId);
  if (!unit || unit.hp <= 0) return { t: 'wait', unitId };

  switch (archetype) {
    case 'aggressive':
      return decideChase(state, unit, unit.moveRange);
    case 'guard-tile':
      return decideChase(state, unit, Math.min(unit.moveRange, GUARD_LEASH_TILES));
    case 'hold-position':
      return decideHoldPosition(state, unit);
    case 'flank':
      return decideFlank(state, unit);
    case 'support-nearest':
      return decideSupportNearest(state, unit);
  }
}
