import { describe, expect, it } from 'vitest';
import { AUDIO_SILENCIOSO, criarMotorDeAudio, type ContextoDeAudio } from '../src/audio/audio.js';
import { PARAMETROS_DE_SOM, ganhoFinal } from '../src/audio/sons.js';

// §11/M16 (M24) — o motor de áudio, provado sem navegador.
//
// O `AudioContext` é injetado no mesmo padrão de `now`, `newNonce` e das pontes de plataforma
// do M21. É isso que permite afirmar o que este código faz: qual onda, com que ganho, em que
// instante — em vez de "rodei aqui e ouvi alguma coisa".

interface Nota {
  readonly onda: string;
  readonly hzInicial: number;
  readonly hzFinal: number;
  readonly ganho: number;
  readonly inicio: number;
  readonly fim: number;
}

function contextoFalso(agora = 10) {
  const notas: Nota[] = [];

  const contexto: ContextoDeAudio = {
    currentTime: agora,
    destination: {},
    createOscillator() {
      const nota: { onda: string; hzInicial: number; hzFinal: number; inicio: number; fim: number } = {
        onda: 'sine',
        hzInicial: 0,
        hzFinal: 0,
        inicio: 0,
        fim: 0,
      };
      emConstrucao.push(nota);
      return {
        set type(v: OscillatorType) {
          nota.onda = v;
        },
        get type() {
          return nota.onda as OscillatorType;
        },
        frequency: {
          setValueAtTime: (v: number, quando: number) => {
            nota.hzInicial = v;
            nota.inicio = quando;
          },
          linearRampToValueAtTime: (v: number, quando: number) => {
            nota.hzFinal = v;
            nota.fim = quando;
          },
        },
        connect: () => {},
        start: () => {},
        stop: () => {},
      };
    },
    createGain() {
      return {
        gain: {
          setValueAtTime: (v: number) => {
            ganhos.push(v);
          },
          linearRampToValueAtTime: () => {},
        },
        connect: () => {},
      };
    },
  };

  const emConstrucao: { onda: string; hzInicial: number; hzFinal: number; inicio: number; fim: number }[] = [];
  const ganhos: number[] = [];

  return {
    contexto,
    get notas() {
      return emConstrucao.map((n, i) => ({ ...n, ganho: ganhos[i] ?? 0 }) as Nota);
    },
  };
}

describe('criarMotorDeAudio()', () => {
  it('um golpe agenda um oscilador com a onda, a varredura e o ganho declarados', () => {
    const falso = contextoFalso(10);
    const motor = criarMotorDeAudio(falso.contexto, { efeitos: 1, musica: 1 });

    motor.tocar('golpe');

    expect(falso.notas).toHaveLength(1);
    const nota = falso.notas[0]!;
    expect(nota.onda).toBe(PARAMETROS_DE_SOM.golpe.onda);
    expect(nota.hzInicial).toBe(PARAMETROS_DE_SOM.golpe.hzInicial);
    expect(nota.hzFinal).toBe(PARAMETROS_DE_SOM.golpe.hzFinal);
    expect(nota.ganho).toBeCloseTo(ganhoFinal('golpe', { efeitos: 1, musica: 1 }));
    // O relógio do WebAudio é em SEGUNDOS, e a duração está em milissegundos: trocar as duas
    // unidades dá um som que dura 90 segundos e nada mais é audível depois dele.
    expect(nota.fim - nota.inicio).toBeCloseTo(PARAMETROS_DE_SOM.golpe.duracaoMs / 1000);
  });

  it('o atraso pedido em ms vira segundos no relógio do contexto', () => {
    const falso = contextoFalso(10);
    const motor = criarMotorDeAudio(falso.contexto, { efeitos: 1, musica: 1 });

    motor.tocar('golpe', 250);

    expect(falso.notas[0]!.inicio).toBeCloseTo(10.25);
  });

  it('volume no zero não gasta oscilador — silêncio não precisa ser tocado', () => {
    const falso = contextoFalso();
    const motor = criarMotorDeAudio(falso.contexto, { efeitos: 0, musica: 1 });

    motor.tocar('golpe');

    expect(falso.notas).toHaveLength(0);
  });

  it('mudar o volume vale para o próximo som', () => {
    const falso = contextoFalso();
    const motor = criarMotorDeAudio(falso.contexto, { efeitos: 1, musica: 1 });

    motor.definirVolumes({ efeitos: 0, musica: 1 });
    motor.tocar('golpe');

    expect(falso.notas).toHaveLength(0);
  });

  it('a sequência filtra o borrão antes de agendar', () => {
    // Três golpes colados viram um; o mesmo cenário que `semBorrao` descreve, agora provado
    // do lado de quem realmente cria os osciladores.
    const falso = contextoFalso();
    const motor = criarMotorDeAudio(falso.contexto, { efeitos: 1, musica: 1 });

    motor.tocarSequencia([
      { som: 'golpe', atMs: 0 },
      { som: 'golpe', atMs: 10 },
      { som: 'golpe', atMs: 20 },
      { som: 'morte', atMs: 15 },
    ]);

    expect(falso.notas).toHaveLength(2);
  });

  it('sem contexto, o motor é silencioso e ninguém precisa perguntar', () => {
    // Navegador sem WebAudio, teste em Node, política de autoplay recusando o contexto: nos
    // três o jogo abre igual, e quem chama `tocar` não muda uma linha.
    const motor = criarMotorDeAudio(null);

    expect(motor.disponivel).toBe(false);
    expect(() => motor.tocar('morte')).not.toThrow();
    expect(AUDIO_SILENCIOSO.disponivel).toBe(false);
  });

  it('um contexto que LANÇA não derruba a batalha', () => {
    const quebrado: ContextoDeAudio = {
      currentTime: 0,
      destination: {},
      createOscillator() {
        throw new Error('contexto fechado');
      },
      createGain() {
        throw new Error('contexto fechado');
      },
    };
    const motor = criarMotorDeAudio(quebrado, { efeitos: 1, musica: 1 });

    expect(() => motor.tocar('golpe')).not.toThrow();
  });
});
