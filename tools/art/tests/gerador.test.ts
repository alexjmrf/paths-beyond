import { existsSync, mkdtempSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import unitArtSchema from '@paths-beyond/data/schemas/unit-art.schema.js';
import { USER_AGENT_DE_NAVEGADOR, criarClientePixelLab } from '../src/pixellab.js';
import { gerarSprite } from '../src/gerar.js';
import type { EspecificacaoDeArte } from '../src/prompt.js';

// M26 — o gerador, exercitado com uma implementação de MENTIRA.
//
// O critério de aceite pede "a geração é um script repetível com a chave fora do repositório,
// e roda com uma implementação de mentira em teste — mesmo padrão do validador de identidade e
// do atualizador". `apps/server/src/identity/steam.ts` é o precedente: a chamada de verdade
// não é exercitada pela suíte (exigiria chave e crédito), e o que se testa é o CONTRATO — o
// que se manda, o que se lê e o que se faz quando o outro lado nega.
//
// Aqui isso vale duplo, porque cada execução de verdade gasta uma geração da assinatura. Uma
// suíte que falasse com a PixelLab seria uma suíte que ninguém roda.

const ESPEC: EspecificacaoDeArte = {
  unitId: 'ally-guerreiro',
  nome: 'Rurik',
  side: 'player',
  weaponType: 'axe',
  unitType: 'infantry',
  moveType: 'foot',
};

const PNG_FALSO = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);

interface Chamada {
  readonly url: string;
  readonly method: string;
  readonly headers: Record<string, string>;
  readonly body: Record<string, unknown> | undefined;
}

function resposta(corpo: unknown): Response {
  return new Response(JSON.stringify(corpo), { status: 200, headers: { 'content-type': 'application/json' } });
}

/**
 * A PixelLab de mentira. Ela responde como a API v2 de verdade responde — inclusive na parte
 * que importa: o personagem NAO fica pronto na primeira consulta. Um duplo que devolvesse
 * `completed` de cara deixaria o laço de espera sem teste nenhum, e o laço de espera é a
 * única parte do cliente que pode travar para sempre.
 */
function pixelLabFalsa(opcoes: { prontoDepoisDe?: number; falha?: boolean; semRotacaoDeDuelo?: boolean } = {}) {
  const prontoDepoisDe = opcoes.prontoDepoisDe ?? 2;
  const chamadas: Chamada[] = [];
  let consultas = 0;

  const fetchImpl = (async (url: string | URL, init?: RequestInit) => {
    const alvo = String(url);
    const headers = Object.fromEntries(
      Object.entries((init?.headers ?? {}) as Record<string, string>).map(([k, v]) => [k.toLowerCase(), v]),
    );
    chamadas.push({
      url: alvo,
      method: init?.method ?? 'GET',
      headers,
      body: init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : undefined,
    });

    if (alvo.endsWith('/create-character-v3')) {
      return resposta({ character_id: 'char-abc', background_job_id: 'job-1', status: 'processing' });
    }
    if (alvo.includes('/characters/char-abc')) {
      consultas += 1;
      if (opcoes.falha) return resposta({ id: 'char-abc', status: 'failed', rotation_urls: null });
      if (consultas < prontoDepoisDe) return resposta({ id: 'char-abc', status: 'pending', rotation_urls: null });
      return resposta({
        id: 'char-abc',
        status: 'completed',
        size: { width: 64, height: 64 },
        // As OITO rotações, como a API de verdade devolve. O duplo passou a trazê-las quando o
        // gerador passou a levar as duas de duelo (M26 2/N) — um duplo que ficasse na forma
        // antiga esconderia justamente a mudança de contrato.
        rotation_urls: opcoes.semRotacaoDeDuelo
          ? { south: 'https://storage.pixellab.ai/char-abc/south.png' }
          : {
              south: 'https://storage.pixellab.ai/char-abc/south.png',
              north: 'https://storage.pixellab.ai/char-abc/north.png',
              east: 'https://storage.pixellab.ai/char-abc/east.png',
              west: 'https://storage.pixellab.ai/char-abc/west.png',
              'south-east': 'https://storage.pixellab.ai/char-abc/south-east.png',
              'south-west': 'https://storage.pixellab.ai/char-abc/south-west.png',
              'north-east': 'https://storage.pixellab.ai/char-abc/north-east.png',
              'north-west': 'https://storage.pixellab.ai/char-abc/north-west.png',
            },
      });
    }
    if (alvo.startsWith('https://storage.pixellab.ai/')) {
      return new Response(PNG_FALSO, { status: 200, headers: { 'content-type': 'image/png' } });
    }
    return new Response('nao encontrado', { status: 404 });
  }) as unknown as typeof fetch;

  return {
    fetchImpl,
    chamadas,
    get chamadasDeConsulta() {
      return consultas;
    },
  };
}

function cliente(falsa: ReturnType<typeof pixelLabFalsa>) {
  return criarClientePixelLab({
    apiKey: 'chave-de-mentira',
    fetchImpl: falsa.fetchImpl,
    // Sem relógio real: um teste que espera de verdade é um teste que ninguém roda duas vezes.
    sleep: async () => {},
  });
}

function diretorios() {
  const raiz = mkdtempSync(join(tmpdir(), 'pb-art-'));
  return { raiz, dirArte: join(raiz, 'art'), dirManifesto: join(raiz, 'unit-art') };
}

async function gerar(falsa: ReturnType<typeof pixelLabFalsa>, dirs: ReturnType<typeof diretorios>) {
  return gerarSprite({
    cliente: cliente(falsa),
    espec: ESPEC,
    seed: 424242,
    frameSize: 64,
    dirArte: dirs.dirArte,
    dirManifesto: dirs.dirManifesto,
    agora: () => new Date('2026-09-05T10:00:00Z'),
  });
}

describe('o cliente da PixelLab', () => {
  it('autentica a chamada de API com a chave, e manda o que a API v2 espera', async () => {
    const falsa = pixelLabFalsa();
    await gerar(falsa, diretorios());

    const criacao = falsa.chamadas.find((c) => c.url.endsWith('/create-character-v3'))!;
    expect(criacao.method).toBe('POST');
    expect(criacao.headers.authorization).toBe('Bearer chave-de-mentira');
    expect(criacao.body).toMatchObject({
      seed: 424242,
      image_size: { width: 64, height: 64 },
      no_background: true,
    });
    expect(String(criacao.body!.description)).toMatch(/axe/i);
  });

  it('a seed vai no pedido — é o que torna a imagem regerável, e o manifesto verdadeiro', async () => {
    const falsa = pixelLabFalsa();
    const resultado = await gerar(falsa, diretorios());
    const criacao = falsa.chamadas.find((c) => c.url.endsWith('/create-character-v3'))!;
    expect(criacao.body!.seed).toBe(424242);
    expect(resultado.declaracao.kind === 'sprite' && resultado.declaracao.procedencia.seed).toBe(424242);
  });

  it('ESPERA o personagem ficar pronto em vez de ler `rotation_urls` nulo', async () => {
    // A API devolve `character_id` na hora e as rotações depois. Ler cedo é ler `null`, e o
    // erro apareceria como um sprite faltando, não como uma falha.
    const falsa = pixelLabFalsa({ prontoDepoisDe: 3 });
    await gerar(falsa, diretorios());
    expect(falsa.chamadasDeConsulta).toBe(3);
  });

  it('baixa o quadro SEM `Authorization` e COM `User-Agent` de navegador', async () => {
    // D25, "detalhe de encanamento": as URLs de quadro do armazenamento RECUSAM
    // `Authorization` e exigem `User-Agent` de navegador. Custou uma rodada de 403 para
    // descobrir, e sem este teste custaria de novo na próxima vez que alguém "limpasse" os
    // cabeçalhos.
    const falsa = pixelLabFalsa();
    await gerar(falsa, diretorios());

    const download = falsa.chamadas.find((c) => c.url.startsWith('https://storage.pixellab.ai/'))!;
    expect(download.headers.authorization).toBeUndefined();
    expect(download.headers['user-agent']).toBe(USER_AGENT_DE_NAVEGADOR);
  });

  it('desiste depois de um limite em vez de esperar para sempre', async () => {
    const falsa = pixelLabFalsa({ prontoDepoisDe: 10_000 });
    const c = criarClientePixelLab({
      apiKey: 'k',
      fetchImpl: falsa.fetchImpl,
      sleep: async () => {},
      maxConsultas: 5,
    });
    await expect(c.esperarPersonagem('char-abc')).rejects.toThrow(/desist|tempo/i);
    expect(falsa.chamadasDeConsulta).toBe(5);
  });

  it('recusa ser construído sem chave — nunca chama a API anônimo', () => {
    expect(() => criarClientePixelLab({ apiKey: '' })).toThrow(/PIXELLAB_API_KEY/);
    expect(() => criarClientePixelLab({ apiKey: '   ' })).toThrow(/PIXELLAB_API_KEY/);
  });
});

describe('o que o gerador deixa em disco', () => {
  it('escreve o PNG com os bytes que baixou', async () => {
    const dirs = diretorios();
    const resultado = await gerar(pixelLabFalsa(), dirs);
    expect(existsSync(resultado.caminhoPng)).toBe(true);
    expect(new Uint8Array(readFileSync(resultado.caminhoPng))).toEqual(PNG_FALSO);
    expect(resultado.caminhoPng.endsWith(`${ESPEC.unitId}.png`)).toBe(true);
  });

  it('escreve TAMBÉM as duas peças de duelo, na mesma passada', async () => {
    // Elas não custam geração nenhuma — a API produz as 8 rotações de uma vez. O que elas
    // custam é uma segunda visita ao personagem se forem baixadas depois, e é exatamente o
    // tipo de coisa que ninguém refaz para 50 unidades.
    const dirs = diretorios();
    await gerar(pixelLabFalsa(), dirs);
    for (const pose of ['sudeste', 'sudoeste']) {
      expect(existsSync(join(dirs.dirArte, `${ESPEC.unitId}-${pose}.png`)), pose).toBe(true);
    }
  });

  it('personagem sem a rotação de duelo FALHA — e não deixa meia unidade em disco', async () => {
    // O estado "tem peça de tabuleiro, não tem de duelo" não pode existir: o schema exige as
    // três, e a tela teria de tratar para sempre um caso que nenhum caminho produz.
    const dirs = diretorios();
    await expect(gerar(pixelLabFalsa({ semRotacaoDeDuelo: true }), dirs)).rejects.toThrow(/south-east|south-west/);
    for (const dir of [dirs.dirArte, dirs.dirManifesto]) {
      expect(existsSync(dir) ? readdirSync(dir) : []).toEqual([]);
    }
  });

  it('escreve uma declaração que o schema de `packages/data` ACEITA', async () => {
    // O gerador e o schema podem divergir sem que nada quebre — até o `pnpm validate:data` de
    // outra pessoa reprovar. Validar aqui é o que mantém os dois amarrados.
    const dirs = diretorios();
    const resultado = await gerar(pixelLabFalsa(), dirs);
    const escrito = JSON.parse(readFileSync(resultado.caminhoManifesto, 'utf8'));
    expect(() => unitArtSchema.parse(escrito)).not.toThrow();
    expect(escrito).toMatchObject({
      unitId: 'ally-guerreiro',
      kind: 'sprite',
      arquivo: 'apps/client/src/art/units/ally-guerreiro.png',
      duelo: {
        sudeste: 'apps/client/src/art/units/ally-guerreiro-sudeste.png',
        sudoeste: 'apps/client/src/art/units/ally-guerreiro-sudoeste.png',
      },
      frameSize: 64,
    });
  });

  it('a procedência registra prompt, seed, licença, modelo, endpoint e o id do personagem', async () => {
    const resultado = await gerar(pixelLabFalsa(), diretorios());
    expect(resultado.declaracao.kind).toBe('sprite');
    const p = (resultado.declaracao as { procedencia: Record<string, unknown> }).procedencia;
    expect(p).toMatchObject({
      ferramenta: 'pixellab',
      endpoint: '/create-character-v3',
      seed: 424242,
      characterId: 'char-abc',
      geradoEm: '2026-09-05',
    });
    expect(String(p.prompt)).toMatch(/axe/i);
    expect(String(p.licenca)).toMatch(/pixellab/i);
  });

  it('o prompt gravado é o prompt ENVIADO, e não uma reconstrução', async () => {
    // Manifesto que descreve outra coisa que não o que foi enviado é pior que manifesto
    // nenhum: ele dá uma resposta errada com cara de certa.
    const falsa = pixelLabFalsa();
    const resultado = await gerar(falsa, diretorios());
    const enviado = falsa.chamadas.find((c) => c.url.endsWith('/create-character-v3'))!.body!.description;
    expect((resultado.declaracao as { procedencia: { prompt: string } }).procedencia.prompt).toBe(enviado);
  });

  it('quando a geração FALHA, não fica meio manifesto nem meio PNG', async () => {
    const dirs = diretorios();
    await expect(gerar(pixelLabFalsa({ falha: true }), dirs)).rejects.toThrow(/falh/i);
    for (const dir of [dirs.dirArte, dirs.dirManifesto]) {
      expect(existsSync(dir) ? readdirSync(dir) : []).toEqual([]);
    }
  });
});

// ---------------------------------------------------------------------------
// M26 — a fila da PixelLab
// ---------------------------------------------------------------------------

describe('quando a API diz que a fila está cheia', () => {
  /**
   * A conta tem um limite de jobs EM VOO, e o excedente volta com 429 — às vezes com 500,
   * quando nenhum job do lote conseguiu entrar. Isso não é erro, é fila.
   *
   * Medido de verdade na bateria de comparação do M26 1/N: 16 animações disparadas de uma vez,
   * 8 entraram e 8 voltaram com "Not enough concurrent job slots". Sem reenvio, a geração das
   * cinquenta unidades da 2/N seria um trabalho de babá — e a metade que falha é SILENCIOSA
   * até alguém conferir o diretório.
   */
  function filaCheia(recusas: number, status = 429) {
    let n = 0;
    const fetchImpl = (async (url: string | URL) => {
      const alvo = String(url);
      if (alvo.endsWith('/create-character-v3')) {
        if (n++ < recusas) {
          return new Response(JSON.stringify({ detail: 'Not enough concurrent job slots' }), { status });
        }
        return resposta({ character_id: 'char-abc', status: 'processing' });
      }
      if (alvo.includes('/characters/char-abc')) {
        return resposta({
          id: 'char-abc',
          status: 'completed',
          size: { width: 48, height: 48 },
          rotation_urls: { south: 'https://storage.pixellab.ai/x.png' },
        });
      }
      return new Response(PNG_FALSO, { status: 200 });
    }) as unknown as typeof fetch;
    return { fetchImpl, get tentativas() { return n; } };
  }

  const pedido = { description: 'x', seed: 1, frameSize: 48 };

  it('reenvia o pedido em vez de desistir — 429 é fila, não recusa', async () => {
    const f = filaCheia(3);
    const c = criarClientePixelLab({ apiKey: 'k', fetchImpl: f.fetchImpl, sleep: async () => {} });
    await expect(c.criarPersonagem(pedido)).resolves.toEqual({ characterId: 'char-abc' });
    expect(f.tentativas).toBe(4);
  });

  it('o 500 de "Failed to start any animation jobs" também é fila', async () => {
    // A API devolve 500 quando NENHUM job do lote entrou. Tratar isso como erro de servidor
    // faria o lote inteiro morrer justamente no momento de maior paralelismo.
    const f = filaCheia(2, 500);
    const c = criarClientePixelLab({ apiKey: 'k', fetchImpl: f.fetchImpl, sleep: async () => {} });
    await expect(c.criarPersonagem(pedido)).resolves.toEqual({ characterId: 'char-abc' });
  });

  it('mas 500 de verdade continua sendo erro, e falha na primeira', async () => {
    // Sem esta distinção, um defeito do servidor viraria vinte reenvios silenciosos.
    let n = 0;
    const fetchImpl = (async () => {
      n++;
      return new Response(JSON.stringify({ detail: 'internal error' }), { status: 500 });
    }) as unknown as typeof fetch;
    const c = criarClientePixelLab({ apiKey: 'k', fetchImpl, sleep: async () => {} });
    await expect(c.criarPersonagem(pedido)).rejects.toThrow(/500/);
    expect(n).toBe(1);
  });

  it('401 não é reenviado: chave errada não melhora com paciência', async () => {
    let n = 0;
    const fetchImpl = (async () => {
      n++;
      return new Response('unauthorized', { status: 401 });
    }) as unknown as typeof fetch;
    const c = criarClientePixelLab({ apiKey: 'k', fetchImpl, sleep: async () => {} });
    await expect(c.criarPersonagem(pedido)).rejects.toThrow(/401/);
    expect(n).toBe(1);
  });

  it('desiste depois do teto — fila que não anda é falha, não espera eterna', async () => {
    const f = filaCheia(9999);
    const c = criarClientePixelLab({ apiKey: 'k', fetchImpl: f.fetchImpl, sleep: async () => {}, maxReenvios: 4 });
    await expect(c.criarPersonagem(pedido)).rejects.toThrow(/429/);
    expect(f.tentativas).toBe(5);
  });

  it('a espera CRESCE entre reenvios, e tem teto', async () => {
    // Reenviar na mesma cadência de quem causou a fila é o jeito de mantê-la cheia. E crescer
    // sem teto transformaria uma fila momentânea numa espera de meia hora.
    const esperas: number[] = [];
    const f = filaCheia(5);
    const c = criarClientePixelLab({
      apiKey: 'k',
      fetchImpl: f.fetchImpl,
      intervaloMs: 1000,
      sleep: async (ms) => { esperas.push(ms); },
    });
    await c.criarPersonagem(pedido);
    expect(esperas).toEqual([1000, 2000, 3000, 4000, 5000]);
    expect(Math.max(...esperas)).toBeLessThanOrEqual(60_000);
  });
});
