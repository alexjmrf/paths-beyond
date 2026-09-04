// §1.1/§11 (M23, sub-sessão 1/N) — a INTRODUÇÃO contextual.
//
// **O problema que ela resolve, escrito no roadmap:** ninguém nunca jogou este jogo sem
// saber como ele funciona. Duelo automático com script tático programado antes do combate,
// AP/PP que duram a batalha inteira, assistência por adjacência, árvore por personagem e
// gacha — é regra demais para descobrir sozinho, e o pilar de §1.1 (legibilidade tática)
// exige que o jogador consiga prever o resultado ANTES de confirmar.
//
// **A forma é decidida pelo roadmap e não por mim:** cada conceito é explicado no ponto em
// que aparece pela primeira vez, e não num paredão de texto inicial. Um paredão é lido por
// ninguém, e quem o lê não retém — e o conceito só faz sentido com a tela dele na frente.
//
// **Onde isto mora, e por quê.** É estado de APRESENTAÇÃO: o servidor não precisa saber
// quais dicas o jogador já dispensou, e guardá-lo lá custaria uma rota e uma coluna para
// algo que, se perder, no pior caso mostra uma caixa de texto de novo. Vai no save local,
// ao lado de `uiScale` e `colorblindMode` — que é exatamente o que o save passou a ser
// depois do M18 7/N.

export const GATILHOS_DA_INTRODUCAO = [
  // O jogador selecionou um alvo e viu o resultado do duelo ANTES de confirmar. É o recurso
  // mais importante do jogo segundo §11, e é o momento em que "duelo automático" deixa de
  // ser abstrato.
  'preview-de-duelo',
  // O painel do exército, com AP e PP à vista pela primeira vez.
  'recursos-ap-pp',
  // O editor de táticas aberto: é aqui que o jogador descobre que ele PROGRAMA a unidade em
  // vez de comandá-la no meio do duelo.
  'script-tatico',
  // A tela de invocação, onde aparecem moeda premium, banner e pity.
  'primeiro-summon',
  // A arena: assíncrona, contra a defesa que outra pessoa montou, e com ELO.
  'primeira-arena',
] as const;

export type GatilhoDeIntroducao = (typeof GATILHOS_DA_INTRODUCAO)[number];

export interface Introducao {
  readonly gatilho: GatilhoDeIntroducao;
  readonly titulo: string;
  readonly texto: string;
}

// O texto é curto de propósito, e o teste trava o tamanho: uma caixa que o jogador fecha sem
// ler não explicou nada, e o limite é a diferença entre uma dica e o paredão que o roadmap
// proíbe. Cada uma responde a pergunta que a TELA levanta, não a que a spec responde.
export const INTRODUCOES: readonly Introducao[] = [
  {
    gatilho: 'preview-de-duelo',
    titulo: 'O duelo se resolve sozinho',
    texto:
      'Você escolhe QUEM ataca quem; o resto é automático, em até 3 trocas. O resultado abaixo já é o ' +
      'verdadeiro — se confirmar, é exatamente isso que acontece. Nada de sorte escondida.',
  },
  {
    gatilho: 'recursos-ap-pp',
    titulo: 'AP e PP duram a batalha inteira',
    texto:
      'AP paga habilidades; PP paga reações, como contra-atacar. Eles NÃO voltam sozinhos entre duelos: ' +
      'quem gastou tudo no começo chega sem nada no fim. Descansar recupera, mas custa o turno.',
  },
  {
    gatilho: 'script-tatico',
    titulo: 'Você programa a unidade antes, não durante',
    texto:
      'No duelo ela segue este script, linha por linha, na ordem: a primeira condição verdadeira decide a ação. ' +
      'É por isso que dá para prever o combate — a unidade faz o que você escreveu, sempre.',
  },
  {
    gatilho: 'primeiro-summon',
    titulo: 'Invocação, e o contador que garante',
    texto:
      'Invocar gasta a moeda premium. O contador ao lado do banner é a garantia: ao chegar no número, a ' +
      'próxima invocação vem no raro garantido. Personagem repetido vira fragmento de vínculo.',
  },
  {
    gatilho: 'primeira-arena',
    titulo: 'A arena é assíncrona',
    texto:
      'Você não enfrenta a pessoa: enfrenta a defesa que ela montou e deixou salva. A sua defesa faz o mesmo ' +
      'enquanto você está fora. Ganhar e perder mexem no seu ELO, que é quem escolhe seus próximos oponentes.',
  },
];

const PORgatilho = new Map<string, Introducao>(INTRODUCOES.map((i) => [i.gatilho, i]));

/**
 * A introdução que este gatilho deve mostrar agora, ou `null`.
 *
 * `null` cobre os três casos em que não se mostra nada, e nenhum deles é erro: já foi vista,
 * o gatilho não tem texto, ou o gatilho nem existe — este último porque as chamadas vêm
 * espalhadas pela UI, e um nome errado tem de virar silêncio e não uma tela quebrada no meio
 * de uma batalha.
 */
export function proximaIntroducao(gatilho: GatilhoDeIntroducao, vistos: readonly string[]): Introducao | null {
  if (vistos.includes(gatilho)) return null;
  return PORgatilho.get(gatilho) ?? null;
}

/**
 * Marca uma introdução como vista.
 *
 * **Preserva ids desconhecidos** de propósito: o save pode ter sido escrito por uma versão
 * mais nova do jogo, e descartar o que esta versão não conhece faria o jogador rever, aqui,
 * uma dica que ele já dispensou lá.
 */
export function marcarIntroducaoVista(vistos: readonly string[], gatilho: GatilhoDeIntroducao): string[] {
  return vistos.includes(gatilho) ? [...vistos] : [...vistos, gatilho];
}
