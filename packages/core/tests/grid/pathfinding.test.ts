import { describe, expect, it } from 'vitest';
import { computeReachableTiles, validatePath } from '../../src/grid/pathfinding.js';
import type { Coord, GridMap, Terrain } from '../../src/grid/types.js';

const plain: Terrain = {
  id: 'plain',
  moveCost: { foot: 1, cavalry: 1, flying: 1, heavy: 1, aquatic: 2 },
  defBonus: 0,
  evaBonus: 0,
  blocksSight: false,
};

const forest: Terrain = {
  id: 'forest',
  moveCost: { foot: 2, cavalry: 3, flying: 1, heavy: 3, aquatic: 'impassable' },
  defBonus: 100,
  evaBonus: 50,
  blocksSight: true,
};

const mountain: Terrain = {
  id: 'mountain',
  moveCost: { foot: 'impassable', cavalry: 'impassable', flying: 1, heavy: 'impassable', aquatic: 'impassable' },
  defBonus: 150,
  evaBonus: 100,
  blocksSight: true,
};

const TERRAINS: Record<string, Terrain> = { plain, forest, mountain };

// `rows` usa 1 letra por tile: P=plain, F=forest, M=mountain.
function buildMap(rows: string[], zocEnabled = false): GridMap {
  const letterToTerrain: Record<string, string> = { P: 'plain', F: 'forest', M: 'mountain' };
  const tiles = rows.map((row) =>
    row.split('').map((letter) => ({ terrain: letterToTerrain[letter] ?? 'plain', height: 0 as const })),
  );
  return { width: rows[0]?.length ?? 0, height: rows.length, tiles, terrains: TERRAINS, zocEnabled };
}

function coordsOf(reachable: readonly { coord: Coord }[]): Coord[] {
  return reachable.map((r) => r.coord).sort((a, b) => a.y - b.y || a.x - b.x);
}

describe('computeReachableTiles — Dijkstra com custo de terreno (§5.2)', () => {
  it('em terreno uniforme, alcança todos os tiles dentro do moveRange (distância Manhattan)', () => {
    const map = buildMap(['PPP', 'PPP', 'PPP']);
    const reachable = computeReachableTiles(
      { map, moveType: 'foot', occupiedByAlly: [], occupiedByEnemy: [] },
      { x: 1, y: 1 },
      1,
    );
    expect(coordsOf(reachable)).toEqual([
      { x: 1, y: 0 },
      { x: 0, y: 1 },
      { x: 2, y: 1 },
      { x: 1, y: 2 },
    ]);
  });

  it('respeita o custo de terreno — floresta custa 2 para foot, reduzindo o alcance efetivo', () => {
    const map = buildMap(['PPP', 'PFP', 'PPP']);
    const reachable = computeReachableTiles(
      { map, moveType: 'foot', occupiedByAlly: [], occupiedByEnemy: [] },
      { x: 0, y: 1 },
      2,
    );
    // (1,1) é floresta, custa 2 — consome todo o moveRange de 2, não sobra para ir além dela.
    const beyondForest = reachable.find((r) => r.coord.x === 2 && r.coord.y === 1);
    expect(beyondForest).toBeUndefined();
    const forestTile = reachable.find((r) => r.coord.x === 1 && r.coord.y === 1);
    expect(forestTile?.cost).toBe(2);
  });

  it('voadores ignoram o custo elevado de terreno — floresta custa 1 para flying', () => {
    const map = buildMap(['PPP', 'PFP', 'PPP']);
    const reachable = computeReachableTiles(
      { map, moveType: 'flying', occupiedByAlly: [], occupiedByEnemy: [] },
      { x: 0, y: 1 },
      2,
    );
    const beyondForest = reachable.find((r) => r.coord.x === 2 && r.coord.y === 1);
    expect(beyondForest).toBeDefined();
  });

  it('terreno impassable bloqueia a passagem para quem não pode atravessá-lo', () => {
    const map = buildMap(['PPP', 'PMP', 'PPP']);
    const reachable = computeReachableTiles(
      { map, moveType: 'foot', occupiedByAlly: [], occupiedByEnemy: [] },
      { x: 1, y: 1 },
      5,
    );
    expect(reachable.some((r) => r.coord.x === 1 && r.coord.y === 1)).toBe(false);
  });

  it('tile ocupado por inimigo é intransponível (bloqueia entrada e passagem)', () => {
    const map = buildMap(['PPP', 'PPP', 'PPP']);
    const reachable = computeReachableTiles(
      { map, moveType: 'foot', occupiedByAlly: [], occupiedByEnemy: [{ x: 1, y: 1 }] },
      { x: 0, y: 1 },
      3,
    );
    expect(reachable.some((r) => r.coord.x === 1 && r.coord.y === 1)).toBe(false);
    // e não dá pra atravessar até o outro lado nesse alcance por causa do desvio.
    expect(reachable.some((r) => r.coord.x === 2 && r.coord.y === 1)).toBe(false);
  });

  it('atravessar aliado é permitido, mas terminar sobre ele não (§5.2)', () => {
    const map = buildMap(['PPP', 'PPP', 'PPP']);
    const reachable = computeReachableTiles(
      { map, moveType: 'foot', occupiedByAlly: [{ x: 1, y: 1 }], occupiedByEnemy: [] },
      { x: 0, y: 1 },
      3,
    );
    expect(reachable.some((r) => r.coord.x === 1 && r.coord.y === 1)).toBe(false);
    expect(reachable.some((r) => r.coord.x === 2 && r.coord.y === 1)).toBe(true);
  });

  it('ZoC: entrar num tile ortogonalmente adjacente a inimigo encerra o movimento ali (§5.2)', () => {
    // Mapa 2 linhas: o único jeito de chegar em (4,1) sem passar pelo próprio tile do
    // inimigo (3,0) é pela linha de baixo, passando por (3,1) — que é ZoC (adjacente a
    // (3,0)). Com ZoC ativo, (3,1) é alcançável, mas (4,1) fica inalcançável mesmo com
    // moveRange de sobra, porque o movimento é obrigado a parar em (3,1).
    const map = buildMap(['PPPPP', 'PPPPP'], true);
    const reachable = computeReachableTiles(
      { map, moveType: 'foot', occupiedByAlly: [], occupiedByEnemy: [{ x: 3, y: 0 }] },
      { x: 0, y: 0 },
      10,
    );
    expect(reachable.some((r) => r.coord.x === 3 && r.coord.y === 1)).toBe(true);
    expect(reachable.some((r) => r.coord.x === 4 && r.coord.y === 1)).toBe(false);
  });

  it('com zocEnabled=false, o mesmo mapa alcança (4,1) normalmente (só o tile do inimigo é bloqueado)', () => {
    const map = buildMap(['PPPPP', 'PPPPP'], false);
    const reachable = computeReachableTiles(
      { map, moveType: 'foot', occupiedByAlly: [], occupiedByEnemy: [{ x: 3, y: 0 }] },
      { x: 0, y: 0 },
      10,
    );
    expect(reachable.some((r) => r.coord.x === 4 && r.coord.y === 1)).toBe(true);
  });
});

describe('computeReachableTiles — path (M6: o cliente precisa do caminho pra montar o comando `move`)', () => {
  it('cada tile alcançável vem com um path começando no start e terminando no próprio tile', () => {
    const map = buildMap(['PPP', 'PPP', 'PPP']);
    const start: Coord = { x: 1, y: 1 };
    const reachable = computeReachableTiles({ map, moveType: 'foot', occupiedByAlly: [], occupiedByEnemy: [] }, start, 2);
    for (const tile of reachable) {
      expect(tile.path[0]).toEqual(start);
      expect(tile.path[tile.path.length - 1]).toEqual(tile.coord);
    }
  });

  it('o path devolvido é sempre aceito por validatePath, com o mesmo custo', () => {
    const map = buildMap(['PPP', 'PFP', 'PPP']);
    const ctx = { map, moveType: 'foot' as const, occupiedByAlly: [], occupiedByEnemy: [] };
    const start: Coord = { x: 0, y: 0 };
    const reachable = computeReachableTiles(ctx, start, 4);
    for (const tile of reachable) {
      const validation = validatePath(ctx, tile.path, 4);
      expect(validation).toEqual({ valid: true, cost: tile.cost });
    }
  });

  it('o path passa por um tile ocupado por aliado no meio do caminho (atravessável), mas nunca termina nele', () => {
    const map = buildMap(['PPP', 'PPP', 'PPP']);
    const ctx = { map, moveType: 'foot' as const, occupiedByAlly: [{ x: 1, y: 1 }], occupiedByEnemy: [] };
    const reachable = computeReachableTiles(ctx, { x: 0, y: 1 }, 3);
    const beyondAlly = reachable.find((r) => r.coord.x === 2 && r.coord.y === 1);
    expect(beyondAlly?.path).toEqual([
      { x: 0, y: 1 },
      { x: 1, y: 1 },
      { x: 2, y: 1 },
    ]);
  });
});

describe('validatePath — revalidação do caminho enviado pelo comando `move` (§5.2: "nunca confie no cliente")', () => {
  const map = buildMap(['PPP', 'PFP', 'PPP']);
  const ctx = { map, moveType: 'foot' as const, occupiedByAlly: [], occupiedByEnemy: [] };

  it('aceita um caminho legítimo e devolve o custo acumulado', () => {
    const path: Coord[] = [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 2, y: 0 },
    ];
    const result = validatePath(ctx, path, 5);
    expect(result).toEqual({ valid: true, cost: 2 });
  });

  it('rejeita um passo não ortogonalmente adjacente (pulo/diagonal)', () => {
    const path: Coord[] = [
      { x: 0, y: 0 },
      { x: 2, y: 0 },
    ];
    const result = validatePath(ctx, path, 5);
    expect(result.valid).toBe(false);
  });

  it('rejeita caminho cujo custo excede o moveRange', () => {
    const path: Coord[] = [
      { x: 0, y: 1 },
      { x: 1, y: 1 }, // floresta, custo 2
      { x: 2, y: 1 },
    ];
    const result = validatePath(ctx, path, 1);
    expect(result.valid).toBe(false);
  });

  it('rejeita caminho que passa por tile ocupado por inimigo', () => {
    const withEnemy = { ...ctx, occupiedByEnemy: [{ x: 1, y: 0 }] };
    const path: Coord[] = [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 2, y: 0 },
    ];
    const result = validatePath(withEnemy, path, 5);
    expect(result.valid).toBe(false);
  });

  it('rejeita caminho que termina sobre aliado', () => {
    const withAlly = { ...ctx, occupiedByAlly: [{ x: 2, y: 0 }] };
    const path: Coord[] = [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 2, y: 0 },
    ];
    const result = validatePath(withAlly, path, 5);
    expect(result.valid).toBe(false);
  });

  it('rejeita caminho que continua andando depois de entrar num tile de ZoC', () => {
    const zocMap = buildMap(['PPPPP', 'PPPPP'], true);
    const zocCtx = { map: zocMap, moveType: 'foot' as const, occupiedByAlly: [], occupiedByEnemy: [{ x: 3, y: 0 }] };
    const path: Coord[] = [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 2, y: 0 }, // ZoC (adjacente ao inimigo em x=3)
      { x: 2, y: 1 }, // continuar depois da ZoC — inválido
    ];
    const result = validatePath(zocCtx, path, 5);
    expect(result.valid).toBe(false);
  });
});
