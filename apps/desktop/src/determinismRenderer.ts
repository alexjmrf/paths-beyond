import { hashState, simulate } from '@paths-beyond/core';
// A FIXTURE canônica, importada do pacote do core por caminho relativo.
//
// Ela mora em `tests/` porque nasceu como fixture de teste (M1/M3), e é deliberadamente a
// mesma que `crossRuntime.test.ts` usa em Node e nos três navegadores. Copiá-la para cá
// daria dois replays "canônicos", e no dia em que divergissem os dois testes continuariam
// verdes medindo coisas diferentes — que é o modo de falha que este arquivo existe para
// evitar, não para criar.
import { GOLDEN_HASH, buildGoldenReplay } from '../../../packages/core/tests/determinism/goldenReplay.js';

// Roda no RENDERER do Electron — o mesmo processo em que o jogo roda. O resultado sai por
// uma global porque quem lê é `executeJavaScript` do processo principal.
declare global {
  // eslint-disable-next-line no-var
  var __PATHS_BEYOND_DETERMINISM__: { readonly hash: string; readonly esperado: string } | undefined;
}

// O ESPERADO vem da mesma fixture, e não de uma variável de ambiente que alguém digita: um
// valor digitado é um valor que se copia errado, e o ponto do teste é justamente não haver
// duas verdades sobre o hash canônico.
globalThis.__PATHS_BEYOND_DETERMINISM__ = {
  hash: hashState(simulate(buildGoldenReplay())),
  esperado: GOLDEN_HASH,
};
