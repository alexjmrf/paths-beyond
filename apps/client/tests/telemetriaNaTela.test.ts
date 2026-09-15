import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CATALOGOS } from '../src/i18n/catalogos.js';
import { IDIOMAS } from '../src/i18n/idioma.js';
import { CAMPOS_DA_TELEMETRIA, rotuloDoCampo } from '../src/logic/telemetria.js';
import { useBattleStore } from '../src/store/battleStore.js';

// M34 2/N (D45) — a RECUSA na tela: o menu de opções declara o que o servidor mede e deixa
// recusar num interruptor.
//
// A declaração é do servidor (`collected`, a lista que `migrations.test.ts` trava contra as
// tabelas): a tela NÃO tem a lista escrita — ela traduz o que chega. O que se afirma aqui é
// o encaixe na store (ler com o hub, recusar por PUT, o que o servidor recusa vira erro) e
// que cada campo que o servidor pode declarar hoje tem nome nas duas línguas — um campo novo
// sem tradução apareceria cru, e `rotuloDoCampo` diz isso em vez de esconder.

const TOKEN = 'token-telemetria';
const COLETADOS = ['missionId', 'issuedAt', 'finishedAt', 'outcome', 'rounds', 'lastSeenAt'];

interface Chamada {
  readonly url: string;
  readonly method: string;
  readonly body: unknown;
}
let chamadas: Chamada[] = [];
let optOutNoServidor = false;
let recusar: { status: number; error: string } | null = null;

function instalarFetch(): void {
  chamadas = [];
  optOutNoServidor = false;
  recusar = null;
  vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET';
    const body = init?.body ? JSON.parse(init.body as string) : null;
    chamadas.push({ url, method, body });
    if (url === '/api/me/telemetry' && method === 'GET') {
      return new Response(JSON.stringify({ optOut: optOutNoServidor, collected: COLETADOS }), { status: 200 });
    }
    if (url === '/api/me/telemetry' && method === 'PUT') {
      if (recusar) return new Response(JSON.stringify({ error: recusar.error }), { status: recusar.status });
      optOutNoServidor = (body as { optOut: boolean }).optOut;
      return new Response(JSON.stringify({ optOut: optOutNoServidor, collected: COLETADOS }), { status: 200 });
    }
    if (url === '/api/me/party-presets') return new Response(JSON.stringify({ slots: 8, presets: [] }), { status: 200 });
    return new Response(JSON.stringify({ error: 'rota não semeada' }), { status: 404 });
  });
}

beforeEach(() => {
  instalarFetch();
  useBattleStore.setState((s) => ({
    pvp: { ...s.pvp, token: TOKEN },
    telemetria: { optOut: null, collected: [], busy: false, error: null },
  }));
});

afterEach(() => vi.unstubAllGlobals());

describe('a telemetria na store (M34 2/N)', () => {
  it('lerTelemetria lê a escolha e a declaração do servidor', async () => {
    optOutNoServidor = true;
    await useBattleStore.getState().lerTelemetria();
    const { telemetria } = useBattleStore.getState();
    expect(telemetria.optOut).toBe(true);
    expect(telemetria.collected).toEqual(COLETADOS);
  });

  it('recusar manda PUT { optOut: true } e a tela passa a mostrar a recusa', async () => {
    await useBattleStore.getState().definirTelemetria(true);
    const put = chamadas.find((c) => c.method === 'PUT');
    expect(put?.url).toBe('/api/me/telemetry');
    expect(put?.body).toEqual({ optOut: true });
    expect(useBattleStore.getState().telemetria.optOut).toBe(true);
  });

  it('voltar atrás manda PUT { optOut: false }', async () => {
    optOutNoServidor = true;
    await useBattleStore.getState().lerTelemetria();
    await useBattleStore.getState().definirTelemetria(false);
    expect(useBattleStore.getState().telemetria.optOut).toBe(false);
  });

  it('o que o servidor recusa vira erro na tela, e a escolha não muda', async () => {
    recusar = { status: 500, error: 'banco indisponível' };
    await useBattleStore.getState().lerTelemetria();
    await useBattleStore.getState().definirTelemetria(true);
    expect(useBattleStore.getState().telemetria.error).toContain('banco');
    expect(useBattleStore.getState().telemetria.optOut).toBe(false);
  });

  it('sem sessão, nada é pedido', async () => {
    useBattleStore.setState((s) => ({ pvp: { ...s.pvp, token: null } }));
    await useBattleStore.getState().lerTelemetria();
    await useBattleStore.getState().definirTelemetria(true);
    expect(chamadas).toEqual([]);
  });

  it('o hub carrega a telemetria junto com o resto', async () => {
    optOutNoServidor = true;
    await useBattleStore.getState().carregarHub();
    expect(useBattleStore.getState().telemetria.optOut).toBe(true);
  });
});

describe('a declaração, nas duas línguas', () => {
  it('cada campo que o servidor declara hoje tem nome em toda língua — nenhum aparece cru', () => {
    expect([...CAMPOS_DA_TELEMETRIA]).toEqual(COLETADOS);
    for (const idioma of IDIOMAS) {
      const catalogo = CATALOGOS[idioma];
      for (const campo of COLETADOS) {
        const chave = `app.pref.telemetriaCampo.${campo}`;
        expect(catalogo[chave as keyof typeof catalogo], `${idioma}: ${chave}`).toBeTruthy();
      }
    }
  });

  it('um campo que o servidor passe a declarar sem tradução aparece pelo nome cru — visível, não escondido', () => {
    // O tradutor devolve a própria chave quando ela não existe em língua nenhuma (`idioma.ts`).
    const t = (chave: string) => (chave.endsWith('.missionId') ? 'Missão' : chave);
    expect(rotuloDoCampo(t, 'missionId')).toBe('Missão');
    expect(rotuloDoCampo(t, 'campoNovo')).toBe('campoNovo');
  });
});
