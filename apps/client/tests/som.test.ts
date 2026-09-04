import { describe, expect, it } from 'vitest';
import {
  somDaBatida,
  PARAMETROS_DE_SOM,
  PAUSA_MINIMA_MS,
  VOLUMES_PADRAO,
  ganhoFinal,
  semBorrao,
  type Som,
} from '../src/audio/sons.js';

// §11/M16 (M24) — o áudio, na parte que dá para afirmar.
//
// O som é SINTETIZADO (decisão do usuário, precedente do M16: linguagem programática, nada de
// asset binário no repositório), e é justamente isso que o torna testável: forma de onda,
// ganho e instante são números, não a impressão de quem ouviu. O que este arquivo NÃO julga é
// se soa bem — isso é do usuário, como a estética sempre foi neste projeto.

const TODOS: readonly Som[] = ['golpe', 'contra-ataque', 'morte', 'cura', 'turno'];

describe('o catálogo de sons', () => {
  it('cobre os cinco eventos que o critério de aceite nomeia', () => {
    // golpe, contra-ataque, morte, cura e transição de turno.
    for (const som of TODOS) expect(PARAMETROS_DE_SOM[som], som).toBeDefined();
  });

  it('todo som tem duração positiva e ganho na faixa audível', () => {
    for (const som of TODOS) {
      const p = PARAMETROS_DE_SOM[som];
      expect(p.duracaoMs, som).toBeGreaterThan(0);
      expect(p.ganho, som).toBeGreaterThan(0);
      // Acima de 1 o ganho satura e vira estalo; é o tipo de erro que só aparece no
      // alto-falante de outra pessoa.
      expect(p.ganho, som).toBeLessThanOrEqual(1);
    }
  });

  it('a morte dura o mesmo que a queda desenhada em `motion.ts`', () => {
    // `DEATH_MS = 260`. Som e imagem terminando em instantes diferentes é o jeito mais barato
    // de a morte perder peso — o mesmo argumento que M16 usou para casar tremor e número.
    expect(PARAMETROS_DE_SOM.morte.duracaoMs).toBe(260);
  });

  it('o golpe DESCE e a cura SOBE', () => {
    // O caráter dos dois está na direção da varredura: impacto cai, alívio sobe. É o que
    // permite distinguir um do outro sem olhar a tela.
    expect(PARAMETROS_DE_SOM.golpe.hzFinal).toBeLessThan(PARAMETROS_DE_SOM.golpe.hzInicial);
    expect(PARAMETROS_DE_SOM.cura.hzFinal).toBeGreaterThan(PARAMETROS_DE_SOM.cura.hzInicial);
  });

  it('o contra-ataque soa como parente do golpe, e não como outro evento', () => {
    // Mais agudo e mais curto: é o mesmo choque visto do outro lado. Um som completamente
    // diferente leria como uma terceira unidade entrando na briga.
    expect(PARAMETROS_DE_SOM['contra-ataque'].hzInicial).toBeGreaterThan(PARAMETROS_DE_SOM.golpe.hzInicial);
    expect(PARAMETROS_DE_SOM['contra-ataque'].duracaoMs).toBeLessThan(PARAMETROS_DE_SOM.golpe.duracaoMs);
  });

  it('a transição de turno é a mais discreta de todas', () => {
    // Ela é pontuação, não evento: se competir com o que acontece dentro do turno, atrapalha
    // exatamente a leitura que o áudio existe para dar.
    for (const som of TODOS.filter((s) => s !== 'turno')) {
      expect(PARAMETROS_DE_SOM.turno.ganho, som).toBeLessThan(PARAMETROS_DE_SOM[som].ganho);
    }
  });
});

describe('ganhoFinal()', () => {
  it('multiplica o ganho do som pelo volume da CATEGORIA', () => {
    expect(ganhoFinal('golpe', { efeitos: 0.5, musica: 1 })).toBeCloseTo(PARAMETROS_DE_SOM.golpe.ganho * 0.5);
  });

  it('volume zero silencia — e é assim que o controle desliga', () => {
    expect(ganhoFinal('morte', { efeitos: 0, musica: 1 })).toBe(0);
  });

  it('o volume da MÚSICA não mexe nos efeitos', () => {
    // Os dois controles são separados porque servem a coisas diferentes: quem joga ouvindo
    // podcast desliga a música e continua precisando ouvir o golpe.
    const comMusica = ganhoFinal('golpe', { efeitos: 0.7, musica: 1 });
    const semMusica = ganhoFinal('golpe', { efeitos: 0.7, musica: 0 });

    expect(comMusica).toBe(semMusica);
  });

  it('volume corrompido cai na faixa em vez de estourar o alto-falante', () => {
    // O volume vem do save, que é disco do jogador: pode ter sido editado à mão.
    expect(ganhoFinal('golpe', { efeitos: 12, musica: 1 })).toBe(PARAMETROS_DE_SOM.golpe.ganho);
    expect(ganhoFinal('golpe', { efeitos: -3, musica: 1 })).toBe(0);
  });

  it('os volumes padrão deixam som audível nos dois canais', () => {
    expect(VOLUMES_PADRAO.efeitos).toBeGreaterThan(0);
    expect(VOLUMES_PADRAO.musica).toBeGreaterThan(0);
  });
});

describe('semBorrao()', () => {
  it('deixa passar sons espaçados', () => {
    const sons = [
      { som: 'golpe' as const, atMs: 0 },
      { som: 'golpe' as const, atMs: PAUSA_MINIMA_MS },
      { som: 'golpe' as const, atMs: PAUSA_MINIMA_MS * 2 },
    ];

    expect(semBorrao(sons)).toHaveLength(3);
  });

  it('descarta o som igual que chega colado — o caso das várias unidades em sequência', () => {
    // Três trocas por duelo, várias unidades agindo em fila: tocados todos, os golpes somam
    // num chiado em que nenhum é audível, que é o oposto de leitura de impacto.
    const sons = [
      { som: 'golpe' as const, atMs: 0 },
      { som: 'golpe' as const, atMs: 10 },
      { som: 'golpe' as const, atMs: 20 },
    ];

    expect(semBorrao(sons)).toEqual([{ som: 'golpe', atMs: 0 }]);
  });

  it('vence o PRIMEIRO, porque é ele que já está tocando quando o segundo chega', () => {
    expect(semBorrao([{ som: 'morte', atMs: 30 }, { som: 'morte', atMs: 0 }])).toEqual([
      { som: 'morte', atMs: 0 },
    ]);
  });

  it('a regra é por TIPO — um golpe não silencia a morte que aconteceu junto', () => {
    // São informações diferentes, e a morte é a que o jogador precisa ouvir.
    const sons = [
      { som: 'golpe' as const, atMs: 0 },
      { som: 'morte' as const, atMs: 5 },
      { som: 'cura' as const, atMs: 10 },
    ];

    expect(semBorrao(sons)).toHaveLength(3);
  });

  it('a pausa mínima é a MESMA que a das cenas — um número só para a mesma pausa', () => {
    // `SCENE_GAP_MS` em `MapCanvas` vale 90ms. Dois números para a mesma coisa divergiriam no
    // primeiro ajuste, e o áudio deixaria de acompanhar a animação sem nada ficar vermelho.
    expect(PAUSA_MINIMA_MS).toBe(90);
  });
});

describe('somDaBatida()', () => {
  // O critério de aceite pede som "sincronizado com as batidas que `motion.ts` já define". A
  // sincronia em si é estrutural (o tabuleiro agenda o som na MESMA linha do tempo da
  // animação); o que dá para errar aqui é o mapeamento — e um contra-ataque soando como golpe
  // faz o jogador achar que bateu quando apanhou.
  it('cada batida do duelo tem o seu som', () => {
    expect(somDaBatida('strike')).toBe('golpe');
    expect(somDaBatida('counter')).toBe('contra-ataque');
    expect(somDaBatida('heal')).toBe('cura');
    expect(somDaBatida('death')).toBe('morte');
  });

  it('batida desconhecida não inventa som', () => {
    expect(somDaBatida('coisa-nova' as never)).toBeNull();
  });
});
