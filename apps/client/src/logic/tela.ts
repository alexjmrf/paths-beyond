// M32 — QUAL TELA o jogador vê.
//
// **O problema que isto resolve.** `App.tsx` desenhava tudo o tempo todo: tabuleiro vazio
// com "Round 1" e "0 inimigo(s) de pé", oito painéis com o mesmo peso, e o botão de entrar
// escondido dentro de um chamado "PvP — arena" — com Campanha, Masmorras e Invocação
// mandando o jogador "entrar no painel de PvP". Foi a primeira coisa que o usuário viu ao
// instalar o jogo em outra máquina (critério 3 do M28), e é o que o M32 existe para tirar da
// frente do playtest: sem isto o estranho trava antes de chegar a qualquer regra.
//
// **Três telas, e a ordem é de bloqueio.** Sem sessão não há o que jogar — o jogo é
// sempre-online por decisão (D21) e o sign-in é explícito (M20) —, então a única coisa na
// tela é entrar. Com sessão e sem batalha, o hub: a campanha, as masmorras, a invocação e a
// arena, SEM tabuleiro (um grid vazio ao lado da lista de missões é o mesmo defeito de
// antes, com outro nome). Com unidades no tabuleiro, a batalha.
//
// É uma função pura sobre o estado, e não um `if` dentro do JSX, pelo mesmo motivo de
// `capituloInicialAberto`: o que este projeto testa é a store, e uma decisão que só existe
// no componente só se prova abrindo o navegador.

export type TelaDoJogo = 'entrada' | 'hub' | 'batalha';

export interface EstadoDaTela {
  readonly pvp: { readonly me: unknown | null };
  readonly battleState: { readonly units: readonly unknown[] };
}

export function telaDoJogo(estado: EstadoDaTela): TelaDoJogo {
  if (estado.pvp.me === null) return 'entrada';
  // "Há batalha" é "há peças no tabuleiro": todo caminho que começa uma batalha (campanha,
  // arena, masmorra) passa por `buildInitialState`, e todo caminho que sai dela volta a
  // `tabuleiroVazio()`. Olhar o ticket de cada modo seria três perguntas para a mesma coisa.
  return estado.battleState.units.length > 0 ? 'batalha' : 'hub';
}

// M35 1/N (D41) — o hub é UM menu e UMA aba por vez.
//
// O veredito do usuário sobre o M32, com sessão de verdade: "está tudo muito misturado".
// Quatro painéis lado a lado com o mesmo peso são o hub do M13 com menos coisas. A forma de
// referência do gênero (Epic Seven, Summoners War) é um menu com abas e só a aba escolhida na
// tela. A aba é estado da store pelo mesmo motivo de `telaDoJogo`: decisão que só existe no
// componente só se prova abrindo o navegador.
//
// Cinco abas, por decisão do usuário ao aprovar o plano: Personagens contém o elenco E o
// equipamento — "só isso mesmo"; Equipamento não é aba. A campanha vem primeiro porque é a
// próxima ação de quem chega (D40). Lista em runtime com o tipo derivado dela, como
// `TIPOS_DE_CONTEUDO`: o menu a itera, e uma aba nova sem rótulo fica vermelha no catálogo.
export const ABAS_DO_HUB = ['campanha', 'masmorras', 'arena', 'personagens', 'invocacao'] as const;

export type AbaDoHub = (typeof ABAS_DO_HUB)[number];
