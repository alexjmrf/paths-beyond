import { describe, expect, it } from 'vitest';
import { computeReachableTiles, validatePath } from '../../src/grid/pathfinding.js';
import { TILE_OBJECTS, isControlObject, type Coord, type GridMap, type Terrain, type Tile } from '../../src/grid/types.js';

// §5.1 (`Tile.object`) + M15 D3 (briefing `docs/milestones/M15-fechamento-do-loop-de-pvp.md`):
// o tipo declarava 5 valores desde M3, só `fort` e `camp` tinham leitor (+1 AP no `wait`,
// `battle/commands.ts`), e nenhum mapa de `packages/data` usava o campo. D3 fecha o buraco:
// `wall` e `gate` passam a bloquear movimento e `chest` sai do tipo (loot em mapa é sistema
// que não existe — um valor de enum que nada lê e nada escreve é dívida, não recurso).
//
// Bloqueio por OBJETO é independente do terreno: um muro sobre planície é intransponível
// mesmo para quem voa, que é justamente o que o terreno `impassable` não consegue expressar
// (voador ignora custo de terreno por §5.1, mas não atravessa parede).

const plain: Terrain = {
  id: 'plain',
  moveCost: { foot: 1, cavalry: 1, flying: 1, heavy: 1, aquatic: 2 },
  defBonus: 0,
  evaBonus: 0,
  blocksSight: false,
};

const TERRAINS: Record<string, Terrain> = { plain };

// `rows` usa 1 letra por tile: P=plain, W=muro, G=portão, F=fort, C=camp.
function buildMap(rows: string[]): GridMap {
  const tiles = rows.map((row) =>
    row.split('').map((letter): Tile => {
      const base = { terrain: 'plain', height: 0 as const };
      if (letter === 'W') return { ...base, object: 'wall' };
      if (letter === 'G') return { ...base, object: 'gate' };
      if (letter === 'F') return { ...base, object: 'fort' };
      if (letter === 'C') return { ...base, object: 'camp' };
      return base;
    }),
  );
  return { width: rows[0]?.length ?? 0, height: rows.length, tiles, terrains: TERRAINS, zocEnabled: false };
}

function reached(reachable: readonly { coord: Coord }[], x: number, y: number): boolean {
  return reachable.some((r) => r.coord.x === x && r.coord.y === y);
}

describe('TILE_OBJECTS — o enum depois de D3', () => {
  it('`chest` não existe mais', () => {
    expect(TILE_OBJECTS).not.toContain('chest');
  });

  it('os quatro valores restantes têm leitor no motor', () => {
    expect([...TILE_OBJECTS].sort()).toEqual(['camp', 'fort', 'gate', 'wall']);
  });

  it('`fort` e `camp` são os tiles de controle (§5.6 — capturar objetivo)', () => {
    expect(isControlObject('fort')).toBe(true);
    expect(isControlObject('camp')).toBe(true);
    expect(isControlObject('wall')).toBe(false);
    expect(isControlObject('gate')).toBe(false);
    expect(isControlObject(undefined)).toBe(false);
  });
});

describe('`wall` — bloqueio de movimento (§5.1, M15 D3)', () => {
  it('não entra no alcance de movimento, mesmo com terreno passável embaixo', () => {
    const map = buildMap(['PPP', 'PWP', 'PPP']);
    const reachable = computeReachableTiles(
      { map, moveType: 'foot', occupiedByAlly: [], occupiedByEnemy: [] },
      { x: 1, y: 0 },
      4,
    );
    expect(reached(reachable, 1, 1)).toBe(false);
    // O contorno continua alcançável: o muro bloqueia o tile, não a região — mas custa 4
    // (a volta inteira pela borda) em vez dos 2 da linha reta.
    expect(reached(reachable, 1, 2)).toBe(true);
  });

  it('bloqueia voadores também (bloqueio de objeto não é custo de terreno)', () => {
    const map = buildMap(['PPP', 'PWP', 'PPP']);
    const reachable = computeReachableTiles(
      { map, moveType: 'flying', occupiedByAlly: [], occupiedByEnemy: [] },
      { x: 1, y: 0 },
      3,
    );
    expect(reached(reachable, 1, 1)).toBe(false);
  });

  it('uma muralha inteira separa o mapa em dois — nada do outro lado é alcançável', () => {
    const map = buildMap(['PPP', 'WWW', 'PPP']);
    const reachable = computeReachableTiles(
      { map, moveType: 'foot', occupiedByAlly: [], occupiedByEnemy: [] },
      { x: 0, y: 0 },
      20,
    );
    expect(reached(reachable, 0, 2)).toBe(false);
    expect(reached(reachable, 2, 0)).toBe(true);
  });

  it('`validatePath` recusa um caminho que atravessa muro (o cliente propõe, o core revalida)', () => {
    const map = buildMap(['PPP', 'PWP', 'PPP']);
    const result = validatePath(
      { map, moveType: 'foot', occupiedByAlly: [], occupiedByEnemy: [] },
      [{ x: 1, y: 0 }, { x: 1, y: 1 }, { x: 1, y: 2 }],
      5,
    );
    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/muro|portão|objeto/i);
  });
});

describe('`gate` — bloqueia fechado, passa aberto (§5.1, M15 D3)', () => {
  it('portão fechado bloqueia exatamente como muro', () => {
    const map = buildMap(['PPP', 'WGW', 'PPP']);
    const reachable = computeReachableTiles(
      { map, moveType: 'foot', occupiedByAlly: [], occupiedByEnemy: [] },
      { x: 1, y: 0 },
      20,
    );
    expect(reached(reachable, 1, 1)).toBe(false);
    expect(reached(reachable, 1, 2)).toBe(false);
  });

  it('portão aberto é atravessável, e o que estava atrás dele fica alcançável', () => {
    const map = buildMap(['PPP', 'WGW', 'PPP']);
    const reachable = computeReachableTiles(
      { map, moveType: 'foot', occupiedByAlly: [], occupiedByEnemy: [], openGates: [{ x: 1, y: 1 }] },
      { x: 1, y: 0 },
      20,
    );
    expect(reached(reachable, 1, 1)).toBe(true);
    expect(reached(reachable, 1, 2)).toBe(true);
  });

  it('abrir um portão não abre os outros', () => {
    const map = buildMap(['PGP', 'WWW', 'PGP']);
    const reachable = computeReachableTiles(
      { map, moveType: 'foot', occupiedByAlly: [], occupiedByEnemy: [], openGates: [{ x: 1, y: 0 }] },
      { x: 0, y: 0 },
      20,
    );
    expect(reached(reachable, 1, 0)).toBe(true);
    expect(reached(reachable, 1, 2)).toBe(false);
  });

  it('`validatePath` aceita atravessar portão aberto e recusa portão fechado', () => {
    const map = buildMap(['PPP', 'WGW', 'PPP']);
    const path = [{ x: 1, y: 0 }, { x: 1, y: 1 }, { x: 1, y: 2 }];
    const ctx = { map, moveType: 'foot' as const, occupiedByAlly: [], occupiedByEnemy: [] };

    expect(validatePath(ctx, path, 5).valid).toBe(false);
    expect(validatePath({ ...ctx, openGates: [{ x: 1, y: 1 }] }, path, 5).valid).toBe(true);
  });
});
