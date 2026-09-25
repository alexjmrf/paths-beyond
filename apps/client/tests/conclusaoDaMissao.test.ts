import { describe, expect, it } from 'vitest';
import { conclusaoDaPartida, missaoSeguinte } from '../src/logic/conclusao.js';

// M35 9/N — A TELA DE CONCLUSÃO (pedido do usuário): "ao terminar a missão já pode aparecer uma
// tela de conclusão mostrando resultado e loot, e a opção de voltar ao menu ou continuar para a
// próxima missão". A tela antiga (`CampaignTransitionOverlay`) dependia do `ticket`, que morreu
// no M36 — e por isso, ao terminar uma missão, não aparecia tela NENHUMA.
//
// O conteúdo é uma função pura sobre o que o servidor liquidou; o componente só desenha.

const capitulos = [
  { id: 'cap-1', missions: [{ id: 'm1' }, { id: 'm2' }] },
  { id: 'cap-2', missions: [{ id: 'm3' }] },
];

describe('a missão seguinte', () => {
  it('é a próxima na ordem, atravessando capítulos', () => {
    expect(missaoSeguinte(capitulos, 'm1')).toBe('m2');
    expect(missaoSeguinte(capitulos, 'm2')).toBe('m3');
  });

  it('depois da última não há próxima', () => {
    expect(missaoSeguinte(capitulos, 'm3')).toBeNull();
    expect(missaoSeguinte(capitulos, 'desconhecida')).toBeNull();
  });
});

describe('a conclusão da partida', () => {
  it('batalha em curso não tem conclusão', () => {
    expect(conclusaoDaPartida({ modo: 'campaign', outcome: 'ongoing', rounds: 2, liquidacao: null, refId: 'm1', capitulos })).toBeNull();
  });

  it('vitória na campanha: o loot é a moeda de primeira vitória, e as ações são continuar e voltar ao menu', () => {
    const c = conclusaoDaPartida({
      modo: 'campaign',
      outcome: 'victory',
      rounds: 3,
      liquidacao: { premiumAwarded: 60 },
      refId: 'm1',
      capitulos,
    })!;
    expect(c.venceu).toBe(true);
    expect(c.rounds).toBe(3);
    expect(c.loot).toEqual([{ tipo: 'premium', valor: 60 }]);
    expect(c.acoes).toEqual(['proxima', 'menu', 'rever']);
    expect(c.proximaMissaoId).toBe('m2');
  });

  it('vitória repetida (sem moeda) diz que não há loot, em vez de uma lista vazia muda', () => {
    const c = conclusaoDaPartida({ modo: 'campaign', outcome: 'victory', rounds: 2, liquidacao: { premiumAwarded: 0 }, refId: 'm1', capitulos })!;
    expect(c.loot).toEqual([]);
  });

  it('vitória na ÚLTIMA missão não oferece "próxima"', () => {
    const c = conclusaoDaPartida({ modo: 'campaign', outcome: 'victory', rounds: 2, liquidacao: {}, refId: 'm3', capitulos })!;
    expect(c.acoes).toEqual(['menu', 'rever']);
  });

  it('derrota na campanha: tentar de novo e voltar ao menu', () => {
    const c = conclusaoDaPartida({ modo: 'campaign', outcome: 'defeat', rounds: 5, liquidacao: {}, refId: 'm1', capitulos })!;
    expect(c.venceu).toBe(false);
    expect(c.acoes).toEqual(['repetir', 'menu', 'rever']);
  });

  it('masmorra: ouro, pedras, EXP, materiais e itens do drop', () => {
    const c = conclusaoDaPartida({
      modo: 'dungeon',
      outcome: 'victory',
      rounds: 4,
      liquidacao: {
        rewards: {
          gold: 300,
          exp: 120,
          stones: 5,
          materials: { 'material-x': 2 },
          items: [{ id: 'item-1', setId: 'set-a', slot: 'ring', rarity: 'rare', enhance: 0 } as never],
        },
      },
      refId: 'dungeon-1',
      capitulos,
    })!;
    expect(c.loot).toEqual([
      { tipo: 'ouro', valor: 300 },
      { tipo: 'pedras', valor: 5 },
      { tipo: 'exp', valor: 120 },
      { tipo: 'material', id: 'material-x', valor: 2 },
      { tipo: 'item', id: 'item-1', valor: 1 },
    ]);
    expect(c.acoes).toEqual(['menu', 'rever']);
  });

  it('arena: o ELO novo e as marcas', () => {
    const c = conclusaoDaPartida({
      modo: 'pvp',
      outcome: 'victory',
      rounds: 6,
      liquidacao: { elo: { attacker: 1216, defender: 1184 }, arenaMarks: { attacker: 30, defender: 0 } },
      refId: 'p2',
      capitulos,
    })!;
    expect(c.loot).toEqual([
      { tipo: 'elo', valor: 1216 },
      { tipo: 'marcas', valor: 30 },
    ]);
  });
});
