import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { BrowserWindow } from 'electron';

// §3.3/§9.4 (M21, sub-sessão 1/N) — o determinismo medido DENTRO do runtime empacotado.
//
// **É o critério que o roadmap chama de "a única prova que importa", e o job de CI que já
// existe não o cobre.** `determinismo-navegadores` prova que o core dá o mesmo hash em
// Chromium, Firefox e WebKit *de teste*, rodados pelo Playwright. Ele não diz nada sobre o
// runtime que o jogador terá na máquina: a versão de Chromium que o Electron embute, com as
// flags que o Electron usa, dentro do processo que o instalador entrega.
//
// A diferença não é acadêmica. O servidor re-simula todo replay (§9.4) e compara; se o V8 do
// shell divergir do V8 do servidor por versão, flag ou modo de compilação, o modo de falha é
// *"ganhei e o servidor disse que perdi, e gastou minha energia"*. Medir é a diferença entre
// saber e supor.
//
// **A medição roda no RENDERER, e isso é o ponto.** Medir no processo principal seria medir
// o Node do Electron — o mesmo V8 do servidor por construção — ou seja, responder a pergunta
// fácil e chamá-la de resposta. O jogo roda no renderer; é lá que o hash tem de bater.

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// O bundle IIFE produzido por `vite build` (ver `vite.config.ts`): o renderer não resolve
// pacotes de workspace sozinho, então a medição chega pronta, como texto.
const BUNDLE = path.join(__dirname, '..', 'dist-renderer', 'determinism.js');

export async function medirDeterminismo(): Promise<number> {
  const janela = new BrowserWindow({
    show: false,
    webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true },
  });

  try {
    // Uma página em branco de propósito: o que se mede é a ENGINE, e qualquer conteúdo real
    // traria variáveis que não são a pergunta.
    await janela.loadURL('about:blank');

    const fonte = readFileSync(BUNDLE, 'utf8');
    // O bundle traz o hash MEDIDO e o ESPERADO, os dois vindos da mesma fixture do core.
    // Nada aqui digita valor nenhum: valor digitado é valor que se copia errado, e o ponto
    // deste teste é não haver duas verdades sobre o hash canônico.
    const { hash, esperado } = (await janela.webContents.executeJavaScript(
      `${fonte}\n;globalThis.__PATHS_BEYOND_DETERMINISM__`,
    )) as { hash: string; esperado: string };

    // Saída em JSON e numa linha: o CI a lê, e uma divergência precisa dizer QUAL Chromium
    // divergiu — sem isso o relatório vira "não bateu" e a investigação começa do zero.
    console.log(
      JSON.stringify({
        runtime: 'electron-renderer',
        electron: process.versions.electron,
        chrome: process.versions.chrome,
        v8: process.versions.v8,
        hash,
        esperado,
        ok: hash === esperado,
      }),
    );

    if (hash !== esperado) {
      console.error(`hash divergente: shell=${hash} esperado=${esperado}`);
      return 1;
    }
    return 0;
  } finally {
    janela.destroy();
  }
}
