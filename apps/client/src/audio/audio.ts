import { PARAMETROS_DE_SOM, VOLUMES_PADRAO, ganhoFinal, semBorrao, type Som, type SomAgendado, type VolumesDeAudio } from './sons.js';

// §11/M16 (M24) — o motor de áudio.
//
// **Sintetizado, sem um arquivo de som no repositório.** Cada som é um oscilador com uma
// varredura de frequência e um envelope de ganho — os números estão em `sons.ts`, com o
// argumento. Aqui mora só o encanamento: criar o grafo, agendá-lo no relógio do
// `AudioContext` e desligar o que terminou.
//
// **O contexto é INJETADO**, no mesmo padrão de `now`, `newNonce` e das pontes de plataforma
// do M21: sem isso, provar que um golpe agenda um oscilador com o ganho certo exigiria um
// navegador. Com isso, exige um objeto de mentira.
//
// **Nada aqui pode derrubar o jogo.** Áudio é a camada mais descartável que existe: o
// navegador pode recusar o contexto (política de autoplay), a máquina pode não ter saída de
// som, o contexto pode estar suspenso. Em todos os casos o jogo roda igual e em silêncio.

// A fatia da API do WebAudio que este projeto usa, declarada em vez de importada do DOM: é o
// que permite ao teste montar um contexto de mentira sem simular o navegador inteiro.
export interface OsciladorDeAudio {
  type: OscillatorType;
  readonly frequency: {
    setValueAtTime(valor: number, quando: number): void;
    linearRampToValueAtTime(valor: number, quando: number): void;
  };
  connect(destino: unknown): void;
  start(quando: number): void;
  stop(quando: number): void;
}

export interface GanhoDeAudio {
  readonly gain: {
    setValueAtTime(valor: number, quando: number): void;
    linearRampToValueAtTime(valor: number, quando: number): void;
  };
  connect(destino: unknown): void;
}

export interface ContextoDeAudio {
  readonly currentTime: number;
  readonly destination: unknown;
  readonly state?: string;
  createOscillator(): OsciladorDeAudio;
  createGain(): GanhoDeAudio;
  resume?(): Promise<void> | void;
}

export interface MotorDeAudio {
  /** Agenda um som daqui a `emMs` milissegundos. */
  tocar(som: Som, emMs?: number): void;
  /** Agenda uma sequência já posicionada no tempo, filtrando o que viraria borrão. */
  tocarSequencia(sons: readonly SomAgendado[]): void;
  definirVolumes(volumes: VolumesDeAudio): void;
  readonly disponivel: boolean;
}

// O motor SILENCIOSO: mesma superfície, nenhuma nota. É o que o jogo usa quando não há áudio
// possível — e é por ele existir que nenhum chamador precisa perguntar se há som antes de
// pedir um.
export const AUDIO_SILENCIOSO: MotorDeAudio = {
  tocar: () => {},
  tocarSequencia: () => {},
  definirVolumes: () => {},
  disponivel: false,
};

export function criarMotorDeAudio(
  contexto: ContextoDeAudio | null,
  volumesIniciais: VolumesDeAudio = VOLUMES_PADRAO,
): MotorDeAudio {
  if (!contexto) return AUDIO_SILENCIOSO;

  let volumes = volumesIniciais;

  function agendar(som: Som, emMs: number): void {
    const ganho = ganhoFinal(som, volumes);
    // Ganho zero é o controle no zero: não vale gastar um oscilador para tocar silêncio.
    if (ganho <= 0) return;

    const parametros = PARAMETROS_DE_SOM[som];
    const inicio = contexto!.currentTime + Math.max(0, emMs) / 1000;
    const fim = inicio + parametros.duracaoMs / 1000;

    try {
      const oscilador = contexto!.createOscillator();
      const volume = contexto!.createGain();

      oscilador.type = parametros.onda;
      oscilador.frequency.setValueAtTime(parametros.hzInicial, inicio);
      // A varredura é o caráter do som: o golpe desce, a cura sobe (ver `sons.ts`).
      oscilador.frequency.linearRampToValueAtTime(parametros.hzFinal, fim);

      // Envelope: ataque instantâneo e queda até zero. **Até zero, e não até o fim seco** —
      // cortar um oscilador em amplitude cheia produz um clique que se ouve em todo som e
      // não pertence a nenhum deles.
      volume.gain.setValueAtTime(ganho, inicio);
      volume.gain.linearRampToValueAtTime(0, fim);

      oscilador.connect(volume);
      volume.connect(contexto!.destination);
      oscilador.start(inicio);
      oscilador.stop(fim);
    } catch {
      // Contexto fechado no meio de uma batalha, limite de nós atingido: o jogo continua.
    }
  }

  return {
    tocar: (som, emMs = 0) => agendar(som, emMs),
    tocarSequencia: (sons) => {
      for (const agendado of semBorrao(sons)) agendar(agendado.som, agendado.atMs);
    },
    definirVolumes: (novos) => {
      volumes = novos;
    },
    disponivel: true,
  };
}

/**
 * O contexto do navegador, ou `null`.
 *
 * `null` não é falha: é navegador sem WebAudio, é ambiente de teste em Node, e é a política
 * de autoplay recusando criar o contexto antes do primeiro clique. O jogo abre igual nos três.
 */
export function contextoDoNavegador(): ContextoDeAudio | null {
  try {
    const Construtor = (globalThis as { AudioContext?: new () => ContextoDeAudio }).AudioContext;
    if (!Construtor) return null;
    return new Construtor();
  } catch {
    return null;
  }
}
