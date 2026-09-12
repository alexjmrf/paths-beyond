import { randomUUID } from 'node:crypto';
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { BrowserWindow, app, ipcMain, shell } from 'electron';
import { resolverApiBaseUrl } from './ambiente.js';
import { identidadeDeDesenvolvimento } from './identidadeDev.js';
// **`electron-updater` é CommonJS e este pacote é ESM.** O import NOMEADO compila e falha na
// carga do app, com "Named export 'autoUpdater' not found" — e o app simplesmente não abre.
// Custou uma rodada de empacotamento e instalação para aparecer, porque o TypeScript aceita a
// forma que o runtime recusa. O `--determinismo` do binário empacotado (2/N), que o workflow
// de release roda em cada plataforma, é o que pega isso antes de um jogador pegar.
import electronUpdaterPkg from 'electron-updater';
import { criarPortaDaPlataforma, sincronizarPedidoDoRenderer, type PlatformAchievements } from './achievements.js';
import { medirDeterminismo } from './determinism.js';
import {
  contextoDoAmbiente,
  ligarAtualizacao,
  type AtualizadorDePlataforma,
  type ControleDeAtualizacao,
  type EstadoDaAtualizacao,
} from './updates.js';

const { autoUpdater } = electronUpdaterPkg;

// §2/§9.4 (M21, sub-sessão 1/N) — o SHELL DESKTOP.
//
// A primeira vez que o jogo vira uma coisa que se instala. A escolha de Electron sobre Tauri
// está escrita em `docs/spec/01-fundacoes-tecnicas.md` §2 **com o argumento**, e ele é do
// próprio projeto: o servidor roda Node (V8) e re-simula todo replay; Electron embute
// Chromium (V8) numa versão que nós congelamos, então cliente e servidor comparam hash na
// mesma engine. Tauri usaria JavaScriptCore no macOS e no Steam Deck e reintroduziria em
// produção a divergência de runtime que o ponto fixo existe para eliminar.
//
// Este arquivo faz três coisas e nenhuma delas é regra de jogo: abre a janela, responde ao
// pedido de ticket, e impede o shell de virar um navegador de propósito geral.

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Em desenvolvimento a janela aponta para o Vite (o mesmo laço de sempre); empacotado, para
// o `index.html` buildado do cliente. Nenhuma outra diferença entre os dois modos — o
// cliente não sabe em qual está.
const DEV_SERVER_URL = process.env.PATHS_BEYOND_DEV_URL;

function createWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 1440,
    height: 900,
    backgroundColor: '#111827',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      // As três travas que fazem o `preload` significar alguma coisa. Sem elas, o renderer
      // alcançaria o `require` do Node e o módulo nativo da Steam direto, e a "ponte" seria
      // decoração.
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  if (DEV_SERVER_URL) {
    void window.loadURL(DEV_SERVER_URL);
  } else {
    // Empacotado, o cliente vive em `resources/client` (ver `extraResources` no
    // `package.json`): dentro do asar ele não existe como caminho de disco, e
    // `process.resourcesPath` é o único jeito de alcançá-lo. Fora do pacote — rodando o
    // `main.js` direto do `dist/` — o caminho é relativo ao workspace, que é o que torna a
    // 1/N ainda executável sem empacotar nada.
    const empacotado = path.join(process.resourcesPath, 'client', 'index.html');
    const local = path.join(__dirname, '..', '..', 'client', 'dist', 'index.html');
    void window.loadFile(existsSync(empacotado) ? empacotado : local);
  }

  // Um jogo não é um navegador: link externo abre no navegador do sistema, e navegação para
  // fora da origem do jogo é recusada. Sem isso, uma página hostil carregada dentro do shell
  // teria a mesma superfície que o jogo.
  window.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: 'deny' };
  });

  return window;
}

// Leitura de arquivo que devolve `null` para "não existe" — é o contrato que `ambiente.ts` e
// `identidadeDev.ts` pedem, e a única coisa que os dois módulos puros não fazem sozinhos.
function lerArquivoOuNull(caminho: string): string | null {
  try {
    return readFileSync(caminho, 'utf8');
  } catch {
    return null;
  }
}

// §9.4 — o ticket de sessão. **Ele ainda é o de desenvolvimento** (D36): o módulo nativo da
// Steam é pendência do M21, e o hospedado de playtest sobe com `composeServer.ts`. O que
// existe aqui é a costura — o renderer pede ao principal, e trocar quem responde não muda
// uma linha do cliente.
//
// A identidade é um UUID gerado uma vez e gravado em `userData` (M28 2/N). Era o comprimento
// do caminho — estável, mas colidente entre testadores e enumerável; ver `identidadeDev.ts`.
function sessionTicket(): string {
  const { id } = identidadeDeDesenvolvimento({
    env: process.env,
    userDataDir: app.getPath('userData'),
    lerArquivo: lerArquivoOuNull,
    escreverArquivo: (caminho, conteudo) => {
      mkdirSync(path.dirname(caminho), { recursive: true });
      writeFileSync(caminho, conteudo, 'utf8');
    },
    gerarUuid: randomUUID,
  });
  return `dev:${id}`;
}

ipcMain.handle('paths-beyond:session-ticket', () => sessionTicket());

// §9.4 (M21 2/N, M28 2/N) — para onde o cliente empacotado fala.
//
// No navegador o Vite encaminha `/api`; empacotado não há proxy, e o cliente abre por
// `file://`. Quem sabe o endereço é o shell. A variável de ambiente continua vencendo (dev
// num terminal, CI); o que a 2/N do M28 acrescentou é o que chega a quem INSTALOU — o
// `ambiente.json` que o instalador entrega, e o override por usuário em `userData`. Ausente
// tudo, o cliente cai no caminho relativo, que é o comportamento do navegador. Ver
// `ambiente.ts`.
ipcMain.on('paths-beyond:api-base-url-sync', (evento) => {
  const { url } = resolverApiBaseUrl({
    env: process.env,
    userDataDir: app.getPath('userData'),
    resourcesDir: process.resourcesPath,
    lerArquivo: lerArquivoOuNull,
  });
  evento.returnValue = url;
});

// §9.4 (M21, 3/N) — as CONQUISTAS chegando à plataforma.
//
// O renderer manda a lista de espelhos CUMPRIDOS (o servidor é quem sabe, e é ele quem a
// calcula em `/me/rewards`); o principal fala com o módulo nativo, que é a única coisa que
// não pode acontecer do outro lado da ponte.
//
// A porta é criada UMA vez e reusada: `steamworks.init` abre sessão com a loja, e chamá-lo a
// cada sincronização seria reabri-la a cada tela de prêmios. `null` é estado normal — jogo
// aberto fora da loja — e não impede nada.
let portaDaPlataforma: PlatformAchievements | null = null;
let portaResolvida = false;

async function obterPorta(): Promise<PlatformAchievements | null> {
  if (!portaResolvida) {
    portaDaPlataforma = await criarPortaDaPlataforma();
    portaResolvida = true;
  }
  return portaDaPlataforma;
}

// A conferência do payload mora em `achievements.ts` e não aqui: o processo principal não é
// testável em `pnpm test`, e a validação de entrada é justamente a parte que precisa ser.
ipcMain.handle('paths-beyond:sync-achievements', async (_evento, nomes: unknown) =>
  sincronizarPedidoDoRenderer(nomes, await obterPorta()),
);

// §2/§9.4 (M21, 4/N) — o AUTO-UPDATE.
//
// O jogo é sempre-online: toda batalha faz round-trip e o servidor recusa `rulesVersion` que
// não é a dele. Um desktop que não se atualiza sozinho vira, em uma semana de release, um
// cliente que não consegue mais jogar — e sem nada na tela explicando por quê.
//
// O `electron-updater` é embrulhado na porta de `updates.ts` pelo mesmo motivo da 3/N: o que
// decide comportamento (quando verificar, o que mostrar, o que fazer quando dá errado) tem de
// rodar em `pnpm test`, e o updater de verdade precisa de binário empacotado e de host.
function atualizadorDoElectron(): AtualizadorDePlataforma {
  // Baixa sozinho e instala ao SAIR. Instalar no meio de uma partida fecharia o jogo com a
  // batalha em curso — e neste projeto a batalha está no servidor, então o jogador perderia
  // o que estava ganhando. O "reiniciar agora" existe e é do jogador.
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  return {
    // O `ao` da porta é uma sobrecarga por evento; o `on` do updater tem uma assinatura
    // diferente para cada um deles. O `as` mora aqui, num adaptador de cinco linhas, e não
    // vaza para quem usa a porta.
    ao: (evento: string, ouvinte: (...args: never[]) => void) => {
      (autoUpdater.on as (e: string, o: (...args: unknown[]) => void) => unknown)(
        evento,
        ouvinte as (...args: unknown[]) => void,
      );
    },
    verificarEBaixar: () => autoUpdater.checkForUpdates(),
    reiniciarEInstalar: () => autoUpdater.quitAndInstall(),
  } as AtualizadorDePlataforma;
}

// Reverificação periódica: um jogador que deixa o jogo aberto por dias precisa receber a
// atualização sem fechar. Seis horas é raro o bastante para não pesar e frequente o bastante
// para um dia de release.
const INTERVALO_DE_VERIFICACAO_MS = 6 * 60 * 60 * 1000;

let controleDeAtualizacao: ControleDeAtualizacao | null = null;
let estadoDaAtualizacao: EstadoDaAtualizacao = { fase: 'ocioso' };

// O registro da atualização, uma linha JSON por mudança, no mesmo espírito do log
// estruturado do servidor (M19). **Em ARQUIVO e não só no console**: um app empacotado de
// janela no Windows não tem console para onde escrever, e "por que este jogador não
// atualizou?" é justamente a pergunta que se faz depois, com o jogo já fechado. Vai para
// `userData`, junto do save — é o diretório que se pede ao jogador quando ele abre um
// chamado, e foi como a prova de ponta a ponta desta fatia foi feita.
function registrar(linha: Record<string, unknown>): void {
  const texto = JSON.stringify({ em: new Date().toISOString(), ...linha });
  console.log(texto);
  try {
    appendFileSync(path.join(app.getPath('userData'), 'atualizacao.log'), `${texto}
`);
  } catch {
    // Disco cheio, permissão negada, perfil móvel: escrever log é a última coisa que pode
    // impedir alguém de jogar.
  }
}

function ligarAtualizacaoAutomatica(): void {
  registrar({ evento: 'inicio', versao: app.getVersion(), empacotado: app.isPackaged });

  controleDeAtualizacao = ligarAtualizacao(atualizadorDoElectron(), contextoDoAmbiente(app.isPackaged), (estado) => {
    estadoDaAtualizacao = estado;
    registrar({ evento: 'atualizacao', ...estado });
    // Empurrado para TODA janela: o renderer pode ter carregado depois do evento, e é por
    // isso que existe também a leitura sob demanda logo abaixo.
    for (const janela of BrowserWindow.getAllWindows()) {
      janela.webContents.send('paths-beyond:update-status', estado);
    }
  });

  void controleDeAtualizacao.verificar();
  setInterval(() => void controleDeAtualizacao?.verificar(), INTERVALO_DE_VERIFICACAO_MS);
}

// O renderer pergunta o estado ao montar a tela: sem isto, quem abriu a janela depois do
// `update-downloaded` não veria a atualização pronta até a próxima verificação.
ipcMain.handle('paths-beyond:update-status', () => estadoDaAtualizacao);

ipcMain.handle('paths-beyond:restart-to-update', () => {
  controleDeAtualizacao?.reiniciarEInstalar();
});

// §3.3 (M21, 2/N) — **o binário EMPACOTADO se autoverifica.**
//
// A 1/N mediu o determinismo rodando `electron dist/determinism.js` a partir do workspace, e
// isso já era mais do que o CI tinha. Mas o critério fala do runtime empacotado, e um script
// solto no repositório não é o que o jogador instala. Com a flag, quem roda a medição é o
// executável que saiu do instalador — mesmo asar, mesmo Chromium, mesmas flags.
const MODO_DETERMINISMO = process.argv.includes('--determinismo');

void app.whenReady().then(async () => {
  if (MODO_DETERMINISMO) {
    app.exit(await medirDeterminismo().catch(() => 1));
    return;
  }

  createWindow();
  ligarAtualizacaoAutomatica();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  // No macOS o costume é o app continuar vivo sem janela; nas outras plataformas, não.
  if (process.platform !== 'darwin') app.quit();
});
