import { defineWorkspace } from 'vitest/config';

// Segunda execução dos testes de determinismo, em engines de JavaScript DE VERDADE.
//
// A config padrão (`vitest.config.ts`) roda em Node, ou seja, só em V8. Este workspace
// roda os MESMOS testes em Chromium (V8), Firefox (SpiderMonkey) e WebKit
// (JavaScriptCore). Se o hash congelado bater nas três engines, o replay é portável entre
// os navegadores dos jogadores — que é a garantia de que a arena de PvP depende.
//
// Não troque isto por jsdom ou happy-dom: os dois rodam DENTRO do Node, no mesmo V8.
// Trocam `document` e `window`, não a engine, e portanto nunca detectariam a divergência
// entre engines que este arquivo existe para detectar. Seria confiança falsa.
//
// Só `tests/determinism/` roda aqui, de propósito: o resto da suíte não ganha nada com o
// custo de subir três navegadores.
//
// Requer os navegadores baixados uma vez: `pnpm exec playwright install`

const browsers = ['chromium', 'firefox', 'webkit'] as const;

export default defineWorkspace(
  browsers.map((name) => ({
    test: {
      name: `core-${name}`,
      include: ['tests/determinism/**/*.test.ts'],
      browser: {
        enabled: true,
        provider: 'playwright' as const,
        name,
        headless: true,
        screenshotFailures: false,
      },
    },
  })),
);
