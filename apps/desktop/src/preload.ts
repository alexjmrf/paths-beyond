import { contextBridge, ipcRenderer } from 'electron';

// §9.4 (M21, 1/N) — a PONTE entre o shell e o cliente.
//
// O cliente (`apps/client`) não conhece Electron e não pode conhecer: ele roda no navegador
// no laço de desenvolvimento inteiro, desde M6. O que o shell faz é injetar
// `window.pathsBeyond` — e `data/platformBridge.ts` escolhe entre essa ponte e a de
// desenvolvimento pela simples presença dela.
//
// **`contextBridge` e não `window.x = ...`**: o renderer roda com `contextIsolation`, então
// ele não alcança o `require` do Node nem o módulo nativo da Steam. O que ele alcança é esta
// superfície, que é uma função só. É a diferença entre expor uma capacidade e expor o
// processo.
//
// O ticket em si é pedido ao processo PRINCIPAL por IPC: o módulo da Steam é nativo e só
// carrega lá. Nesta fatia o principal ainda responde com a ponte de desenvolvimento — a
// integração real com Steamworks é a 3/N, e é por isso que a costura existe antes dela.
// A URL da API é lida do principal de forma SÍNCRONA e uma vez só: `api.ts` a resolve na
// carga do módulo, então ela precisa estar pronta antes do primeiro script da página. É o
// único uso de `sendSync` do shell, e é por isso que ele existe.
const apiBaseUrl = ipcRenderer.sendSync('paths-beyond:api-base-url-sync') as string | null;

// §9.4 (M21, 3/N) — as conquistas atravessam a ponte como uma lista de STRINGS, e nada mais.
// O renderer não decide o que está cumprido (quem sabe é o servidor) e não alcança o módulo
// nativo (quem fala com ele é o processo principal): o que ele faz é encaminhar.
// §2/§9.4 (M21, 4/N) — o estado da ATUALIZAÇÃO atravessando para a tela.
//
// O renderer precisa dos dois sentidos: perguntar o estado ao montar (ele pode ter carregado
// depois do evento) e ser avisado quando ele muda. O ouvinte recebe só o objeto de estado —
// nunca o `event` do IPC, que carrega `sender` e daria ao renderer uma alça para o processo
// principal.
contextBridge.exposeInMainWorld('pathsBeyond', {
  requestSessionTicket: (): Promise<string | null> => ipcRenderer.invoke('paths-beyond:session-ticket'),
  updateStatus: (): Promise<unknown> => ipcRenderer.invoke('paths-beyond:update-status'),
  onUpdateStatus: (ouvinte: (estado: unknown) => void): (() => void) => {
    const encaminhar = (_evento: unknown, estado: unknown): void => ouvinte(estado);
    ipcRenderer.on('paths-beyond:update-status', encaminhar);
    return () => ipcRenderer.removeListener('paths-beyond:update-status', encaminhar);
  },
  restartToUpdate: (): Promise<unknown> => ipcRenderer.invoke('paths-beyond:restart-to-update'),
  syncAchievements: (nomes: readonly string[]): Promise<unknown> =>
    ipcRenderer.invoke('paths-beyond:sync-achievements', [...nomes]),
  ...(apiBaseUrl ? { apiBaseUrl } : {}),
});
