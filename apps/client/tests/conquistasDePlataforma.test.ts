import { afterEach, describe, expect, it, vi } from 'vitest';
import type { RewardView } from '../src/data/api.js';
import { espelhosCumpridos, espelharConquistas } from '../src/data/platformAchievements.js';
import { resolvePlatformBridge, type PlatformBridge } from '../src/data/platformBridge.js';

// §9.4 (M21, sub-sessão 3/N) — o cliente encaminhando conquistas para a plataforma.
//
// O que este arquivo trava é a fronteira: o cliente não decide o que está cumprido (regra 3 —
// nenhuma regra no cliente), ele repassa o que o servidor marcou. E o navegador, que é o laço
// de desenvolvimento desde M6, não pode nem tentar — lá não existe plataforma.

afterEach(() => vi.unstubAllGlobals());

function conquista(id: string, overrides: Partial<RewardView> = {}): RewardView {
  return {
    id,
    kind: 'achievement',
    name: id,
    description: '',
    premium: 100,
    claimed: false,
    claimable: false,
    platform: { id: `ACH_${id.toUpperCase()}`, earned: false },
    ...overrides,
  };
}

describe('espelhosCumpridos()', () => {
  it('leva só o que o SERVIDOR marcou como cumprido', () => {
    const rewards = [
      conquista('a', { platform: { id: 'ACH_A', earned: true } }),
      conquista('b', { platform: { id: 'ACH_B', earned: false } }),
    ];

    expect(espelhosCumpridos(rewards)).toEqual(['ACH_A']);
  });

  it('cumprida e já reivindicada continua indo — reivindicar não desfaz o que aconteceu', () => {
    const rewards = [conquista('a', { claimed: true, platform: { id: 'ACH_A', earned: true } })];

    expect(espelhosCumpridos(rewards)).toEqual(['ACH_A']);
  });

  it('evento não vai — ele não tem espelho, porque conquista de plataforma não expira', () => {
    const evento: RewardView = {
      id: 'event-abertura',
      kind: 'event',
      name: 'Abertura',
      description: '',
      premium: 100,
      claimed: false,
      claimable: true,
      windowOpen: true,
    };

    expect(espelhosCumpridos([evento])).toEqual([]);
  });
});

describe('espelharConquistas()', () => {
  it('no NAVEGADOR não chama nada — a ponte de desenvolvimento não tem plataforma', async () => {
    vi.stubGlobal('window', {});
    const bridge = resolvePlatformBridge();

    // A ausência do método é a forma de dizer "não existe plataforma aqui", e é o que
    // impede o laço de desenvolvimento de virar uma sequência de erros no console.
    expect(bridge.syncAchievements).toBeUndefined();
    await expect(espelharConquistas([conquista('a', { platform: { id: 'ACH_A', earned: true } })], bridge)).resolves
      .toBeUndefined();
  });

  it('no SHELL, encaminha as cumpridas', async () => {
    const recebidas: string[][] = [];
    const bridge: PlatformBridge = {
      requestSessionTicket: async () => 'TICKET',
      syncAchievements: async (nomes) => {
        recebidas.push([...nomes]);
        return null;
      },
    };

    await espelharConquistas(
      [
        conquista('a', { platform: { id: 'ACH_A', earned: true } }),
        conquista('b', { platform: { id: 'ACH_B', earned: false } }),
      ],
      bridge,
    );

    expect(recebidas).toEqual([['ACH_A']]);
  });

  it('nada cumprido não fala com a plataforma', async () => {
    const chamadas: unknown[] = [];
    const bridge: PlatformBridge = {
      requestSessionTicket: async () => 'TICKET',
      syncAchievements: async (nomes) => {
        chamadas.push(nomes);
        return null;
      },
    };

    await espelharConquistas([conquista('a')], bridge);

    expect(chamadas).toEqual([]);
  });

  it('a plataforma falhando não estoura na tela', async () => {
    // Conquista é enfeite de perfil. Uma exceção não tratada aqui derrubaria a tela de
    // prêmios inteira por causa de um ícone que não apareceu.
    const bridge: PlatformBridge = {
      requestSessionTicket: async () => 'TICKET',
      syncAchievements: async () => {
        throw new Error('steamworks caiu');
      },
    };

    await expect(espelharConquistas([conquista('a', { platform: { id: 'ACH_A', earned: true } })], bridge)).resolves
      .toBeUndefined();
  });

  it('a ponte do shell embrulha o método, e a falha morre nela', async () => {
    vi.stubGlobal('window', {
      pathsBeyond: {
        requestSessionTicket: async () => 'TICKET',
        syncAchievements: async () => {
          throw new Error('steamworks caiu');
        },
      },
    });

    const bridge = resolvePlatformBridge();

    expect(bridge.syncAchievements).toBeDefined();
    await expect(bridge.syncAchievements!(['ACH_A'])).resolves.toBeNull();
  });
});
