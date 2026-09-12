import { describe, expect, it } from 'vitest';
import { ARQUIVO_DE_AMBIENTE, resolverApiBaseUrl, type ContextoDoShell } from '../src/ambiente.js';

// §9.4 (M28, 2/N) — para onde o cliente EMPACOTADO fala, lido em cascata.
//
// O M21 2/N pôs a URL numa variável de ambiente para que o mesmo binário apontasse para
// produção ou staging sem rebuild. A intenção está certa e o veículo não chega ao jogador:
// quem instala não tem terminal para exportar nada, e sem a variável o cliente cai em `/api`
// relativo — que empacotado é `file:///api`. A cascata mantém a variável (dev num terminal,
// CI) e acrescenta o que o instalador entrega e o que o usuário pode sobrepor.
//
// Tudo aqui é função pura com contexto injetado: nenhum teste toca o disco nem o Electron.

function contexto(sobrescrever: Partial<ContextoDoShell> = {}): ContextoDoShell {
  return {
    env: {},
    userDataDir: '/userData',
    resourcesDir: '/resources',
    lerArquivo: () => null,
    ...sobrescrever,
  };
}

function arquivoEm(caminhos: Readonly<Record<string, string>>): ContextoDoShell['lerArquivo'] {
  return (caminho) => caminhos[caminho] ?? null;
}

describe('resolverApiBaseUrl()', () => {
  it('sem nada configurado, devolve null — o cliente cai no relativo, como hoje', () => {
    const r = resolverApiBaseUrl(contexto());

    expect(r.url).toBeNull();
    expect(r.origem).toBe('nenhuma');
  });

  it('o instalador entrega a URL em `<resources>/ambiente.json`', () => {
    const r = resolverApiBaseUrl(
      contexto({
        lerArquivo: arquivoEm({ [`/resources/${ARQUIVO_DE_AMBIENTE}`]: '{"apiBaseUrl":"https://staging.example.com"}' }),
      }),
    );

    expect(r.url).toBe('https://staging.example.com');
    expect(r.origem).toBe('recursos');
  });

  it('`<userData>/ambiente.json` VENCE o do instalador — é o override por usuário', () => {
    // O autor testando o mesmo build contra dois servidores. Ele não reempacota; põe um
    // arquivo na pasta de dados.
    const r = resolverApiBaseUrl(
      contexto({
        lerArquivo: arquivoEm({
          [`/resources/${ARQUIVO_DE_AMBIENTE}`]: '{"apiBaseUrl":"https://producao.example.com"}',
          [`/userData/${ARQUIVO_DE_AMBIENTE}`]: '{"apiBaseUrl":"https://local.example.com"}',
        }),
      }),
    );

    expect(r.url).toBe('https://local.example.com');
    expect(r.origem).toBe('userData');
  });

  it('a variável de ambiente vence TUDO — o laço de dev e o CI continuam como no M21 2/N', () => {
    const r = resolverApiBaseUrl(
      contexto({
        env: { PATHS_BEYOND_API_URL: 'http://127.0.0.1:3000' },
        lerArquivo: arquivoEm({
          [`/resources/${ARQUIVO_DE_AMBIENTE}`]: '{"apiBaseUrl":"https://producao.example.com"}',
          [`/userData/${ARQUIVO_DE_AMBIENTE}`]: '{"apiBaseUrl":"https://local.example.com"}',
        }),
      }),
    );

    expect(r.url).toBe('http://127.0.0.1:3000');
    expect(r.origem).toBe('env');
  });

  it('arquivo malformado é IGNORADO e a cascata segue — nunca vira uma URL quebrada', () => {
    // A preocupação registrada em `apiBaseUrl.test.ts` do cliente: uma configuração ruim não
    // pode virar "fetch failed" sem pista. Aqui o JSON inválido no userData cai para o do
    // instalador, que está são.
    const r = resolverApiBaseUrl(
      contexto({
        lerArquivo: arquivoEm({
          [`/resources/${ARQUIVO_DE_AMBIENTE}`]: '{"apiBaseUrl":"https://producao.example.com"}',
          [`/userData/${ARQUIVO_DE_AMBIENTE}`]: '{isto não é json',
        }),
      }),
    );

    expect(r.url).toBe('https://producao.example.com');
    expect(r.origem).toBe('recursos');
  });

  it('URL que não é http(s) é tratada como ausente', () => {
    // `apiBaseUrl: "producao.example.com"` (sem esquema) daria `fetch('producao.example.com/api/...')`
    // — relativo ao `file://` do renderer, falhando com a mesma mensagem opaca.
    for (const ruim of ['"producao.example.com"', '""', '42', 'null', '"ftp://x"']) {
      const r = resolverApiBaseUrl(
        contexto({ lerArquivo: arquivoEm({ [`/resources/${ARQUIVO_DE_AMBIENTE}`]: `{"apiBaseUrl":${ruim}}` }) }),
      );

      expect(r.url, ruim).toBeNull();
    }
  });

  it('a barra final é removida — o cliente concatena `/api/...` por cima', () => {
    const r = resolverApiBaseUrl(
      contexto({ lerArquivo: arquivoEm({ [`/resources/${ARQUIVO_DE_AMBIENTE}`]: '{"apiBaseUrl":"https://x.example.com/"}' }) }),
    );

    expect(r.url).toBe('https://x.example.com');
  });

  it('variável de ambiente vazia conta como ausente', () => {
    const r = resolverApiBaseUrl(
      contexto({
        env: { PATHS_BEYOND_API_URL: '' },
        lerArquivo: arquivoEm({ [`/resources/${ARQUIVO_DE_AMBIENTE}`]: '{"apiBaseUrl":"https://x.example.com"}' }),
      }),
    );

    expect(r.origem).toBe('recursos');
  });
});
