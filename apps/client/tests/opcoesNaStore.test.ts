import { beforeEach, describe, expect, it } from 'vitest';
import { useBattleStore } from '../src/store/battleStore.js';

// M32 — o menu de opções, e "apagar progresso" em DOIS passos.
//
// O botão vivia no cabeçalho, a um clique, sem confirmação: no primeiro print do instalador
// ele estava ao lado do título do jogo, com o mesmo peso de "Idioma". Apagar a conta local é
// a única ação da tela que não se desfaz, e o roadmap pede que ela peça confirmação.
//
// A confirmação é da STORE e não um `window.confirm`: o diálogo nativo não passa pela camada
// de idioma (M25), bloqueia a aba inteira e não é testável sem navegador. Com o estado aqui,
// o que se afirma é o que importa — pedir não apaga, cancelar não apaga, confirmar apaga.

const SESSAO = { id: 'p1', displayName: 'Alguém', elo: 1000, arenaMarks: 0 };

function comSessao(): void {
  useBattleStore.setState((s) => ({
    pvp: { ...s.pvp, me: SESSAO as never, token: 'token' },
    opcoesAbertas: false,
    apagarProgressoPendente: false,
  }));
}

describe('o menu de opções', () => {
  beforeEach(comSessao);

  it('abre e fecha, e fechar desarma um pedido de apagar que ficou pendente', () => {
    useBattleStore.getState().abrirOpcoes();
    expect(useBattleStore.getState().opcoesAbertas).toBe(true);

    useBattleStore.getState().pedirApagarProgresso();
    useBattleStore.getState().fecharOpcoes();

    expect(useBattleStore.getState().opcoesAbertas).toBe(false);
    // Fechar o menu com a pergunta aberta é uma resposta: "não". Reabrir não pode encontrar a
    // pergunta ainda de pé, esperando um clique que o jogador não sabe que está dando.
    expect(useBattleStore.getState().apagarProgressoPendente).toBe(false);
    expect(useBattleStore.getState().pvp.me).not.toBeNull();
  });
});

describe('"apagar progresso" pede confirmação', () => {
  beforeEach(comSessao);

  it('pedir NÃO apaga nada — só arma a pergunta', () => {
    useBattleStore.getState().pedirApagarProgresso();

    const estado = useBattleStore.getState();
    expect(estado.apagarProgressoPendente).toBe(true);
    expect(estado.pvp.me).not.toBeNull();
    expect(estado.pvp.token).toBe('token');
  });

  it('cancelar desarma a pergunta e não apaga nada', () => {
    useBattleStore.getState().pedirApagarProgresso();
    useBattleStore.getState().cancelarApagarProgresso();

    const estado = useBattleStore.getState();
    expect(estado.apagarProgressoPendente).toBe(false);
    expect(estado.pvp.me).not.toBeNull();
  });

  it('confirmar apaga, desarma a pergunta e fecha o menu — a tela volta para a entrada', () => {
    useBattleStore.getState().abrirOpcoes();
    useBattleStore.getState().pedirApagarProgresso();
    useBattleStore.getState().confirmarApagarProgresso();

    const estado = useBattleStore.getState();
    expect(estado.pvp.me).toBeNull();
    expect(estado.pvp.token).toBe('');
    expect(estado.apagarProgressoPendente).toBe(false);
    // Sem sessão a única tela é a entrada; um menu de opções aberto por cima dela seria a
    // primeira coisa que o jogador veria depois de apagar tudo.
    expect(estado.opcoesAbertas).toBe(false);
  });

  it('confirmar SEM ter pedido não apaga — a ordem dos dois passos é o que protege', () => {
    // Um botão de confirmar que funciona sozinho é o botão de um clique de antes, com outro
    // nome. Ele só age quando a pergunta está de pé.
    useBattleStore.getState().confirmarApagarProgresso();

    expect(useBattleStore.getState().pvp.me).not.toBeNull();
  });
});
