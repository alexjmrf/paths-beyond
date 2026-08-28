import { RULES_VERSION, type TacticsScript, type TalentAllocation } from '@paths-beyond/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { campaignMaps } from '../src/data/campaign.js';
import { DEFAULT_UI_SCALE, UI_SCALES } from '../src/data/overlayTheme.js';
import {
  SAVE_FORMAT_VERSION,
  SAVE_STORAGE_KEY,
  parseSave,
  reconcileSave,
  serializeSave,
  type SaveEnvironment,
  type SaveGame,
} from '../src/logic/save.js';

// M13, sub-sessão 3/N — o critério de aceite que faltava em M13: "progresso sobrevive a
// recarregar a página".
//
// O cliente não entra em `pnpm test` desde M6 (não há renderização a testar sem browser), e
// a verificação da UI continua sendo o roteiro real de navegador. O que este arquivo trava é
// a parte que o roteiro não consegue provar de forma barata e repetível: que o save
// sobrevive a JSON corrompido, a uma `rulesVersion` antiga e a conteúdo que mudou embaixo
// dele — e que recarregar devolve o jogador ao capítulo em que ele estava, com o que ele
// tinha configurado.
//
// O store é importado dinamicamente nos testes de hidratação porque ele lê o save UMA vez,
// no boot do módulo (é o que evita a tela abrir no capítulo 1 e saltar): para simular
// "recarregar a página" é preciso semear o armazenamento e só então importar o módulo.

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

// Um script de tática REAL da campanha (§6.3, autorado em `packages/data`), não um objeto
// inventado: é ele que passa pelo parser variante a variante.
const realScript: TacticsScript = campaignMaps[0]!.setup.units[0]!.tacticsScript;

const baseSave: SaveGame = {
  v: SAVE_FORMAT_VERSION,
  rulesVersion: RULES_VERSION,
  campaignMapIndex: 2,
  campaignComplete: false,
  tacticsOverrides: { 'unidade-a': realScript },
  equippedByUnit: { 'unidade-a': { weapon: 'item-x', boots: 'item-y' } },
  talentAllocationByUnit: { 'unidade-a': { 'no-1': 2 } },
  instantResultMode: true,
  colorblindMode: true,
  uiScale: 1.5,
  pvpToken: 'token-de-teste',
};

const permissiveEnv: SaveEnvironment = {
  rulesVersion: RULES_VERSION,
  chapterCount: campaignMaps.length,
  itemExists: () => true,
  allocationIsValid: () => true,
};

describe('formato do save', () => {
  it('faz round-trip de um save completo, com script de tática real', () => {
    expect(parseSave(serializeSave(baseSave))).toEqual(baseSave);
  });

  it('o script que volta do disco é aceito pelo motor como setup de batalha', () => {
    const restored = parseSave(serializeSave(baseSave));
    // Igualdade estrutural com o script autorado: se o parser tivesse perdido uma condition
    // (ou um campo dela), a unidade entraria no capítulo com uma tática diferente da que o
    // jogador preparou — em silêncio.
    expect(restored?.tacticsOverrides['unidade-a']).toEqual(realScript);
  });

  it.each([
    ['JSON corrompido', '{não é json'],
    ['string vazia', ''],
    ['array no lugar do objeto', '[]'],
    ['versão de formato desconhecida', JSON.stringify({ ...baseSave, v: SAVE_FORMAT_VERSION + 1 })],
    ['capítulo negativo', JSON.stringify({ ...baseSave, campaignMapIndex: -1 })],
    ['capítulo fracionário', JSON.stringify({ ...baseSave, campaignMapIndex: 1.5 })],
    ['campo obrigatório ausente', JSON.stringify({ v: SAVE_FORMAT_VERSION, rulesVersion: RULES_VERSION })],
    ['rank de talento negativo', JSON.stringify({ ...baseSave, talentAllocationByUnit: { u: { n: -1 } } })],
    ['slot de equipamento inexistente', JSON.stringify({ ...baseSave, equippedByUnit: { u: { chapeu: 'i' } } })],
    [
      'condition de tipo inexistente',
      JSON.stringify({
        ...baseSave,
        tacticsOverrides: { u: [{ enabled: true, skillId: 's', conditions: [{ t: 'inventada' }] }] },
      }),
    ],
    [
      'condition com campo do tipo errado',
      JSON.stringify({
        ...baseSave,
        tacticsOverrides: { u: [{ enabled: true, skillId: 's', conditions: [{ t: 'selfHpBelow', pct: 'metade' }] }] },
      }),
    ],
    [
      'troca fora de 1..3',
      JSON.stringify({
        ...baseSave,
        tacticsOverrides: { u: [{ enabled: true, skillId: 's', conditions: [{ t: 'trocaAtLeast', n: 4 }] }] },
      }),
    ],
    [
      'unitType inexistente em targetIsType',
      JSON.stringify({
        ...baseSave,
        tacticsOverrides: { u: [{ enabled: true, skillId: 's', conditions: [{ t: 'targetIsType', type: 'dragão' }] }] },
      }),
    ],
  ])('descarta save inválido: %s', (_caso, raw) => {
    expect(parseSave(raw)).toBeNull();
  });

  // As preferências de acessibilidade (M13 4/N) entraram DEPOIS de o formato v1 existir.
  // O save gravado antes delas não pode ser jogado fora: seria perder capítulo,
  // equipamento e talentos por causa de uma preferência nova.
  it('save anterior às preferências de acessibilidade carrega, com os defaults', () => {
    const { colorblindMode, uiScale, ...semAcessibilidade } = baseSave;
    void colorblindMode;
    void uiScale;

    const parsed = parseSave(JSON.stringify(semAcessibilidade));
    expect(parsed).not.toBeNull();
    expect(parsed?.campaignMapIndex).toBe(baseSave.campaignMapIndex);
    expect(parsed?.equippedByUnit).toEqual(baseSave.equippedByUnit);
    expect(parsed?.colorblindMode).toBe(false);
    expect(parsed?.uiScale).toBe(DEFAULT_UI_SCALE);
  });

  it('escala fora da lista cai no default sem invalidar o save', () => {
    const parsed = parseSave(JSON.stringify({ ...baseSave, uiScale: 3.7 }));
    expect(parsed?.uiScale).toBe(DEFAULT_UI_SCALE);
    expect(parsed?.campaignMapIndex).toBe(baseSave.campaignMapIndex);
  });

  it('mas erro de TIPO na preferência é formato malformado e rejeita', () => {
    expect(parseSave(JSON.stringify({ ...baseSave, uiScale: 'grande' }))).toBeNull();
    expect(parseSave(JSON.stringify({ ...baseSave, colorblindMode: 'sim' }))).toBeNull();
  });

  it('todas as escalas oferecidas atravessam o save', () => {
    for (const scale of UI_SCALES) {
      expect(parseSave(serializeSave({ ...baseSave, uiScale: scale }))?.uiScale).toBe(scale);
    }
  });

  it('aceita `not` aninhado, que é a única condition recursiva (§6.3)', () => {
    const script: TacticsScript = [
      { enabled: true, skillId: 's', conditions: [{ t: 'not', c: { t: 'not', c: { t: 'isAttacker' } } }] },
    ];
    const parsed = parseSave(serializeSave({ ...baseSave, tacticsOverrides: { u: script } }));
    expect(parsed?.tacticsOverrides.u).toEqual(script);
  });

  it('rejeita `not` cujo interior é inválido', () => {
    const raw = JSON.stringify({
      ...baseSave,
      tacticsOverrides: { u: [{ enabled: true, skillId: 's', conditions: [{ t: 'not', c: { t: 'inventada' } }] }] },
    });
    expect(parseSave(raw)).toBeNull();
  });
});

describe('reconciliação com o mundo atual', () => {
  it('`rulesVersion` antiga descarta só as táticas — capítulo, itens e talentos ficam', () => {
    const velho: SaveGame = { ...baseSave, rulesVersion: '0.0.1-antiga' };
    const reconciled = reconcileSave(velho, permissiveEnv);

    expect(reconciled.tacticsOverrides).toEqual({});
    expect(reconciled.campaignMapIndex).toBe(2);
    expect(reconciled.equippedByUnit).toEqual(baseSave.equippedByUnit);
    expect(reconciled.talentAllocationByUnit).toEqual(baseSave.talentAllocationByUnit);
    expect(reconciled.rulesVersion).toBe(RULES_VERSION);
  });

  it('mesma `rulesVersion` preserva as táticas', () => {
    expect(reconcileSave(baseSave, permissiveEnv).tacticsOverrides).toEqual(baseSave.tacticsOverrides);
  });

  it('capítulo fora de faixa é clampado no último que ainda existe', () => {
    const reconciled = reconcileSave({ ...baseSave, campaignMapIndex: 99 }, { ...permissiveEnv, chapterCount: 4 });
    expect(reconciled.campaignMapIndex).toBe(3);
  });

  it('item que saiu do catálogo some do slot, o resto do equipamento fica', () => {
    const reconciled = reconcileSave(baseSave, { ...permissiveEnv, itemExists: (id) => id !== 'item-x' });
    expect(reconciled.equippedByUnit['unidade-a']).toEqual({ boots: 'item-y' });
  });

  it('alocação que a árvore atual não aceita mais é zerada; a válida é preservada', () => {
    const save: SaveGame = {
      ...baseSave,
      talentAllocationByUnit: { quebrada: { 'no-1': 3 }, intacta: { 'no-2': 1 } },
    };
    const reconciled = reconcileSave(save, {
      ...permissiveEnv,
      allocationIsValid: (unitId) => unitId !== 'quebrada',
    });
    expect(reconciled.talentAllocationByUnit).toEqual({ quebrada: {}, intacta: { 'no-2': 1 } });
  });

  it('preferências e token atravessam a reconciliação intactos', () => {
    const reconciled = reconcileSave({ ...baseSave, rulesVersion: '0.0.1-antiga' }, permissiveEnv);
    expect(reconciled.instantResultMode).toBe(true);
    expect(reconciled.pvpToken).toBe('token-de-teste');
    // Acessibilidade não é progresso nem regra: nada do mundo pode desligá-la.
    expect(reconciled.colorblindMode).toBe(true);
    expect(reconciled.uiScale).toBe(1.5);
  });
});

// "Recarregar a página" = semear o armazenamento e importar o store do zero.
describe('o store restaura o progresso ao abrir', () => {
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

  it('sem save, abre no capítulo 1', async () => {
    const { useBattleStore } = await importStore();
    expect(useBattleStore.getState().campaignMapIndex).toBe(0);
    expect(useBattleStore.getState().campaignComplete).toBe(false);
  });

  it('com save, abre no capítulo salvo e com o mapa daquele capítulo montado', async () => {
    const chapter = campaignMaps.length - 1;
    storage.setItem(
      SAVE_STORAGE_KEY,
      serializeSave({ ...baseSave, campaignMapIndex: chapter, tacticsOverrides: {} }),
    );

    const { useBattleStore } = await importStore();
    const state = useBattleStore.getState();

    expect(state.campaignMapIndex).toBe(chapter);
    // Não basta o índice: o `battleState` tem que ser o do capítulo salvo, e não o do 1
    // com um rótulo diferente.
    expect(state.battleState.map.width).toBe(campaignMaps[chapter]!.setup.map.width);
    expect(state.battleState.map.height).toBe(campaignMaps[chapter]!.setup.map.height);
    expect(state.battleState.units.map((u) => u.unitId).sort()).toEqual(
      campaignMaps[chapter]!.setup.units.map((u) => u.unitId).sort(),
    );
    expect(state.instantResultMode).toBe(true);
    expect(state.pvp.token).toBe('token-de-teste');
  });

  it('as táticas preparadas voltam aplicadas nas unidades do mapa, não só no save', async () => {
    const unit = campaignMaps[0]!.setup.units.find((u) => u.side === 'player')!;
    const editado: TacticsScript = [{ enabled: true, skillId: 'skill-ataque-basico', conditions: [{ t: 'isAttacker' }] }];
    storage.setItem(
      SAVE_STORAGE_KEY,
      serializeSave({ ...baseSave, campaignMapIndex: 0, tacticsOverrides: { [unit.unitId]: editado } }),
    );

    const { useBattleStore } = await importStore();
    const restored = useBattleStore.getState().battleState.units.find((u) => u.unitId === unit.unitId);

    expect(restored?.tacticsScript).toEqual(editado);
  });

  it('equipamento e talentos salvos voltam no store', async () => {
    const itemId = Object.keys((await import('../src/data/catalog.js')).catalog.items)[0]!;
    const allocation: TalentAllocation = {};
    storage.setItem(
      SAVE_STORAGE_KEY,
      serializeSave({
        ...baseSave,
        campaignMapIndex: 0,
        tacticsOverrides: {},
        equippedByUnit: { 'unidade-a': { weapon: itemId } },
        talentAllocationByUnit: { 'unidade-a': allocation },
      }),
    );

    const { useBattleStore } = await importStore();
    const state = useBattleStore.getState();
    expect(state.equippedByUnit['unidade-a']).toEqual({ weapon: itemId });
    expect(state.talentAllocationByUnit['unidade-a']).toEqual(allocation);
  });

  it('save de `rulesVersion` antiga mantém o capítulo e larga as táticas', async () => {
    const unit = campaignMaps[0]!.setup.units.find((u) => u.side === 'player')!;
    storage.setItem(
      SAVE_STORAGE_KEY,
      serializeSave({
        ...baseSave,
        rulesVersion: '0.0.1-antiga',
        campaignMapIndex: 1,
        tacticsOverrides: { [unit.unitId]: [] },
      }),
    );

    const { useBattleStore } = await importStore();
    const state = useBattleStore.getState();
    expect(state.campaignMapIndex).toBe(1);
    expect(state.tacticsOverrides).toEqual({});
  });

  it('campanha concluída sobrevive à recarga (e a saída é `clearProgress`)', async () => {
    storage.setItem(
      SAVE_STORAGE_KEY,
      serializeSave({
        ...baseSave,
        campaignMapIndex: campaignMaps.length - 1,
        campaignComplete: true,
        tacticsOverrides: {},
      }),
    );

    const { useBattleStore } = await importStore();
    // Antes da persistência, recarregar era o que recomeçava a campanha; agora a tela de
    // "Campanha concluída" volta a cada recarga e cobre o cabeçalho inteiro, então o
    // painel dela precisa ter a própria saída.
    expect(useBattleStore.getState().campaignComplete).toBe(true);

    useBattleStore.getState().clearProgress();
    expect(useBattleStore.getState().campaignComplete).toBe(false);
    expect(useBattleStore.getState().campaignMapIndex).toBe(0);
  });

  it('as preferências de acessibilidade voltam no store', async () => {
    storage.setItem(
      SAVE_STORAGE_KEY,
      serializeSave({ ...baseSave, campaignMapIndex: 0, tacticsOverrides: {}, colorblindMode: true, uiScale: 1.75 }),
    );

    const { useBattleStore } = await importStore();
    expect(useBattleStore.getState().colorblindMode).toBe(true);
    expect(useBattleStore.getState().uiScale).toBe(1.75);
  });

  it('"Apagar progresso" NÃO desliga a acessibilidade', async () => {
    storage.setItem(
      SAVE_STORAGE_KEY,
      serializeSave({ ...baseSave, campaignMapIndex: 2, tacticsOverrides: {}, colorblindMode: true, uiScale: 1.5 }),
    );

    const { useBattleStore } = await importStore();
    useBattleStore.getState().clearProgress();

    const state = useBattleStore.getState();
    expect(state.campaignMapIndex).toBe(0);
    // Apagar progresso é sobre progresso. Desligar o modo daltônico de quem depende dele
    // seria hostil — e o save regravado tem que continuar carregando a preferência.
    expect(state.colorblindMode).toBe(true);
    expect(state.uiScale).toBe(1.5);
    expect(parseSave(storage.getItem(SAVE_STORAGE_KEY))?.colorblindMode).toBe(true);
  });

  it('escala não oferecida é ignorada pelo store', async () => {
    const { useBattleStore } = await importStore();
    useBattleStore.getState().setUiScale(1.5);
    useBattleStore.getState().setUiScale(9);
    expect(useBattleStore.getState().uiScale).toBe(1.5);
  });

  it('save corrompido não derruba o boot: começa do zero', async () => {
    storage.setItem(SAVE_STORAGE_KEY, '{isto não é json');
    const { useBattleStore } = await importStore();
    expect(useBattleStore.getState().campaignMapIndex).toBe(0);
  });

  it('avançar de capítulo grava o save sozinho', async () => {
    const { useBattleStore } = await importStore();
    expect(storage.getItem(SAVE_STORAGE_KEY)).toBeNull();

    useBattleStore.getState().advanceToNextMap();

    const gravado = parseSave(storage.getItem(SAVE_STORAGE_KEY));
    expect(gravado?.campaignMapIndex).toBe(1);
    expect(gravado?.rulesVersion).toBe(RULES_VERSION);
  });

  it('"Apagar progresso" volta ao capítulo 1 e limpa o que estava salvo', async () => {
    storage.setItem(SAVE_STORAGE_KEY, serializeSave({ ...baseSave, campaignMapIndex: 3, tacticsOverrides: {} }));

    const { useBattleStore } = await importStore();
    expect(useBattleStore.getState().campaignMapIndex).toBe(3);

    useBattleStore.getState().clearProgress();

    const state = useBattleStore.getState();
    expect(state.campaignMapIndex).toBe(0);
    expect(state.equippedByUnit).toEqual({});
    expect(state.talentAllocationByUnit).toEqual({});
    expect(state.pvp.token).toBe('');
    expect(parseSave(storage.getItem(SAVE_STORAGE_KEY))?.campaignMapIndex).toBe(0);
  });
});
