import { describe, expect, it, beforeEach } from 'vitest';
import { catalog } from '../src/data/catalog.js';
import { defenseMapIds, MAX_DEFENSE_UNITS, useBattleStore } from '../src/store/battleStore.js';

// §9.1 (M15, sub-sessão 3/N) — o rascunho da defesa de arena.
//
// O que este arquivo trava é o que o roteiro de navegador não consegue provar de forma
// barata: as recusas que a tela tem de fazer ANTES de virarem requisição. O briefing (§2) é
// explícito — "a tela do cliente deve impedir que qualquer um desses 4 erros chegue a ser
// enviado, e ainda assim tratar a resposta de erro". Aqui está a primeira metade; a segunda
// é do servidor e está em `apps/server/tests/battles.test.ts`.
//
// Nada disso é regra de jogo (regra 3): é validação de formulário contra o mesmo catálogo
// que o servidor usa. Quem decide continua sendo o servidor.

const MAPA = defenseMapIds()[0]!;

function grid() {
  return catalog.maps[MAPA]!.grid;
}

// Um tile livre e pisável do mapa de arena, para os testes não dependerem de um layout fixo.
function tilePassavel(indice: number): { x: number; y: number } {
  const g = grid();
  const encontrados: { x: number; y: number }[] = [];
  for (let y = 0; y < g.height; y++) {
    for (let x = 0; x < g.width; x++) {
      const tile = g.tiles[y]?.[x];
      if (!tile || tile.object) continue;
      if (g.terrains[tile.terrain]?.moveCost.foot === 'impassable') continue;
      encontrados.push({ x, y });
    }
  }
  return encontrados[indice]!;
}

function semearRoster(quantidade: number): void {
  const roster = Array.from({ length: quantidade }, (_unused, i) => ({
    hero: { id: `heroi-${i}`, classId: 'class-espadachim' },
    equippedItems: [],
  }));
  useBattleStore.setState((s) => ({
    pvp: {
      ...s.pvp,
      token: 'token-teste',
      roster: roster as never,
      defenseDraft: { mapId: MAPA, units: [], placingHeroId: null },
      savedDefense: null,
      error: null,
    },
  }));
}

describe('rascunho da defesa de arena', () => {
  beforeEach(() => semearRoster(6));

  it('o mapa oferecido é de ARENA, não um capítulo da campanha', () => {
    // O servidor aceita qualquer `mapId` do catálogo, mas o atacante nasce na borda
    // esquerda (posição fixa desde M7): um mapa de campanha não foi desenhado para isso.
    expect(defenseMapIds().length).toBeGreaterThan(0);
    for (const id of defenseMapIds()) expect(id.startsWith('map-arena-')).toBe(true);
  });

  it('posicionar exige armar o herói primeiro — clique em tile sem ninguém armado não faz nada', () => {
    useBattleStore.getState().placeDefenseAt(tilePassavel(0));
    expect(useBattleStore.getState().pvp.defenseDraft.units).toHaveLength(0);
  });

  it('posiciona o herói armado e tira a arma da mão (um clique = um herói)', () => {
    const alvo = tilePassavel(0);
    useBattleStore.getState().armDefenseHero('heroi-0');
    useBattleStore.getState().placeDefenseAt(alvo);

    const draft = useBattleStore.getState().pvp.defenseDraft;
    expect(draft.units).toHaveLength(1);
    expect(draft.units[0]).toMatchObject({ heroId: 'heroi-0', pos: alvo, aiArchetype: 'aggressive' });
    expect(draft.placingHeroId).toBeNull();
  });

  it('a altura vem do TILE, nunca de número autorado à mão (§5.5)', () => {
    const g = grid();
    let alvo: { x: number; y: number } | null = null;
    for (let y = 0; y < g.height && !alvo; y++) {
      for (let x = 0; x < g.width && !alvo; x++) {
        const tile = g.tiles[y]?.[x];
        if (tile && !tile.object && tile.height > 0) alvo = { x, y };
      }
    }
    if (!alvo) return; // mapa plano: nada a afirmar

    useBattleStore.getState().armDefenseHero('heroi-0');
    useBattleStore.getState().placeDefenseAt(alvo);
    expect(useBattleStore.getState().pvp.defenseDraft.units[0]?.height).toBe(g.tiles[alvo.y]![alvo.x]!.height);
  });

  it('recusa dois heróis no mesmo tile — 1 herói = 1 tile', () => {
    const alvo = tilePassavel(0);
    useBattleStore.getState().armDefenseHero('heroi-0');
    useBattleStore.getState().placeDefenseAt(alvo);
    useBattleStore.getState().armDefenseHero('heroi-1');
    useBattleStore.getState().placeDefenseAt(alvo);

    expect(useBattleStore.getState().pvp.defenseDraft.units).toHaveLength(1);
    expect(useBattleStore.getState().pvp.error).toMatch(/1 herói = 1 tile/);
  });

  it('mover um herói já posicionado não o duplica', () => {
    useBattleStore.getState().armDefenseHero('heroi-0');
    useBattleStore.getState().placeDefenseAt(tilePassavel(0));
    useBattleStore.getState().armDefenseHero('heroi-0');
    useBattleStore.getState().placeDefenseAt(tilePassavel(1));

    const units = useBattleStore.getState().pvp.defenseDraft.units;
    expect(units).toHaveLength(1);
    expect(units[0]?.pos).toEqual(tilePassavel(1));
  });

  it(`recusa acima de ${MAX_DEFENSE_UNITS} heróis — o mesmo teto que o servidor devolve 400`, () => {
    for (let i = 0; i < MAX_DEFENSE_UNITS; i++) {
      useBattleStore.getState().armDefenseHero(`heroi-${i}`);
      useBattleStore.getState().placeDefenseAt(tilePassavel(i));
    }
    expect(useBattleStore.getState().pvp.defenseDraft.units).toHaveLength(MAX_DEFENSE_UNITS);

    useBattleStore.getState().armDefenseHero(`heroi-${MAX_DEFENSE_UNITS}`);
    useBattleStore.getState().placeDefenseAt(tilePassavel(MAX_DEFENSE_UNITS));

    expect(useBattleStore.getState().pvp.defenseDraft.units).toHaveLength(MAX_DEFENSE_UNITS);
    expect(useBattleStore.getState().pvp.error).toMatch(/no máximo/);
  });

  it('trocar o mapa zera as posições: coordenada de um mapa não significa nada em outro', () => {
    useBattleStore.getState().armDefenseHero('heroi-0');
    useBattleStore.getState().placeDefenseAt(tilePassavel(0));
    expect(useBattleStore.getState().pvp.defenseDraft.units).toHaveLength(1);

    useBattleStore.getState().setDefenseMap(MAPA);
    expect(useBattleStore.getState().pvp.defenseDraft.units).toHaveLength(0);
  });

  it('o arquétipo é editável por unidade — é a decisão tática desta tela (§9.1)', () => {
    useBattleStore.getState().armDefenseHero('heroi-0');
    useBattleStore.getState().placeDefenseAt(tilePassavel(0));
    useBattleStore.getState().setDefenseArchetype('heroi-0', 'guard-tile');

    expect(useBattleStore.getState().pvp.defenseDraft.units[0]?.aiArchetype).toBe('guard-tile');
  });

  it('tirar um herói o remove do rascunho', () => {
    useBattleStore.getState().armDefenseHero('heroi-0');
    useBattleStore.getState().placeDefenseAt(tilePassavel(0));
    useBattleStore.getState().removeDefenseUnit('heroi-0');
    expect(useBattleStore.getState().pvp.defenseDraft.units).toHaveLength(0);
  });
});

// §5.1 (M15) — as recusas que só existem porque muro e portão passaram a bloquear. Sem
// elas, a tela deixaria posicionar um defensor dentro de uma parede: o motor não valida
// colocação inicial, então a unidade nasceria presa e a batalha começaria quebrada.
describe('a defesa não aceita tile bloqueado', () => {
  beforeEach(() => semearRoster(2));

  it('recusa muro e portão', () => {
    const g = grid();
    let bloqueado: { x: number; y: number } | null = null;
    for (let y = 0; y < g.height && !bloqueado; y++) {
      for (let x = 0; x < g.width && !bloqueado; x++) {
        const object = g.tiles[y]?.[x]?.object;
        if (object === 'wall' || object === 'gate') bloqueado = { x, y };
      }
    }
    if (!bloqueado) return; // arena sem alvenaria: nada a afirmar neste mapa

    useBattleStore.getState().armDefenseHero('heroi-0');
    useBattleStore.getState().placeDefenseAt(bloqueado);

    expect(useBattleStore.getState().pvp.defenseDraft.units).toHaveLength(0);
    expect(useBattleStore.getState().pvp.error).toMatch(/muro e portão/);
  });

  it('recusa terreno intransponível', () => {
    const g = grid();
    let impassavel: { x: number; y: number } | null = null;
    for (let y = 0; y < g.height && !impassavel; y++) {
      for (let x = 0; x < g.width && !impassavel; x++) {
        const tile = g.tiles[y]?.[x];
        if (tile && !tile.object && g.terrains[tile.terrain]?.moveCost.foot === 'impassable') {
          impassavel = { x, y };
        }
      }
    }
    if (!impassavel) return; // arena sem montanha: nada a afirmar neste mapa

    useBattleStore.getState().armDefenseHero('heroi-0');
    useBattleStore.getState().placeDefenseAt(impassavel);

    expect(useBattleStore.getState().pvp.defenseDraft.units).toHaveLength(0);
    expect(useBattleStore.getState().pvp.error).toMatch(/intransponível/);
  });
});
