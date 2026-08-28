import {
  applyCommandAndAdvance,
  buildBattleSetupFromHeroes,
  buildInitialState,
  computeReachableTiles,
  coordKey,
  isInBounds,
  manhattanDistance,
  openGateCoords,
  orthogonalNeighbors,
  tileAt,
  type BattleCommand,
  type BattleSetup,
  type BattleState,
  type BattleUnit,
  type Coord,
  type GridMap,
  type HeroPlacement,
  type Id,
  type MoveType,
  type WinCondition,
} from '@paths-beyond/core';
import type { ContentCatalog, Encounter } from '../src/types.js';
import { toSummonBlueprintPlacements } from '../src/summonPlacements.js';

// M12, sub-sessão 3/N — piloto automático do lado do jogador, usado por
// `campanha.test.ts` pra provar que os 6 capítulos são JOGÁVEIS (o critério de aceite do
// milestone). Não é IA de jogo e por isso não mora em `packages/core`: é arnês de teste.
//
// Regras fixas, nesta ordem: anda em direção ao objetivo do mapa (quem o persegue),
// engaja o inimigo mais ferido ao alcance, senão persegue o inimigo mais perto, senão
// espera. Não escolhe skill (o script tático de §6.5 já decide isso sozinho no duelo), não
// gasta Valor e não lança skill de mapa — o piso, não o teto, do que um humano faz.

export const CAMPAIGN_SEED = 42;

// Teto de comandos por batalha. Não é regra de jogo: é o que impede um mapa mal autorado
// (objetivo inalcançável) de virar um teste que roda pra sempre em vez de falhar.
export const COMMAND_BUDGET = 400;

export function setupFor(catalog: ContentCatalog, encounter: Encounter): BattleSetup {
  const arenaMap = catalog.maps[encounter.mapId];
  if (!arenaMap) throw new Error(`mapa desconhecido: ${encounter.mapId}`);

  const placements: HeroPlacement[] = encounter.units.map((unit) => ({
    unitId: unit.unitId,
    hero: unit.hero,
    classDef: catalog.classes[unit.hero.classId]!,
    equippedItems: Object.values(unit.hero.equipment)
      .filter((id): id is Id => id !== null)
      .map((id) => catalog.items[id]!),
    side: unit.side,
    pos: unit.pos,
    height: unit.height,
    ...(unit.aiArchetype ? { aiArchetype: unit.aiArchetype } : {}),
  }));

  return buildBattleSetupFromHeroes({
    placements,
    map: arenaMap.grid,
    permadeath: encounter.permadeath,
    winCondition: encounter.winCondition ?? arenaMap.winCondition,
    effectDefs: catalog.effects,
    initialValor: arenaMap.initialValor,
    itemSets: catalog.itemSets,
    skillsCatalog: catalog.skills,
    weaponDuelRanges: catalog.weaponDuelRanges,
    baselineReactionSkillIds: catalog.baselineReactionSkillIds,
    // Mesmo setup que o cliente monta (M12, sub-sessão 4/N): o replay gravado aqui só
    // vale como prova se a batalha for montada do mesmo jeito que a de verdade.
    valorSkills: catalog.valorSkills,
    // §5.6 (M15 2/N) — o piloto não invoca (ele não gasta Valor), mas a batalha tem de ser
    // montada do MESMO jeito que a do cliente: o replay gravado aqui só vale como prova se
    // o `BattleSetup` for idêntico ao real.
    summonBlueprints: toSummonBlueprintPlacements(catalog),
  });
}

// Quem persegue o objetivo do mapa e quem persegue inimigo. É a única "tática" do piloto,
// e sai da condição de vitória: em `escort` quem tem que chegar é a escoltada e mais
// ninguém; em `seize`/`defend` basta uma unidade qualquer, e o piloto elege a primeira da
// ordem de iniciativa pra que as outras cubram a frente.
function objectiveFor(
  condition: WinCondition,
  unit: BattleUnit,
  objectiveUnitId: Id | undefined,
): Coord | undefined {
  switch (condition.t) {
    case 'rout':
    case 'surviveRounds':
      return undefined;
    case 'escort':
      return unit.unitId === condition.unitId ? condition.target : undefined;
    case 'seize':
    case 'defend':
      return unit.unitId === objectiveUnitId ? condition.target : undefined;
  }
}

function reachableFor(state: BattleState, unit: BattleUnit): ReturnType<typeof computeReachableTiles> {
  const allies = state.units
    .filter((u) => u.side === unit.side && u.unitId !== unit.unitId && u.hp > 0)
    .map((u) => u.pos);
  const enemies = state.units.filter((u) => u.side !== unit.side && u.hp > 0).map((u) => u.pos);
  const remaining = unit.moveRange - (state.distanceMovedThisTurn[unit.unitId] ?? 0);
  return computeReachableTiles(
    {
      map: state.map,
      moveType: unit.moveType,
      occupiedByAlly: allies,
      occupiedByEnemy: enemies,
      // §5.1 (M15 D3) — muro e portão fechado bloqueiam; portão já aberto, não.
      openGates: openGateCoords(state),
    },
    unit.pos,
    remaining,
  );
}

// Distância em TILES ANDADOS até `goal`, por BFS sobre o terreno que este `moveType`
// atravessa (unidades ignoradas: elas se movem, a montanha não).
//
// Sem isto o piloto media distância Manhattan e empacava: num mapa com muralha, todo tile
// alcançado "aproxima" até bater na pedra, e a passagem — que fica PARA TRÁS em linha
// reta — nunca é escolhida. Andar em volta do obstáculo é a coisa mais básica que um
// humano faz, então o arnês precisa fazer também, senão o teste mede a burrice do piloto
// em vez de mediar a jogabilidade do mapa.
//
// M15 (D3) acrescentou a segunda metade da mesma ideia: `wall` é parede e sai da rota, mas
// **portão fechado CONTINUA na rota**. Um portão é caminho — só custa abri-lo. Tratá-lo como
// parede faria o piloto dar a fortaleza do capítulo 6 por inalcançável e ficar rondando a
// muralha; deixando-o na rota, o piloto anda até ele, descobre que não consegue passar
// (`computeReachableTiles`, que conhece o bloqueio de verdade, não devolve o tile), e cai no
// `wait` — que é exatamente o comando que arromba. Derrubar a porta da frente é o piso do
// que um humano faz, e não precisou de regra nova no piloto para acontecer.
function routeDistances(map: GridMap, moveType: MoveType, goal: Coord): ReadonlyMap<string, number> {
  const dist = new Map<string, number>([[coordKey(goal), 0]]);
  let frontier: Coord[] = [goal];

  while (frontier.length > 0) {
    const next: Coord[] = [];
    for (const coord of frontier) {
      const base = dist.get(coordKey(coord))!;
      for (const neighbor of orthogonalNeighbors(coord)) {
        if (!isInBounds(map, neighbor)) continue;
        const key = coordKey(neighbor);
        if (dist.has(key)) continue;
        const tile = tileAt(map, neighbor);
        if (!tile) continue;
        if (tile.object === 'wall') continue;
        if (map.terrains[tile.terrain]?.moveCost[moveType] === 'impassable') continue;
        dist.set(key, base + 1);
        next.push(neighbor);
      }
    }
    frontier = next;
  }

  return dist;
}

// Um tile que um inimigo vivo alcança e engaja no turno seguinte. Só a escoltada evita:
// o resto da party existe justamente pra entrar no alcance.
function isThreatened(state: BattleState, unit: BattleUnit, coord: Coord): boolean {
  return state.units.some(
    (enemy) =>
      enemy.side !== unit.side &&
      enemy.hp > 0 &&
      manhattanDistance(coord, enemy.pos) <= enemy.moveRange + enemy.duelRange,
  );
}

// Passo que mais aproxima do objetivo pela ROTA; empate resolvido pelo menor custo de
// movimento e depois pela coordenada, pra o piloto ser determinístico como tudo o mais.
function stepToward(state: BattleState, unit: BattleUnit, goal: Coord, avoidThreat = false): BattleCommand | undefined {
  const route = routeDistances(state.map, unit.moveType, goal);
  const current = route.get(coordKey(unit.pos)) ?? Infinity;
  const best = [...reachableFor(state, unit)]
    .map((tile) => ({ tile, distance: route.get(coordKey(tile.coord)) ?? Infinity }))
    .filter((entry) => entry.distance < current)
    .filter((entry) => !avoidThreat || !isThreatened(state, unit, entry.tile.coord))
    .sort((a, b) => {
      if (a.distance !== b.distance) return a.distance - b.distance;
      if (a.tile.cost !== b.tile.cost) return a.tile.cost - b.tile.cost;
      return a.tile.coord.y - b.tile.coord.y || a.tile.coord.x - b.tile.coord.x;
    })[0];
  return best ? { t: 'move', unitId: unit.unitId, path: best.tile.path } : undefined;
}

function decidePlayerCommand(state: BattleState, unit: BattleUnit, objectiveUnitId: Id | undefined): BattleCommand {
  const goal = objectiveFor(state.winCondition, unit, objectiveUnitId);

  // A escoltada não briga: perdê-la é derrota imediata (§5.7), então o piloto a mantém
  // andando. As outras unidades é que seguram a linha.
  const avoidsCombat = state.winCondition.t === 'escort' && unit.unitId === state.winCondition.unitId;
  const enemies = state.units.filter((u) => u.side !== unit.side && u.hp > 0);

  if (goal) {
    // A escoltada só avança para tile que nenhum inimigo alcança no turno seguinte, e
    // espera atrás da linha enquanto não houver um. É o mínimo que um humano faz com uma
    // unidade cuja morte encerra a partida — sem isso o piloto a entrega na emboscada e o
    // teste mediria a imprudência dele, não o mapa.
    if (manhattanDistance(unit.pos, goal) > 0) {
      const step = stepToward(state, unit, goal, avoidsCombat);
      if (step) return step;
    }
    if (avoidsCombat) return { t: 'wait', unitId: unit.unitId };
  }

  const inRange = enemies.filter((enemy) => manhattanDistance(unit.pos, enemy.pos) <= unit.duelRange);
  const target = [...inRange].sort((a, b) => a.hp - b.hp || (a.unitId < b.unitId ? -1 : 1))[0];
  if (target) return { t: 'engage', unitId: unit.unitId, targetId: target.unitId };

  if (!goal && enemies.length > 0) {
    const nearest = [...enemies].sort(
      (a, b) =>
        manhattanDistance(unit.pos, a.pos) - manhattanDistance(unit.pos, b.pos) || (a.unitId < b.unitId ? -1 : 1),
    )[0]!;
    const step = stepToward(state, unit, nearest.pos);
    if (step) return step;
  }

  return { t: 'wait', unitId: unit.unitId };
}

export interface PlaythroughResult {
  readonly state: BattleState;
  readonly commands: number;
  // M13, sub-sessão 1/N — a sequência de comandos emitida, na ordem. É o que um `Replay`
  // guarda (§3.4: `{rulesVersion, seed, initialState, commands}`), e é o que permite
  // testar reprodução sem depender de UI: o piloto joga, a jogada vira replay, o replay é
  // reaplicado e tem que dar o mesmo estado final.
  readonly commandLog: readonly BattleCommand[];
}

export function playthrough(
  catalog: ContentCatalog,
  encounter: Encounter,
  seed: number = CAMPAIGN_SEED,
): PlaythroughResult {
  let state = buildInitialState(setupFor(catalog, encounter), seed);
  const commandLog: BattleCommand[] = [];
  let commands = 0;

  while (state.outcome === 'ongoing' && commands < COMMAND_BUDGET) {
    // Quem carrega o objetivo em `seize`/`defend` é a primeira unidade VIVA na ordem de
    // iniciativa, reavaliada a cada comando: fixar o portador no início deixaria o mapa
    // sem ninguém indo ao objetivo assim que ele morresse — e a partida rodaria até o teto
    // de comandos com o objetivo a um tile de distância.
    const objectiveUnitId = state.initiativeOrder
      .map((entry) => state.units.find((u) => u.unitId === entry.unitId))
      .find((u): u is BattleUnit => !!u && u.side === 'player' && u.hp > 0)?.unitId;

    // Ordem FIXA de iniciativa (§5.3), a mesma que a IA usa: o piloto não pode depender da
    // ordem de montagem de `state.units`.
    const next = state.initiativeOrder
      .map((entry) => state.units.find((u) => u.unitId === entry.unitId))
      .find((u): u is BattleUnit => !!u && u.side === 'player' && u.hp > 0 && !u.hasActedThisRound);
    if (!next) break; // só sobrou IA pendente ou ninguém — `applyCommandAndAdvance` já drenou

    const command = decidePlayerCommand(state, next, objectiveUnitId);
    const outcome = applyCommandAndAdvance(state, command);
    commands += 1;
    commandLog.push(command);
    if (!outcome.applied) {
      // Comando rejeitado seria laço infinito: falha alto com o motivo real.
      throw new Error(`${encounter.id}: comando rejeitado para ${next.unitId}: ${outcome.reason}`);
    }
    state = outcome.state;
  }

  return { state, commands, commandLog };
}
