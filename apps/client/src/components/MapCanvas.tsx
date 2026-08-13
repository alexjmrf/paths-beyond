import { computeReachableTiles, manhattanDistance, type BattleUnit, type Coord } from '@paths-beyond/core';
import { Application, Container, Graphics, Text, type Ticker } from 'pixi.js';
import { useEffect, useRef } from 'react';
import { useBattleStore } from '../store/battleStore.js';

const TILE_SIZE = 36;
const MOVE_MS_PER_TILE = 140; // §11/roadmap M6 — animação de movimento (pulada em instantResultMode)

function tileCenter(coord: Coord): { x: number; y: number } {
  return { x: coord.x * TILE_SIZE + TILE_SIZE / 2, y: coord.y * TILE_SIZE + TILE_SIZE / 2 };
}

// As chaves são os `TerrainId` REAIS de `packages/data/terrains/*.json`. Eram
// `plain`/`forest`/`mountain` (os ids dos fixtures de M6) e nenhuma batia desde que M9
// trocou o conteúdo de demonstração pelo catálogo real — o mapa inteiro caía no cinza de
// fallback. Ficou invisível enquanto todo mapa de campanha era planície pura; com o
// terreno real de M12 (sub-sessão 3/N), floresta e montanha mudam movimento, defesa e
// evasão, e o jogador precisa ver onde estão.
const TERRAIN_COLORS: Record<string, number> = {
  'terrain-planicie': 0x8fbc5a,
  'terrain-floresta': 0x2f5d34,
  'terrain-montanha': 0x8a8a86,
};

const SIDE_COLORS: Record<string, number> = {
  player: 0x3b82f6,
  enemy: 0xdc2626,
};

function tileKey(coord: Coord): string {
  return `${coord.x},${coord.y}`;
}

// §11 — "Overlay de movimento e de ameaça". Ameaça = tiles que uma unidade inimiga viva
// consegue alcançar (moveRange) e, de lá, engajar (duelRange). Simplificação de M6: não
// considera ZoC/ocupação ao redor de OUTROS inimigos, só do próprio mapa — refinamento
// fica pra uma fatia futura de polish.
function computeThreatenedTiles(battleState: ReturnType<typeof useBattleStore.getState>['battleState']): Set<string> {
  const threatened = new Set<string>();
  const enemies = battleState.units.filter((u) => u.side === 'enemy' && u.hp > 0);

  for (const enemy of enemies) {
    const allies = battleState.units.filter((u) => u.side === enemy.side && u.unitId !== enemy.unitId && u.hp > 0).map((u) => u.pos);
    const foes = battleState.units.filter((u) => u.side !== enemy.side && u.hp > 0).map((u) => u.pos);
    const reachable = computeReachableTiles(
      { map: battleState.map, moveType: enemy.moveType, occupiedByAlly: allies, occupiedByEnemy: foes },
      enemy.pos,
      enemy.moveRange,
    );
    const fromTiles = [enemy.pos, ...reachable.map((r) => r.coord)];
    for (const from of fromTiles) {
      for (let dx = -enemy.duelRange; dx <= enemy.duelRange; dx++) {
        for (let dy = -enemy.duelRange; dy <= enemy.duelRange; dy++) {
          const candidate = { x: from.x + dx, y: from.y + dy };
          if (manhattanDistance(from, candidate) > enemy.duelRange) continue;
          if (candidate.x < 0 || candidate.y < 0 || candidate.x >= battleState.map.width || candidate.y >= battleState.map.height) continue;
          threatened.add(tileKey(candidate));
        }
      }
    }
  }

  return threatened;
}

function unitAt(units: readonly BattleUnit[], coord: Coord): BattleUnit | undefined {
  return units.find((u) => u.hp > 0 && u.pos.x === coord.x && u.pos.y === coord.y);
}

// Inimigos que a unidade selecionada pode engajar agora mesmo (dentro do duelRange, a
// partir da posição atual — sem contar movimento pendente).
function computeEngageableEnemyIds(units: readonly BattleUnit[], selectedUnit: BattleUnit | undefined): Set<string> {
  const ids = new Set<string>();
  if (!selectedUnit || selectedUnit.hasActedThisRound) return ids;
  for (const unit of units) {
    if (unit.hp <= 0 || unit.side === selectedUnit.side) continue;
    if (manhattanDistance(selectedUnit.pos, unit.pos) <= selectedUnit.duelRange) ids.add(unit.unitId);
  }
  return ids;
}

export function MapCanvas() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const appRef = useRef<Application | null>(null);
  const layerRef = useRef<Container | null>(null);
  const animatingUnitIdRef = useRef<string | null>(null);

  const battleState = useBattleStore((s) => s.battleState);
  const selectedUnitId = useBattleStore((s) => s.selectedUnitId);
  const reachableTiles = useBattleStore((s) => s.reachableTiles);
  const duelPreview = useBattleStore((s) => s.duelPreview);
  const instantResultMode = useBattleStore((s) => s.instantResultMode);
  const selectUnit = useBattleStore((s) => s.selectUnit);
  const moveSelectedUnitTo = useBattleStore((s) => s.moveSelectedUnitTo);
  const previewEngage = useBattleStore((s) => s.previewEngage);
  const targetingMode = useBattleStore((s) => s.targetingMode);
  const confirmTargetAt = useBattleStore((s) => s.confirmTargetAt);

  // Anima um "fantasma" deslizando tile a tile pelo `path` antes de commitar o movimento
  // de verdade — o estado do core só muda quando a animação termina (`moveSelectedUnitTo`
  // no fim do tick), nunca durante; puramente apresentação por cima do que o core já
  // calculou. Pulado inteiramente com `instantResultMode` ligado (§11 — "modo resultado
  // instantâneo... essencial pra farm").
  function animateAndMove(unit: BattleUnit, path: readonly Coord[], destination: Coord) {
    const app = appRef.current;
    const layer = layerRef.current;
    if (!app || !layer || path.length < 2) {
      moveSelectedUnitTo(destination);
      return;
    }

    animatingUnitIdRef.current = unit.unitId;
    redraw();

    const color = SIDE_COLORS[unit.side] ?? 0xffffff;
    const ghost = new Graphics();
    layer.addChild(ghost);

    const centers = path.map(tileCenter);
    let segment = 0;
    let segmentElapsed = 0;

    const draw = (x: number, y: number) => {
      ghost.clear();
      ghost.circle(x, y, TILE_SIZE / 2 - 4).fill(color);
    };
    draw(centers[0]!.x, centers[0]!.y);

    const tick = (ticker: Ticker) => {
      segmentElapsed += ticker.deltaMS;
      const from = centers[segment]!;
      const to = centers[segment + 1]!;
      const t = Math.min(1, segmentElapsed / MOVE_MS_PER_TILE);
      draw(from.x + (to.x - from.x) * t, from.y + (to.y - from.y) * t);

      if (t >= 1) {
        segment += 1;
        segmentElapsed = 0;
        if (segment >= centers.length - 1) {
          app.ticker.remove(tick);
          if (ghost.parent) ghost.parent.removeChild(ghost);
          ghost.destroy();
          animatingUnitIdRef.current = null;
          moveSelectedUnitTo(destination);
        }
      }
    };
    app.ticker.add(tick);
  }

  useEffect(() => {
    let disposed = false;
    const app = new Application();

    void app
      .init({
        width: battleState.map.width * TILE_SIZE,
        height: battleState.map.height * TILE_SIZE,
        background: '#111827',
        antialias: true,
      })
      .then(() => {
        if (disposed) {
          app.destroy(true);
          return;
        }
        appRef.current = app;
        containerRef.current?.appendChild(app.canvas);
        const layer = new Container();
        app.stage.addChild(layer);
        layerRef.current = layer;
        redraw();
      });

    return () => {
      disposed = true;
      layerRef.current = null;
      appRef.current?.destroy(true);
      appRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    // A campanha real (M12, sub-sessão 3/N) deixou de ser toda 15×15: há mapas 16×16,
    // 18×18 e 20×15. O `Application` é inicializado uma vez com o tamanho do primeiro
    // mapa, então sem este resize os capítulos maiores apareceriam cortados ao avançar.
    const app = appRef.current;
    const width = battleState.map.width * TILE_SIZE;
    const height = battleState.map.height * TILE_SIZE;
    if (app && (app.renderer.width !== width || app.renderer.height !== height)) {
      app.renderer.resize(width, height);
    }
    redraw();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [battleState, selectedUnitId, reachableTiles, duelPreview, targetingMode]);

  function redraw() {
    const layer = layerRef.current;
    if (!layer) return;
    layer.removeChildren();

    const { map, units } = battleState;
    const reachableSet = new Set(reachableTiles.map((t) => tileKey(t.coord)));
    const threatened = computeThreatenedTiles(battleState);
    const selectedUnit = selectedUnitId ? units.find((u) => u.unitId === selectedUnitId) : undefined;
    const engageableEnemyIds = computeEngageableEnemyIds(units, selectedUnit);
    const targetableSet = new Set((targetingMode?.tiles ?? []).map(tileKey));
    // O tile que a condição de vitória nomeia (§5.7). `rout`/`surviveRounds` não têm tile
    // — a condição não é sobre lugar nenhum.
    const objectiveTile =
      'target' in battleState.winCondition ? (battleState.winCondition.target as Coord) : undefined;

    for (let y = 0; y < map.height; y++) {
      for (let x = 0; x < map.width; x++) {
        const tile = map.tiles[y]?.[x];
        const terrainId = tile?.terrain ?? 'terrain-planicie';
        const color = TERRAIN_COLORS[terrainId] ?? 0x888888;
        const px = x * TILE_SIZE;
        const py = y * TILE_SIZE;

        const g = new Graphics();
        g.rect(px, py, TILE_SIZE - 1, TILE_SIZE - 1).fill(color);
        // Altura do tile (§6.6 dá dano e acerto a quem ataca de cima): um véu branco por
        // nível, pra o relevo aparecer sem precisar de outra paleta.
        if (tile && tile.height > 0) {
          g.rect(px, py, TILE_SIZE - 1, TILE_SIZE - 1).fill({ color: 0xffffff, alpha: 0.08 * tile.height });
        }
        if (threatened.has(tileKey({ x, y }))) {
          g.rect(px, py, TILE_SIZE - 1, TILE_SIZE - 1).fill({ color: 0xef4444, alpha: 0.22 });
        }
        if (reachableSet.has(tileKey({ x, y }))) {
          g.rect(px, py, TILE_SIZE - 1, TILE_SIZE - 1).fill({ color: 0x60a5fa, alpha: 0.4 });
        }
        // Alcance de lançamento da skill de mapa / do Valor em mira (§5.4/§5.6).
        if (targetableSet.has(tileKey({ x, y }))) {
          g.rect(px, py, TILE_SIZE - 1, TILE_SIZE - 1).fill({ color: 0xa855f7, alpha: 0.3 });
        }
        // Rocha intransponível, desenhada DEPOIS dos overlays: o de ameaça cobre o tile
        // inteiro e fazia a muralha do capítulo 6 se ler como zona de perigo em vez de
        // parede. Terreno que decide o traçado do mapa não pode ser apagado por um véu.
        if (tile && map.terrains[tile.terrain]?.moveCost.foot === 'impassable') {
          g.rect(px + 1, py + 1, TILE_SIZE - 3, TILE_SIZE - 3).stroke({ width: 2, color: 0x4b5563 });
        }
        // O objetivo do mapa, sempre marcado: sem isto um mapa de `seize`/`defend`/
        // `escort` manda o jogador procurar uma coordenada que só existe no JSON.
        if (objectiveTile && objectiveTile.x === x && objectiveTile.y === y) {
          g.rect(px + 2, py + 2, TILE_SIZE - 5, TILE_SIZE - 5).stroke({ width: 3, color: 0xfacc15 });
        }
        g.eventMode = 'static';
        g.cursor = 'pointer';
        g.on('pointertap', () => {
          if (duelPreview) return; // precisa confirmar/cancelar o preview antes de outra ação
          if (animatingUnitIdRef.current) return; // uma animação de movimento já está em andamento
          // Em mira, o clique é o alvo — inclusive em cima de unidade (artilharia mira o
          // tile, e o tile pode estar ocupado).
          if (targetingMode) {
            confirmTargetAt({ x, y });
            return;
          }
          const occupant = unitAt(units, { x, y });
          if (occupant) {
            if (selectedUnit && engageableEnemyIds.has(occupant.unitId)) {
              previewEngage(occupant.unitId);
            } else {
              selectUnit(occupant.unitId);
            }
          } else if (selectedUnitId && selectedUnit) {
            const target = reachableTiles.find((t) => t.coord.x === x && t.coord.y === y);
            if (target && !instantResultMode) {
              animateAndMove(selectedUnit, target.path, { x, y });
            } else {
              moveSelectedUnitTo({ x, y });
            }
          }
        });
        layer.addChild(g);
      }
    }

    for (const unit of units) {
      if (unit.hp <= 0) continue;
      if (unit.unitId === animatingUnitIdRef.current) continue; // o "fantasma" da animação cobre esta unidade
      const color = SIDE_COLORS[unit.side] ?? 0xffffff;
      const cx = unit.pos.x * TILE_SIZE + TILE_SIZE / 2;
      const cy = unit.pos.y * TILE_SIZE + TILE_SIZE / 2;

      const g = new Graphics();
      g.circle(cx, cy, TILE_SIZE / 2 - 4).fill(color);
      if (unit.unitId === selectedUnitId) {
        g.circle(cx, cy, TILE_SIZE / 2 - 2).stroke({ width: 3, color: 0xfbbf24 });
      }
      if (engageableEnemyIds.has(unit.unitId)) {
        g.circle(cx, cy, TILE_SIZE / 2 - 1).stroke({ width: 2, color: 0xf97316 });
      }
      if (unit.hasActedThisRound) {
        g.circle(cx, cy, TILE_SIZE / 2 - 4).fill({ color: 0x000000, alpha: 0.45 });
      }
      layer.addChild(g);

      // §11 — "AP/PP de cada unidade legíveis no próprio tile (sem hover)".
      const label = new Text({
        text: `${unit.ap}/${unit.pp}`,
        style: { fontSize: 10, fill: 0xffffff, fontWeight: 'bold' },
      });
      label.position.set(unit.pos.x * TILE_SIZE + 2, unit.pos.y * TILE_SIZE + 2);
      layer.addChild(label);
    }
  }

  return <div ref={containerRef} className="map-canvas" />;
}
