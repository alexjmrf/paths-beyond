import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useBattleStore } from '../src/store/battleStore.js';

// M35 3/N (D42) — os PRESETS de party no cliente: 8 slots, lidos do servidor, aplicados por
// cima do preenchimento padrão e ainda editáveis antes de entrar.
//
// O que se afirma aqui é o encaixe na store (a regra de QUEM vem marcado sem preset está em
// `quemVai.test.ts`, e a validação de posse e tamanho é do servidor, em
// `apps/server/tests/partyPresets.test.ts`): a lista vem com o hub; aplicar um preset troca
// a seleção pelos heróis dele — só os que o jogador ainda tem, aparados às vagas da missão;
// salvar manda a seleção atual para o slot e relê a lista; o que o servidor recusa vira erro
// na tela em vez de sumir.

const TOKEN = 'token-presets';

const CAPITULOS = [
  {
    id: 'chapter-1',
    order: 1,
    name: 'Capítulo 1',
    cleared: false,
    missions: [
      { id: 'encounter-campanha-1', order: 1, name: 'Missão 1', cleared: false, slots: 1 },
      { id: 'encounter-campanha-2', order: 2, name: 'Missão 2', cleared: false, slots: 2 },
    ],
  },
];

const ROSTER = [
  { hero: { id: 'h-aren', characterId: 'hero-jogador', classId: 'class-espadachim' }, equippedItems: [] },
  { hero: { id: 'h-miron', characterId: 'ally-clerigo', classId: 'class-clerigo' }, equippedItems: [] },
  { hero: { id: 'h-sylla', characterId: 'ally-arqueiro', classId: 'class-arqueiro' }, equippedItems: [] },
];

interface Chamada {
  readonly url: string;
  readonly method: string;
  readonly body: unknown;
}
let chamadas: Chamada[] = [];
let presetsNoServidor: { slot: number; name: string; heroIds: string[] }[] = [];
let recusar: { status: number; error: string } | null = null;

function instalarFetch(): void {
  chamadas = [];
  presetsNoServidor = [];
  recusar = null;
  vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET';
    const body = init?.body ? JSON.parse(init.body as string) : null;
    chamadas.push({ url, method, body });
    if (url === '/api/me/party-presets' && method === 'GET') {
      return new Response(JSON.stringify({ slots: 8, presets: presetsNoServidor.map((p) => ({ ownerPlayerId: 'p1', ...p })) }), { status: 200 });
    }
    const put = url.match(/^\/api\/me\/party-presets\/(\d+)$/);
    if (put && method === 'PUT') {
      if (recusar) return new Response(JSON.stringify({ error: recusar.error }), { status: recusar.status });
      const slot = Number(put[1]);
      presetsNoServidor = [...presetsNoServidor.filter((p) => p.slot !== slot), { slot, ...(body as { name: string; heroIds: string[] }) }];
      return new Response(JSON.stringify({ ownerPlayerId: 'p1', slot, ...(body as object) }), { status: 200 });
    }
    if (put && method === 'DELETE') {
      presetsNoServidor = presetsNoServidor.filter((p) => p.slot !== Number(put[1]));
      return new Response(JSON.stringify({ deleted: true }), { status: 200 });
    }
    return new Response(JSON.stringify({ error: 'rota não semeada' }), { status: 404 });
  });
}

beforeEach(() => {
  instalarFetch();
  useBattleStore.setState((s) => ({
    pvp: { ...s.pvp, token: TOKEN, roster: ROSTER as never },
    campaign: { ...s.campaign, chapters: CAPITULOS, selectedMissionId: null, selectedHeroIds: [], error: null, status: null, ticket: null },
    presets: { slots: 8, lista: [], busy: false, error: null },
  }));
});

afterEach(() => vi.unstubAllGlobals());

describe('os presets de party (M35 3/N)', () => {
  it('lerPresets lê a lista e o número de slots do servidor', async () => {
    presetsNoServidor = [{ slot: 2, name: 'Estrada', heroIds: ['h-miron', 'h-aren'] }];
    await useBattleStore.getState().lerPresets();
    const { presets } = useBattleStore.getState();
    expect(presets.slots).toBe(8);
    expect(presets.lista.map((p) => p.slot)).toEqual([2]);
  });

  it('aplicar um preset troca a seleção pelos heróis dele, na ordem dele, aparado às vagas', async () => {
    presetsNoServidor = [{ slot: 2, name: 'Estrada', heroIds: ['h-miron', 'h-aren', 'h-sylla'] }];
    await useBattleStore.getState().lerPresets();
    useBattleStore.getState().selectChapter('encounter-campanha-2'); // 2 vagas, vem com Aren+Miron

    useBattleStore.getState().aplicarPreset(2);

    expect(useBattleStore.getState().campaign.selectedHeroIds).toEqual(['h-miron', 'h-aren']);
  });

  it('herói do preset que o jogador não tem mais é ignorado — nunca chega ao servidor', async () => {
    presetsNoServidor = [{ slot: 1, name: 'Velho', heroIds: ['h-que-sumiu', 'h-sylla'] }];
    await useBattleStore.getState().lerPresets();
    useBattleStore.getState().selectChapter('encounter-campanha-2');

    useBattleStore.getState().aplicarPreset(1);

    expect(useBattleStore.getState().campaign.selectedHeroIds).toEqual(['h-sylla']);
  });

  it('depois de aplicar, o jogador ainda troca — o preset é ponto de partida', async () => {
    presetsNoServidor = [{ slot: 1, name: 'Um', heroIds: ['h-sylla'] }];
    await useBattleStore.getState().lerPresets();
    useBattleStore.getState().selectChapter('encounter-campanha-2');
    useBattleStore.getState().aplicarPreset(1);

    useBattleStore.getState().toggleCampaignHero('h-aren');

    expect(useBattleStore.getState().campaign.selectedHeroIds).toEqual(['h-sylla', 'h-aren']);
  });

  it('salvar manda a seleção atual para o slot com o nome, e relê a lista', async () => {
    useBattleStore.getState().selectChapter('encounter-campanha-2'); // Aren + Miron

    await useBattleStore.getState().salvarPreset(3, 'Estrada');

    const put = chamadas.find((c) => c.method === 'PUT');
    expect(put?.url).toBe('/api/me/party-presets/3');
    expect(put?.body).toEqual({ name: 'Estrada', heroIds: ['h-aren', 'h-miron'] });
    expect(useBattleStore.getState().presets.lista.map((p) => [p.slot, p.name])).toEqual([[3, 'Estrada']]);
  });

  it('salvar sem nada selecionado não manda requisição', async () => {
    await useBattleStore.getState().salvarPreset(3, 'Vazio');
    expect(chamadas.filter((c) => c.method === 'PUT')).toHaveLength(0);
    expect(useBattleStore.getState().presets.error).toBeTruthy();
  });

  it('o que o servidor recusa vira erro na tela', async () => {
    recusar = { status: 403, error: 'algum heroId não pertence a você' };
    useBattleStore.getState().selectChapter('encounter-campanha-1');

    await useBattleStore.getState().salvarPreset(1, 'X');

    expect(useBattleStore.getState().presets.error).toContain('não pertence');
    expect(useBattleStore.getState().presets.lista).toEqual([]);
  });

  it('apagar um slot relê a lista', async () => {
    presetsNoServidor = [{ slot: 1, name: 'Um', heroIds: ['h-sylla'] }];
    await useBattleStore.getState().lerPresets();

    await useBattleStore.getState().apagarPreset(1);

    expect(chamadas.some((c) => c.method === 'DELETE' && c.url === '/api/me/party-presets/1')).toBe(true);
    expect(useBattleStore.getState().presets.lista).toEqual([]);
  });

  it('o hub carrega os presets junto com o resto', async () => {
    presetsNoServidor = [{ slot: 4, name: 'Serra', heroIds: ['h-aren'] }];
    await useBattleStore.getState().carregarHub();
    expect(useBattleStore.getState().presets.lista.map((p) => p.slot)).toEqual([4]);
  });
});
