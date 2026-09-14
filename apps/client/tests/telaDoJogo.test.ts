import { describe, expect, it } from 'vitest';
import { telaDoJogo } from '../src/logic/tela.js';

// M32 — QUAL TELA o jogador vê, e é uma pergunta que a store nunca respondeu.
//
// Até aqui `App.tsx` desenhava tudo o tempo todo: cabeçalho, tabuleiro vazio com "Round 1",
// oito painéis, e o botão de entrar escondido dentro de um chamado "PvP — arena". O primeiro
// print do instalador (critério 3 do M28) mostrou o resultado: um estranho não sabe o que
// fazer, porque a tela não diz. O critério de aceite do M32 é literal — "sem sessão, a única
// coisa na tela é entrar" — e este arquivo é o que o afirma sem montar tela nenhuma.
//
// A regra é uma função pura sobre o estado, e não um `if` dentro do JSX, pelo mesmo motivo
// de `capituloInicialAberto` e de `proximaIntroducao`: o que este projeto testa é a store, e
// uma decisão que só existe no componente só é testável abrindo o navegador.

const SEM_SESSAO = { pvp: { me: null }, battleState: { units: [] } } as const;
const COM_SESSAO = { pvp: { me: { id: 'p1' } }, battleState: { units: [] } } as const;
const EM_BATALHA = { pvp: { me: { id: 'p1' } }, battleState: { units: [{ unitId: 'u1' }] } } as const;

describe('telaDoJogo()', () => {
  it('sem sessão é a ENTRADA — não importa o que mais exista no estado', () => {
    expect(telaDoJogo(SEM_SESSAO)).toBe('entrada');
    // Mesmo com unidades no tabuleiro (um estado que não deveria existir sem sessão, mas que
    // um save velho ou um teste podem produzir): sem `me` não há o que jogar.
    expect(telaDoJogo({ ...SEM_SESSAO, battleState: EM_BATALHA.battleState })).toBe('entrada');
  });

  it('com sessão e tabuleiro vazio é o HUB — a lista de missões, sem grid nenhum', () => {
    // É a decisão registrada na sessão: o roadmap pede "nenhum tabuleiro sem sessão", e um
    // grid vazio com "0 inimigo(s) de pé" ao lado da lista de missões é o mesmo defeito.
    expect(telaDoJogo(COM_SESSAO)).toBe('hub');
  });

  it('com unidades no tabuleiro é a BATALHA', () => {
    expect(telaDoJogo(EM_BATALHA)).toBe('batalha');
  });
});
