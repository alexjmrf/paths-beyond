// §11/M16 (M24) — o SOM, e por que ele é sintetizado.
//
// **Decisão do usuário, com o precedente do M16.** O projeto escolheu linguagem visual
// programática e proibiu arquivo de imagem no repositório; som gerado por oscilador segue a
// mesma regra pelo mesmo motivo: não pesa no download (o Electron já custa ~130 MB), não
// precisa de licença nem de pipeline de asset, e **é testável** — dá para afirmar a forma de
// onda, o ganho e o instante de cada som, coisa que um `.ogg` não permite. O preço, dito de
// frente: som sintetizado tem teto de qualidade. Isto é arcade, não orquestra.
//
// **Por que o som importa neste jogo específico.** O duelo é automático: o jogador decide
// antes e ASSISTE ao resultado. O M16 construiu peso e timing no visual (`motion.ts`); som é
// a outra metade da mesma leitura de impacto — sem ele, um golpe que tira 40 e um que tira 4
// têm exatamente a mesma presença.

export type Som = 'golpe' | 'contra-ataque' | 'morte' | 'cura' | 'turno';

export type CategoriaDeAudio = 'efeitos' | 'musica';

export interface ParametrosDeSom {
  readonly categoria: CategoriaDeAudio;
  readonly onda: OscillatorType;
  // A varredura de frequência: começa em `hzInicial` e chega a `hzFinal` no fim do som. É
  // ela que dá caráter — o golpe DESCE (impacto), a cura SOBE (alívio).
  readonly hzInicial: number;
  readonly hzFinal: number;
  readonly duracaoMs: number;
  // Ganho de base do som, antes do volume da categoria. É o que faz a morte pesar mais que
  // uma transição de turno sem o jogador ter de mexer em dois controles.
  readonly ganho: number;
}

// Os cinco sons que o critério de aceite nomeia. Cada um foi desenhado contra a batida que
// `motion.ts` já define, e não contra o gosto: a morte dura o mesmo que `DEATH_MS` (260ms),
// e o golpe cabe dentro do pico de impacto.
export const PARAMETROS_DE_SOM: Readonly<Record<Som, ParametrosDeSom>> = {
  // Curto e grave, com queda: o corpo do impacto.
  golpe: { categoria: 'efeitos', onda: 'square', hzInicial: 220, hzFinal: 80, duracaoMs: 90, ganho: 0.5 },
  // O contra-ataque é o MESMO evento visto do outro lado, e por isso soa parecido — mais
  // agudo e mais curto. Fosse um som completamente diferente, ele leria como uma terceira
  // unidade entrando na briga.
  'contra-ataque': { categoria: 'efeitos', onda: 'square', hzInicial: 320, hzFinal: 140, duracaoMs: 70, ganho: 0.38 },
  // A queda: longa e descendente, casada com `DEATH_MS` de `motion.ts`.
  morte: { categoria: 'efeitos', onda: 'sawtooth', hzInicial: 180, hzFinal: 40, duracaoMs: 260, ganho: 0.55 },
  // Sobe, e é senoide: é o único som do jogo que não é um choque.
  cura: { categoria: 'efeitos', onda: 'sine', hzInicial: 440, hzFinal: 660, duracaoMs: 200, ganho: 0.32 },
  // A transição de turno é pontuação, não evento: baixa e curtíssima, para marcar o compasso
  // sem competir com o que acontece dentro dele.
  turno: { categoria: 'efeitos', onda: 'triangle', hzInicial: 520, hzFinal: 520, duracaoMs: 45, ganho: 0.18 },
};

export interface VolumesDeAudio {
  readonly efeitos: number;
  readonly musica: number;
}

export const VOLUMES_PADRAO: VolumesDeAudio = { efeitos: 0.7, musica: 0.5 };

/**
 * O ganho final de um som: o ganho de base dele vezes o volume da categoria.
 *
 * Volume fora de [0, 1] é preferência corrompida e não motivo para estourar o alto-falante
 * de alguém — cai na faixa em vez de multiplicar o ganho por 12.
 */
export function ganhoFinal(som: Som, volumes: VolumesDeAudio): number {
  const parametros = PARAMETROS_DE_SOM[som];
  const volume = Math.max(0, Math.min(1, volumes[parametros.categoria]));
  return parametros.ganho * volume;
}

export interface SomAgendado {
  readonly som: Som;
  readonly atMs: number;
}

// A pausa mínima entre dois sons IGUAIS. É o mesmo `SCENE_GAP_MS` que `MapCanvas` usa entre
// cenas, e não um número novo: o critério de aceite pede que o áudio respeite as pausas entre
// cenas em vez de virar borrão, e ter dois números para a mesma pausa faria os dois divergirem
// no primeiro ajuste.
export const PAUSA_MINIMA_MS = 90;

/**
 * Remove o que viraria borrão.
 *
 * **O caso real:** várias unidades agindo em sequência, cada duelo com três trocas, todos os
 * golpes caindo em poucos décimos de segundo. Tocados todos, eles somam num chiado contínuo
 * em que nenhum golpe é audível — o oposto de "leitura de impacto".
 *
 * A regra é por TIPO de som: um golpe não silencia uma morte que aconteceu junto (são
 * informações diferentes, e a morte é a que o jogador precisa ouvir). Vence o PRIMEIRO, e não
 * o mais alto, porque o primeiro é o que já está tocando quando o segundo chega.
 */
export function semBorrao(sons: readonly SomAgendado[], pausaMs: number = PAUSA_MINIMA_MS): SomAgendado[] {
  const ultimoPorSom = new Map<Som, number>();
  const mantidos: SomAgendado[] = [];

  for (const agendado of [...sons].sort((a, b) => a.atMs - b.atMs)) {
    const ultimo = ultimoPorSom.get(agendado.som);
    if (ultimo !== undefined && agendado.atMs - ultimo < pausaMs) continue;
    ultimoPorSom.set(agendado.som, agendado.atMs);
    mantidos.push(agendado);
  }

  return mantidos;
}

/**
 * O som de cada batida do duelo.
 *
 * A tradução mora aqui, e não dentro do tabuleiro, para poder ser afirmada em teste: o
 * critério de aceite pede som "sincronizado com as batidas que `motion.ts` já define", e o
 * primeiro jeito de quebrar isso é o mapeamento errar o evento — um contra-ataque soando como
 * golpe faz o jogador achar que bateu quando apanhou.
 *
 * `null` para o que não soa: hoje nada, mas uma batida futura que seja só visual não deve
 * inventar um som por omissão.
 */
export function somDaBatida(kind: 'strike' | 'counter' | 'heal' | 'death'): Som | null {
  switch (kind) {
    case 'strike':
      return 'golpe';
    case 'counter':
      return 'contra-ataque';
    case 'heal':
      return 'cura';
    case 'death':
      return 'morte';
    default:
      return null;
  }
}
