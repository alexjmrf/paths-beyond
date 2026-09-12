import { describe, expect, it } from 'vitest';
import {
  ARQUIVO_DE_IDENTIDADE,
  identidadeDeDesenvolvimento,
  type ContextoDaIdentidade,
} from '../src/identidadeDev.js';

// §9.4 (M28, 2/N; pendência do M21) — a identidade de DESENVOLVIMENTO do shell.
//
// Até aqui ela era `shell-${userData.length}`: o COMPRIMENTO do caminho da pasta de dados.
// Estável entre execuções — que era o objetivo — e nada mais: dois testadores com nome de
// usuário do mesmo tamanho caíam na mesma conta, e `dev:shell-52` era enumerável em
// segundos. D36 aceitou "quem souber a URL se autentica"; não aceitou "os testadores se
// misturam". Um UUID gravado em `userData` é estável E único E não enumerável.
//
// O ticket continua sendo `dev:<id>`; `devIdentity.ts` do servidor não muda uma linha.

function contexto(sobrescrever: Partial<ContextoDaIdentidade> = {}): ContextoDaIdentidade & {
  readonly escritas: { caminho: string; conteudo: string }[];
} {
  const escritas: { caminho: string; conteudo: string }[] = [];
  return {
    env: {},
    userDataDir: '/userData',
    lerArquivo: () => null,
    escreverArquivo: (caminho, conteudo) => {
      escritas.push({ caminho, conteudo });
    },
    gerarUuid: () => 'uuid-gerado',
    escritas,
    ...sobrescrever,
  };
}

const CAMINHO = `/userData/${ARQUIVO_DE_IDENTIDADE}`;

describe('identidadeDeDesenvolvimento()', () => {
  it('primeira execução: gera um UUID e o GRAVA em userData', () => {
    const ctx = contexto();

    const r = identidadeDeDesenvolvimento(ctx);

    expect(r.id).toBe('uuid-gerado');
    expect(r.origem).toBe('gerada');
    expect(ctx.escritas).toHaveLength(1);
    expect(ctx.escritas[0]!.caminho).toBe(CAMINHO);
    expect(JSON.parse(ctx.escritas[0]!.conteudo)).toEqual({ id: 'uuid-gerado' });
  });

  it('execuções seguintes LEEM o mesmo id — uma identidade nova a cada abertura seria uma conta nova a cada abertura', () => {
    const ctx = contexto({
      lerArquivo: (caminho) => (caminho === CAMINHO ? '{"id":"uuid-antigo"}' : null),
      gerarUuid: () => {
        throw new Error('não deveria gerar: o arquivo existe');
      },
    });

    const r = identidadeDeDesenvolvimento(ctx);

    expect(r.id).toBe('uuid-antigo');
    expect(r.origem).toBe('arquivo');
    expect(ctx.escritas).toHaveLength(0);
  });

  it('`PATHS_BEYOND_DEV_IDENTITY` continua vencendo — é o override que o M21 já tinha', () => {
    const ctx = contexto({
      env: { PATHS_BEYOND_DEV_IDENTITY: 'alexandre' },
      lerArquivo: (caminho) => (caminho === CAMINHO ? '{"id":"uuid-antigo"}' : null),
    });

    const r = identidadeDeDesenvolvimento(ctx);

    expect(r.id).toBe('alexandre');
    expect(r.origem).toBe('env');
    expect(ctx.escritas).toHaveLength(0);
  });

  it('arquivo corrompido gera de novo e SOBRESCREVE — não deixa o jogo sem identidade', () => {
    for (const ruim of ['{isto não é json', '{"id":""}', '{"id":42}', '{}', '']) {
      const ctx = contexto({ lerArquivo: () => ruim });

      const r = identidadeDeDesenvolvimento(ctx);

      expect(r.id, ruim).toBe('uuid-gerado');
      expect(r.origem, ruim).toBe('gerada');
      expect(ctx.escritas, ruim).toHaveLength(1);
    }
  });

  it('dois userData diferentes dão identidades diferentes — dois usuários no mesmo PC não se misturam', () => {
    let n = 0;
    const gerarUuid = () => `uuid-${++n}`;

    const a = identidadeDeDesenvolvimento(contexto({ userDataDir: '/users/a', gerarUuid }));
    const b = identidadeDeDesenvolvimento(contexto({ userDataDir: '/users/b', gerarUuid }));

    expect(a.id).not.toBe(b.id);
  });

  it('o id NÃO deriva do caminho — é o defeito que este arquivo existe para não repetir', () => {
    // Dois caminhos do mesmo comprimento. Com o desenho antigo, mesma identidade.
    let n = 0;
    const gerarUuid = () => `uuid-${++n}`;

    const a = identidadeDeDesenvolvimento(contexto({ userDataDir: '/Users/Alexandre/x', gerarUuid }));
    const b = identidadeDeDesenvolvimento(contexto({ userDataDir: '/Users/Guilherme/x', gerarUuid }));

    expect('/Users/Alexandre/x'.length).toBe('/Users/Guilherme/x'.length);
    expect(a.id).not.toBe(b.id);
  });
});
