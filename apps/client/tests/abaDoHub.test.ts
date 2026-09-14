import { beforeEach, describe, expect, it } from 'vitest';
import { ABAS_DO_HUB } from '../src/logic/tela.js';
import { useBattleStore } from '../src/store/battleStore.js';

// M35 1/N e 5/N — o hub é um LOBBY com botões, e uma tela por vez (D41, revisada).
//
// A 1/N desenhou uma barra de abas sempre visível, com a campanha já aberta. O usuário julgou
// na tela em 2026-09-14: "já está melhor", mas a forma que ele quer é a do gênero — uma tela
// principal (lobby) com botões; clicar leva a uma telinha de transição e depois à tela
// correspondente; lá dentro há um "voltar" para o lobby. A estrutura é agora; a beleza é
// depois (decisão dele).
//
// O que muda na store: quem entra cai no LOBBY; escolher uma tela abre uma TRANSIÇÃO (estado,
// não relógio — o relógio mora no overlay que a desenha) e só ao concluí-la a tela troca; a
// introdução da invocação dispara ao CHEGAR, não ao clicar; voltar é a mesma transição, para o
// lobby. A lista de telas continua em runtime com o tipo derivado (`ABAS_DO_HUB`).

beforeEach(() => {
  useBattleStore.setState({ abaDoHub: 'lobby', transicao: null, introducaoAtual: null, introducoesVistas: [] });
});

describe('o lobby e as telas (M35 5/N)', () => {
  it('as telas são cinco, nesta ordem — a campanha primeiro porque é a próxima ação de quem chega', () => {
    expect(ABAS_DO_HUB).toEqual(['campanha', 'masmorras', 'arena', 'personagens', 'invocacao']);
  });

  it('quem entra cai no LOBBY, sem transição pendente', () => {
    expect(useBattleStore.getState().abaDoHub).toBe('lobby');
    expect(useBattleStore.getState().transicao).toBeNull();
  });

  it('escolher uma tela abre a transição e NÃO troca a tela ainda', () => {
    useBattleStore.getState().escolherAba('arena');
    expect(useBattleStore.getState().transicao).toEqual({ para: 'arena' });
    expect(useBattleStore.getState().abaDoHub).toBe('lobby');
  });

  it('concluir a transição troca a tela e a fecha', () => {
    useBattleStore.getState().escolherAba('arena');
    useBattleStore.getState().concluirTransicao();
    expect(useBattleStore.getState().abaDoHub).toBe('arena');
    expect(useBattleStore.getState().transicao).toBeNull();
  });

  it('concluir sem transição pendente não faz nada', () => {
    useBattleStore.getState().concluirTransicao();
    expect(useBattleStore.getState().abaDoHub).toBe('lobby');
  });

  it('voltar ao lobby passa pela mesma transição', () => {
    useBattleStore.getState().escolherAba('personagens');
    useBattleStore.getState().concluirTransicao();
    useBattleStore.getState().voltarAoLobby();
    expect(useBattleStore.getState().transicao).toEqual({ para: 'lobby' });
    useBattleStore.getState().concluirTransicao();
    expect(useBattleStore.getState().abaDoHub).toBe('lobby');
  });

  it('a introdução de "primeiro summon" dispara ao CHEGAR na invocação, não ao clicar', () => {
    useBattleStore.getState().escolherAba('invocacao');
    expect(useBattleStore.getState().introducaoAtual).toBeNull();
    useBattleStore.getState().concluirTransicao();
    expect(useBattleStore.getState().introducaoAtual?.gatilho).toBe('primeiro-summon');
  });

  it('chegar em qualquer outra tela NÃO dispara introdução nenhuma', () => {
    for (const aba of ABAS_DO_HUB.filter((a) => a !== 'invocacao')) {
      useBattleStore.getState().escolherAba(aba);
      useBattleStore.getState().concluirTransicao();
      expect(useBattleStore.getState().introducaoAtual, aba).toBeNull();
    }
  });

  it('a tela sobrevive a entrar e sair de uma batalha: quem saiu da masmorra volta para Masmorras', () => {
    useBattleStore.getState().escolherAba('masmorras');
    useBattleStore.getState().concluirTransicao();
    // `exitDungeon` é o caminho de volta de uma batalha de masmorra; ele zera o tabuleiro e o
    // ticket, e não pode mexer na tela — senão o jogador cai no lobby sem ter ido lá.
    useBattleStore.getState().exitDungeon();
    expect(useBattleStore.getState().abaDoHub).toBe('masmorras');
  });
});
