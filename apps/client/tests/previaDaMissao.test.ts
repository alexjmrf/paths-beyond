import { afterEach, describe, expect, it, vi } from 'vitest';
import { catalog } from '../src/data/catalog.js';
import { previaDaMissao } from '../src/logic/previaDaMissao.js';
import { tilesAmeacados } from '../src/logic/ameaca.js';
import { buildInitialState } from '@paths-beyond/core';

// M35 2/N (D42) — a PRÉVIA da missão: o tabuleiro de verdade, montado do catálogo, sem ticket.
//
// Escolher uma missão passa a mostrar contra o que se vai ANTES de escolher quem leva — é §1.1
// (legibilidade tática) antes de entrar. A prévia é montada LOCALMENTE: pedir ticket é entrar
// (`enterChapter`), e a prévia é olhar. O cliente tem o catálogo inteiro (`encounters`, `maps`,
// `terrains`, `enemies`) e a mesma `buildBattleSetupFromHeroes` que o servidor usa, então o
// que ela mostra é o que o servidor vai montar — menos as vagas, que o jogador preenche.
//
// Nada aqui decide regra (regra 3): a prévia é o setup do conteúdo, desenhado.

afterEach(() => vi.unstubAllGlobals());

describe('previaDaMissao', () => {
  it('não faz requisição nenhuma — olhar não é entrar', () => {
    const fetchEspiao = vi.fn();
    vi.stubGlobal('fetch', fetchEspiao);
    previaDaMissao(catalog, 'encounter-campanha-ponte-1');
    expect(fetchEspiao).not.toHaveBeenCalled();
  });

  it('missão 1: o mapa da missão, um inimigo pelo nome autorado, uma vaga onde o encounter a declara', () => {
    const previa = previaDaMissao(catalog, 'encounter-campanha-ponte-1');
    expect(previa).not.toBeNull();
    const encounter = catalog.encounters.find((e) => e.id === 'encounter-campanha-ponte-1')!;
    const mapa = catalog.maps[encounter.mapId]!;

    expect(previa!.setup.map.width).toBe(mapa.grid.width);
    expect(previa!.setup.map.height).toBe(mapa.grid.height);
    // As vagas NÃO estão no setup (ninguém foi escolhido ainda); estão listadas à parte, na
    // posição autorada, para o tabuleiro marcá-las.
    expect(previa!.setup.units.every((u) => u.side !== 'player')).toBe(true);
    const vagasAutoradas = encounter.units.filter((u) => u.side === 'player').map((u) => u.pos);
    expect(previa!.vagas).toEqual(vagasAutoradas);
    expect(previa!.vagas).toHaveLength(1);

    // O inimigo, com o id de `enemies/` para a tela dar o nome e a arte — o mesmo mapa que o
    // ticket traria (`artIdByUnitId`).
    expect(previa!.inimigos).toHaveLength(1);
    const inimigoAutorado = encounter.units.find((u) => u.side === 'enemy')!;
    expect(previa!.inimigos[0]!.enemyId).toBe(inimigoAutorado.enemyId);
    expect(previa!.artIdByUnitId[previa!.inimigos[0]!.unitId]).toBe(inimigoAutorado.enemyId);
    expect(previa!.setup.units.some((u) => u.unitId === previa!.inimigos[0]!.unitId)).toBe(true);
  });

  it('toda missão da demo tem prévia, e o número de vagas bate com o que a lista da campanha diz', () => {
    for (const encounter of catalog.encounters) {
      const previa = previaDaMissao(catalog, encounter.id);
      expect(previa, encounter.id).not.toBeNull();
      expect(previa!.vagas.length, encounter.id).toBe(encounter.units.filter((u) => u.side === 'player').length);
      // A condição de vitória é a do encounter quando ele declara, senão a do mapa (§5.7).
      expect(previa!.setup.winCondition).toEqual(encounter.winCondition ?? catalog.maps[encounter.mapId]!.winCondition);
    }
  });

  it('missão desconhecida: null, não exceção — a tela desenha "escolha uma missão"', () => {
    expect(previaDaMissao(catalog, 'encounter-que-nao-existe')).toBeNull();
  });
});

// M35 4/N (D44) — a ZONA DE AMEAÇA também na prévia: §1.1 inteiro antes de entrar. É o
// mesmo cálculo do tabuleiro em batalha (`tilesAmeacados`, que saiu de `MapCanvas` para
// `logic/ameaca.ts`), sobre o estado inicial do setup — a ameaça não depende de seed.
describe('a ameaça na prévia (D44)', () => {
  it('a prévia da missão 1 tem a ameaça do alvo de treino, e ela cobre o tile dele e a vizinhança', () => {
    const previa = previaDaMissao(catalog, 'encounter-campanha-ponte-1')!;
    const inimigo = previa.setup.units.find((u) => u.side === 'enemy')!;
    const chaves = new Set(previa.ameaca.map((c) => `${c.x},${c.y}`));
    expect(chaves.size).toBeGreaterThan(0);
    // Adjacente ao inimigo está sempre ameaçado (alcance de duelo ≥ 1 a partir de onde ele está).
    expect(chaves.has(`${inimigo.pos.x + 1},${inimigo.pos.y}`) || chaves.has(`${inimigo.pos.x - 1},${inimigo.pos.y}`)).toBe(true);
    // E a ameaça não cobre o mapa inteiro: o canto oposto ao inimigo fica de fora.
    const longe = inimigo.pos.x > previa.setup.map.width / 2 ? { x: 0, y: 0 } : { x: previa.setup.map.width - 1, y: previa.setup.map.height - 1 };
    expect(chaves.has(`${longe.x},${longe.y}`)).toBe(false);
  });

  it('missão sem inimigo de pé não tem ameaça — e não lança', () => {
    const previa = previaDaMissao(catalog, 'encounter-campanha-ponte-1')!;
    const semInimigos = { ...previa.setup, units: previa.setup.units.filter((u) => u.side !== 'enemy') };
    expect(tilesAmeacados({ ...buildInitialState(semInimigos, 0) })).toEqual([]);
  });
});
