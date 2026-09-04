import { RULES_VERSION } from '@paths-beyond/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_UI_SCALE, UI_SCALES } from '../src/data/overlayTheme.js';
import {
  SAVE_FORMAT_VERSION,
  SAVE_STORAGE_KEY,
  parseSave,
  serializeSave,
  type SaveGame,
} from '../src/logic/save.js';

// §11/§09-roadmap (M13, sub-sessão 3/N) — "progresso sobrevive a recarregar a página".
//
// **M18, sub-sessão 7/N: este arquivo encolheu junto com o save.** Ele testava capítulo
// alcançado, scripts táticos preparados, equipamento e alocação de talentos — as quatro
// coisas que o cliente guardava porque a campanha era jogada nele. Com a campanha passando
// pelo servidor, cada uma ganhou dono melhor (`GET /campaign`, `PUT /heroes/:id/tactics`,
// `PUT /heroes/:id/talents`, `POST /heroes/:id/equip`), e testar aqui uma cópia local delas
// seria testar a segunda verdade que a fatia existiu para apagar.
//
// O que sobrou é o que o servidor não tem: preferências de apresentação e o token. E a
// migração do save antigo, que é a parte nova — v1 não é descartado.
//
// O store é importado dinamicamente nos testes de hidratação porque ele lê o save UMA vez,
// no boot do módulo: para simular "recarregar a página" é preciso semear o armazenamento e
// só então importar o módulo.

class FakeStorage {
  private readonly entries = new Map<string, string>();

  getItem(key: string): string | null {
    return this.entries.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.entries.set(key, value);
  }
  removeItem(key: string): void {
    this.entries.delete(key);
  }
  get size(): number {
    return this.entries.size;
  }
}

const baseSave: SaveGame = {
  v: SAVE_FORMAT_VERSION,
  rulesVersion: RULES_VERSION,
  instantResultMode: true,
  colorblindMode: true,
  uiScale: 1.5,
  pvpToken: 'token-de-teste',
  // M23 1/N — v3: quais dicas da introdução contextual o jogador já dispensou.
  introducoesVistas: ['preview-de-duelo'],
  // M24 — v4: os dois volumes.
  volumeEfeitos: 0.4,
  volumeMusica: 0.2,
};

// Um save na forma ANTIGA, como um jogador de M13–M18 6/N tem no disco agora.
const saveV1 = {
  v: 1,
  rulesVersion: '0.18.0',
  campaignMapIndex: 3,
  campaignComplete: false,
  tacticsOverrides: { 'unidade-a': [{ enabled: true, skillId: 'skill-x', conditions: [] }] },
  equippedByUnit: { 'unidade-a': { weapon: 'item-x' } },
  talentAllocationByUnit: { 'unidade-a': { 'no-1': 2 } },
  instantResultMode: true,
  colorblindMode: true,
  uiScale: 1.5,
  pvpToken: 'token-antigo',
};

describe('parseSave — o save é dado do disco do jogador', () => {
  it('lê de volta o que serializou', () => {
    expect(parseSave(serializeSave(baseSave))).toEqual(baseSave);
  });

  it.each([
    ['nulo', null],
    ['vazio', ''],
    ['JSON quebrado', '{'],
    ['não é objeto', '[]'],
    ['versão do futuro', JSON.stringify({ ...baseSave, v: 99 })],
    ['sem rulesVersion', JSON.stringify({ ...baseSave, rulesVersion: undefined })],
    ['instantResultMode com tipo errado', JSON.stringify({ ...baseSave, instantResultMode: 'sim' })],
    ['token com tipo errado', JSON.stringify({ ...baseSave, pvpToken: 42 })],
    ['colorblindMode com tipo errado', JSON.stringify({ ...baseSave, colorblindMode: 'sim' })],
    ['uiScale com tipo errado', JSON.stringify({ ...baseSave, uiScale: 'grande' })],
  ])('rejeita save %s', (_rotulo, raw) => {
    expect(parseSave(raw as string | null)).toBeNull();
  });

  // A regra que separa os dois tratamentos, desde M13 4/N: **erro de TIPO é formato
  // malformado e rejeita; valor fora de faixa é preferência recuperável e cai no default.**
  it('escala fora da lista oferecida cai no default em vez de invalidar o save', () => {
    const lido = parseSave(JSON.stringify({ ...baseSave, uiScale: 3.7 }));

    expect(lido).not.toBeNull();
    expect(lido!.uiScale).toBe(DEFAULT_UI_SCALE);
    expect(lido!.pvpToken).toBe(baseSave.pvpToken);
  });

  it('save sem as preferências de acessibilidade (anterior a M13 4/N) continua válido', () => {
    const semPreferencias = { ...baseSave, colorblindMode: undefined, uiScale: undefined };
    const lido = parseSave(JSON.stringify(semPreferencias));

    expect(lido?.colorblindMode).toBe(false);
    expect(lido?.uiScale).toBe(DEFAULT_UI_SCALE);
  });

  it('toda escala oferecida na tela sobrevive à ida e volta', () => {
    for (const scale of UI_SCALES) {
      expect(parseSave(serializeSave({ ...baseSave, uiScale: scale }))?.uiScale).toBe(scale);
    }
  });
});

// M18 7/N — a parte nova. Descartar o v1 apagaria o tamanho de fonte, o modo daltônico e o
// token de quem já jogava, por causa de uma mudança de arquitetura que não é dele.
describe('parseSave — a migração do save v1', () => {
  it('aceita um save v1 e o devolve como v2', () => {
    const lido = parseSave(JSON.stringify(saveV1));

    expect(lido).not.toBeNull();
    expect(lido!.v).toBe(SAVE_FORMAT_VERSION);
  });

  it('preserva o que continua significando a mesma coisa: preferências e token', () => {
    const lido = parseSave(JSON.stringify(saveV1))!;

    expect(lido.instantResultMode).toBe(true);
    expect(lido.colorblindMode).toBe(true);
    expect(lido.uiScale).toBe(1.5);
    expect(lido.pvpToken).toBe('token-antigo');
  });

  it('NÃO carrega o progresso local para dentro do formato novo', () => {
    // Quem guarda capítulo, táticas, equipamento e talentos agora é o servidor. Trazer a
    // cópia do disco do jogador seria deixá-la disputar autoridade com a conta (§9.4).
    const lido = parseSave(JSON.stringify(saveV1))! as unknown as Record<string, unknown>;

    for (const campo of ['campaignMapIndex', 'campaignComplete', 'tacticsOverrides', 'equippedByUnit', 'talentAllocationByUnit']) {
      expect(lido[campo], campo).toBeUndefined();
    }
  });

  it('um v1 malformado continua sendo rejeitado', () => {
    expect(parseSave(JSON.stringify({ ...saveV1, pvpToken: 42 }))).toBeNull();
  });
});


// Cada teste abaixo reimporta o store, e com ele o catálogo inteiro de `packages/data`. Sob
// a suíte completa isso passa dos 5s padrão do Vitest — é custo de arnês, não do produto:
// rodando só o pacote do cliente cada um leva menos de um segundo.
const HIDRATACAO_TIMEOUT = 30_000;

describe('o store restaura as preferências ao abrir', () => {
  let storage: FakeStorage;

  beforeEach(() => {
    storage = new FakeStorage();
    vi.stubGlobal('localStorage', storage);
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  async function importStore() {
    return await import('../src/store/battleStore.js');
  }

  // M18 7/N — o que "abrir o jogo" significa mudou: não há mais capítulo montado na
  // abertura, porque a batalha vem do servidor. A tela abre num tabuleiro vazio e o jogador
  // escolhe o capítulo.
  it(
    'sem save, abre num tabuleiro vazio e sem capítulo escolhido',
    async () => {
      const { useBattleStore } = await importStore();
      const state = useBattleStore.getState();

      expect(state.battleState.units).toHaveLength(0);
      expect(state.battleState.outcome).toBe('ongoing');
      expect(state.campaign.ticket).toBeNull();
      expect(state.campaign.chapters).toEqual([]);
    },
    HIDRATACAO_TIMEOUT,
  );

  it(
    'as preferências de acessibilidade voltam no store',
    async () => {
      storage.setItem(SAVE_STORAGE_KEY, serializeSave({ ...baseSave, colorblindMode: true, uiScale: 1.75 }));

      const { useBattleStore } = await importStore();
      const state = useBattleStore.getState();

      expect(state.colorblindMode).toBe(true);
      expect(state.uiScale).toBe(1.75);
      expect(state.instantResultMode).toBe(true);
    },
    HIDRATACAO_TIMEOUT,
  );

  it(
    'o token do PvP volta: redigitá-lo a cada recarga seria hostil',
    async () => {
      storage.setItem(SAVE_STORAGE_KEY, serializeSave(baseSave));

      const { useBattleStore } = await importStore();

      expect(useBattleStore.getState().pvp.token).toBe('token-de-teste');
    },
    HIDRATACAO_TIMEOUT,
  );

  it(
    'um save v1 no disco hidrata o store sem quebrar nada',
    async () => {
      storage.setItem(SAVE_STORAGE_KEY, JSON.stringify(saveV1));

      const { useBattleStore } = await importStore();
      const state = useBattleStore.getState();

      expect(state.pvp.token).toBe('token-antigo');
      expect(state.colorblindMode).toBe(true);
      expect(state.battleState.units).toHaveLength(0);
    },
    HIDRATACAO_TIMEOUT,
  );

  it(
    'save corrompido não derruba o boot: começa do zero',
    async () => {
      storage.setItem(SAVE_STORAGE_KEY, '{ isto não é json');

      const { useBattleStore } = await importStore();

      expect(useBattleStore.getState().colorblindMode).toBe(false);
      expect(useBattleStore.getState().uiScale).toBe(DEFAULT_UI_SCALE);
    },
    HIDRATACAO_TIMEOUT,
  );

  it(
    'mudar uma preferência grava o save sozinho',
    async () => {
      const { useBattleStore } = await importStore();

      useBattleStore.getState().toggleColorblindMode();

      expect(parseSave(storage.getItem(SAVE_STORAGE_KEY))?.colorblindMode).toBe(true);
    },
    HIDRATACAO_TIMEOUT,
  );

  it(
    '"Apagar progresso" limpa o que estava salvo e volta ao tabuleiro vazio',
    async () => {
      storage.setItem(SAVE_STORAGE_KEY, serializeSave(baseSave));
      const { useBattleStore } = await importStore();
      expect(useBattleStore.getState().pvp.token).toBe('token-de-teste');

      useBattleStore.getState().clearProgress();
      const state = useBattleStore.getState();

      expect(state.pvp.token).toBe('');
      expect(state.campaign.chapters).toEqual([]);
      expect(state.battleState.units).toHaveLength(0);
    },
    HIDRATACAO_TIMEOUT,
  );

  // §11 (acessibilidade) — apagar o progresso não pode desligar o modo daltônico: quem
  // precisa dele precisa dele sempre, e recomeçar não é uma escolha de apresentação.
  it(
    '"Apagar progresso" NÃO desliga a acessibilidade',
    async () => {
      storage.setItem(SAVE_STORAGE_KEY, serializeSave({ ...baseSave, colorblindMode: true, uiScale: 1.75 }));
      const { useBattleStore } = await importStore();

      useBattleStore.getState().clearProgress();

      expect(useBattleStore.getState().colorblindMode).toBe(true);
      expect(useBattleStore.getState().uiScale).toBe(1.75);
    },
    HIDRATACAO_TIMEOUT,
  );

  it(
    'escala não oferecida é ignorada pelo store',
    async () => {
      const { useBattleStore } = await importStore();

      useBattleStore.getState().setUiScale(9);

      expect(useBattleStore.getState().uiScale).toBe(DEFAULT_UI_SCALE);
    },
    HIDRATACAO_TIMEOUT,
  );
});

// §1.1 (M23, sub-sessão 1/N) — a migração para v3, e o que ela decide sobre quem já jogava.
describe('save v3 — as introduções vistas', () => {
  it('save v2 sobe para v3 com a lista VAZIA — quem já jogava vê a introdução uma vez', () => {
    // A alternativa seria marcar tudo como visto para não incomodar quem já conhece o jogo.
    // Ela esconderia a introdução justamente de quem pode ter aprendido errado, e o custo de
    // errar para o outro lado é uma caixa de texto fechada uma vez.
    const v2 = JSON.stringify({
      v: 2,
      rulesVersion: RULES_VERSION,
      instantResultMode: false,
      colorblindMode: false,
      uiScale: 1,
      pvpToken: 'token',
    });

    const lido = parseSave(v2);

    expect(lido?.v).toBe(SAVE_FORMAT_VERSION);
    expect(lido?.introducoesVistas).toEqual([]);
    // E o que já era verdade continua: preferências e token sobrevivem à migração.
    expect(lido?.pvpToken).toBe('token');
  });

  it('preserva id desconhecido — o save pode vir de uma versão mais nova', () => {
    const doFuturo = JSON.stringify({ ...baseSave, introducoesVistas: ['dica-do-futuro'] });

    expect(parseSave(doFuturo)?.introducoesVistas).toEqual(['dica-do-futuro']);
  });

  it('rejeita `introducoesVistas` com tipo errado, como qualquer outro campo malformado', () => {
    expect(parseSave(JSON.stringify({ ...baseSave, introducoesVistas: 'preview-de-duelo' }))).toBeNull();
    expect(parseSave(JSON.stringify({ ...baseSave, introducoesVistas: [1, 2] }))).toBeNull();
  });
});

// §11 (M24) — o volume atravessando o save, que é o critério de aceite 2 ("persistidos no
// save ao lado de `uiScale` e `colorblindMode`").
describe('save v4 — os volumes', () => {
  it('lê de volta os dois volumes', () => {
    const lido = parseSave(serializeSave(baseSave));

    expect(lido?.volumeEfeitos).toBe(0.4);
    expect(lido?.volumeMusica).toBe(0.2);
  });

  it('save v3 sobe para v4 com o volume PADRÃO — quem já jogava não abre o jogo mudo', () => {
    const v3 = JSON.stringify({
      v: 3,
      rulesVersion: RULES_VERSION,
      instantResultMode: false,
      colorblindMode: false,
      uiScale: 1,
      pvpToken: 'token',
      introducoesVistas: ['preview-de-duelo'],
    });

    const lido = parseSave(v3);

    expect(lido?.v).toBe(SAVE_FORMAT_VERSION);
    expect(lido?.volumeEfeitos).toBeGreaterThan(0);
    // E o que já era verdade continua atravessando: as dicas dispensadas não voltam.
    expect(lido?.introducoesVistas).toEqual(['preview-de-duelo']);
  });

  it('volume fora da faixa cai no padrão em vez de estourar o alto-falante', () => {
    // O save é disco do jogador e pode ter sido editado à mão. Valor fora de faixa é
    // preferência recuperável — a mesma regra que `uiScale` segue desde M13 4/N.
    const absurdo = JSON.stringify({ ...baseSave, volumeEfeitos: 12, volumeMusica: -3 });
    const lido = parseSave(absurdo);

    expect(lido?.volumeEfeitos).toBeGreaterThan(0);
    expect(lido?.volumeEfeitos).toBeLessThanOrEqual(1);
    expect(lido?.volumeMusica).toBeGreaterThanOrEqual(0);
  });

  it('volume com TIPO errado é formato malformado e rejeita', () => {
    expect(parseSave(JSON.stringify({ ...baseSave, volumeEfeitos: 'alto' }))).toBeNull();
  });
});
