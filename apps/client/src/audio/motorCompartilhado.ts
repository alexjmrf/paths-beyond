import { contextoDoNavegador, criarMotorDeAudio, type MotorDeAudio } from './audio.js';
import { VOLUMES_PADRAO, type VolumesDeAudio } from './sons.js';

// §11 (M24) — o motor de áudio do jogo, um só.
//
// **Criado sob demanda, e não na carga do módulo.** A política de autoplay dos navegadores
// recusa um `AudioContext` criado antes do primeiro gesto do jogador — criá-lo no import
// daria um contexto suspenso que nunca toca nada, e o defeito apareceria como "o jogo não tem
// som" sem erro nenhum. Adiando até o primeiro som pedido, o contexto nasce dentro de uma
// batalha, que só começa depois de o jogador clicar.
//
// **Um só para o jogo inteiro** porque `AudioContext` é caro e limitado: alguns navegadores
// cortam em seis por aba, e um por componente esgotaria a conta numa tela com painel,
// tabuleiro e overlay.

let motor: MotorDeAudio | null = null;
let volumes: VolumesDeAudio = VOLUMES_PADRAO;

export function audioDoJogo(): MotorDeAudio {
  if (!motor) motor = criarMotorDeAudio(contextoDoNavegador(), volumes);
  return motor;
}

/** Aplica os volumes vindos do save/da tela, agora e para o motor que ainda não nasceu. */
export function definirVolumesDoJogo(novos: VolumesDeAudio): void {
  volumes = novos;
  motor?.definirVolumes(novos);
}

// Só para teste: devolve o módulo ao estado de quem nunca pediu som.
export function reiniciarAudioDoJogo(): void {
  motor = null;
  volumes = VOLUMES_PADRAO;
}
