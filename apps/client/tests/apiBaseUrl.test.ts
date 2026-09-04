import { afterEach, describe, expect, it, vi } from 'vitest';
import { resolveApiBaseUrl } from '../src/data/platformBridge.js';

// §9.4 (M21, 2/N) — para onde o cliente EMPACOTADO manda requisição.
//
// No navegador o cliente sempre falou por caminho relativo (`/api/...`) e o Vite encaminhava
// para o servidor (M13 2/N). Empacotado não há proxy nenhum: o app abre por `file://`, e um
// caminho relativo aponta para o disco do jogador.
//
// **Decisão desta fatia: a URL vem do SHELL, pelo `preload`.** O mesmo binário assinado
// aponta para produção ou para staging sem rebuild, e o cliente continua sem saber onde
// roda. A alternativa — assar a URL em tempo de build — obrigaria um build por ambiente, e
// um build por ambiente é um binário por ambiente para assinar e publicar.
//
// O que este arquivo trava é a queda: uma configuração ruim do shell não pode virar uma URL
// malformada que falha com "fetch failed" e nenhuma pista. Ela cai no relativo, que é o
// comportamento do navegador.

afterEach(() => vi.unstubAllGlobals());

describe('a URL base da API', () => {
  it('sem shell, é o caminho relativo de sempre', () => {
    vi.stubGlobal('window', {});

    expect(resolveApiBaseUrl()).toBe('/api');
  });

  it('com o shell informando, é a URL dele', () => {
    vi.stubGlobal('window', { pathsBeyond: { apiBaseUrl: 'https://api.pathsbeyond.example' } });

    expect(resolveApiBaseUrl()).toBe('https://api.pathsbeyond.example');
  });

  // `${BASE}${path}` monta a URL, e `path` já começa com `/`. Uma barra sobrando produz
  // `//me/heroes`, que alguns servidores tratam como outra rota e outros como 404 — o tipo
  // de bug que só aparece no build empacotado.
  it('a barra final é removida, para não virar barra dupla', () => {
    vi.stubGlobal('window', { pathsBeyond: { apiBaseUrl: 'https://api.exemplo.com/' } });

    expect(resolveApiBaseUrl()).toBe('https://api.exemplo.com');
  });

  it.each([
    ['string vazia', ''],
    ['só espaços', '   '],
    ['não é string', 42],
    ['não é URL', 'isto não é uma url'],
    ['esquema que não é http', 'file:///c:/algum/lugar'],
  ])('configuração inválida (%s) cai no relativo em vez de virar URL quebrada', (_rotulo, valor) => {
    vi.stubGlobal('window', { pathsBeyond: { apiBaseUrl: valor } });

    expect(resolveApiBaseUrl()).toBe('/api');
  });

  it('aceita http para desenvolvimento local, e não só https', () => {
    // O shell apontando para o `devServer` da máquina é o laço de trabalho da 1/N em diante.
    vi.stubGlobal('window', { pathsBeyond: { apiBaseUrl: 'http://127.0.0.1:3000' } });

    expect(resolveApiBaseUrl()).toBe('http://127.0.0.1:3000');
  });
});
