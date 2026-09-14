import { beforeEach, describe, expect, it } from 'vitest';
import { ABAS_DO_HUB } from '../src/logic/tela.js';
import { useBattleStore } from '../src/store/battleStore.js';

// M35 1/N — o hub é UM menu e UMA aba por vez (D41).
//
// O veredito do usuário sobre o M32, com sessão de verdade: "está tudo muito misturado".
// Quatro painéis lado a lado com o mesmo peso são o hub do M13 com menos coisas. A forma de
// referência do gênero é um menu com abas e só a aba escolhida na tela — e a aba é ESTADO DA
// STORE, pelo mesmo motivo de `telaDoJogo` (D38): uma decisão que só existe no componente só
// se prova abrindo o navegador.
//
// **Cinco abas, e não seis, por decisão do usuário ao aprovar o plano:** Personagens é uma
// aba própria que contém o elenco E o equipamento — "só isso mesmo". Equipamento não é aba.
//
// `ABAS_DO_HUB` existe em runtime com o tipo derivado dela (o idioma de `TIPOS_DE_CONTEUDO`):
// o menu itera a lista, e uma aba nova sem rótulo no catálogo fica vermelha no teste de
// catálogo em vez de aparecer como chave crua na tela.

beforeEach(() => {
  useBattleStore.setState({ abaDoHub: 'campanha', introducaoAtual: null, introducoesVistas: [] });
});

describe('as abas do hub (M35 1/N)', () => {
  it('são cinco, nesta ordem — a campanha primeiro porque é a próxima ação de quem chega', () => {
    expect(ABAS_DO_HUB).toEqual(['campanha', 'masmorras', 'arena', 'personagens', 'invocacao']);
  });

  it('quem entra cai na campanha', () => {
    expect(useBattleStore.getState().abaDoHub).toBe('campanha');
  });

  it('escolher uma aba troca a aba, e só ela', () => {
    useBattleStore.getState().escolherAba('arena');
    expect(useBattleStore.getState().abaDoHub).toBe('arena');
    useBattleStore.getState().escolherAba('personagens');
    expect(useBattleStore.getState().abaDoHub).toBe('personagens');
  });

  it('abrir Invocação dispara a introdução de "primeiro summon" — o botão Atualizar que a disparava morreu', () => {
    useBattleStore.getState().escolherAba('invocacao');
    expect(useBattleStore.getState().introducaoAtual?.gatilho).toBe('primeiro-summon');
  });

  it('abrir qualquer outra aba NÃO dispara introdução nenhuma', () => {
    for (const aba of ABAS_DO_HUB.filter((a) => a !== 'invocacao')) {
      useBattleStore.getState().escolherAba(aba);
      expect(useBattleStore.getState().introducaoAtual, aba).toBeNull();
    }
  });

  it('a aba sobrevive a entrar e sair de uma batalha: quem saiu da masmorra volta para Masmorras', () => {
    useBattleStore.getState().escolherAba('masmorras');
    // `exitDungeon` é o caminho de volta de uma batalha de masmorra; ele zera o tabuleiro e o
    // ticket, e não pode mexer na aba — senão o jogador cai na campanha sem ter ido lá.
    useBattleStore.getState().exitDungeon();
    expect(useBattleStore.getState().abaDoHub).toBe('masmorras');
  });
});
