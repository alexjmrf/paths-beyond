import { beforeEach, describe, expect, it } from 'vitest';
import { capituloEmFoco, estadoDoCartao } from '../src/logic/campanha.js';
import { useBattleStore } from '../src/store/battleStore.js';

// M35 7/N e 8/N — a Campanha em CARTÕES e a Preparação como tela própria.
//
// O usuário: "a opção de seleção de missões é horrível". A lista de texto em sanfona vira abas de
// capítulo com um grid de cartões; escolher um cartão leva à PREPARAÇÃO (prévia, quem vai,
// presets), e de lá "← Missões" volta ao grid. A decisão do que está em foco é função pura.

const chapters = [
  {
    id: 'cap-1',
    missions: [
      { id: 'm1', cleared: true },
      { id: 'm2', cleared: false },
    ],
  },
  { id: 'cap-2', missions: [{ id: 'm3', cleared: false }] },
];

describe('o capítulo em foco', () => {
  it('sem escolha, é o da próxima missão por limpar — onde o jogador parou', () => {
    expect(capituloEmFoco(chapters, null, null)).toBe('cap-1');
    const tudoLimpoNo1 = [{ ...chapters[0]!, missions: chapters[0]!.missions.map((m) => ({ ...m, cleared: true })) }, chapters[1]!];
    expect(capituloEmFoco(tudoLimpoNo1, null, null)).toBe('cap-2');
  });

  it('a missão escolhida puxa o capítulo dela', () => {
    expect(capituloEmFoco(chapters, null, 'm3')).toBe('cap-2');
  });

  it('a aba que o jogador clicou vence tudo', () => {
    expect(capituloEmFoco(chapters, 'cap-2', 'm1')).toBe('cap-2');
  });

  it('campanha vazia não tem foco', () => {
    expect(capituloEmFoco([], null, null)).toBeNull();
  });
});

describe('o estado de cada cartão', () => {
  it('limpa, próxima (a que o jogador deve jogar) ou disponível', () => {
    expect(estadoDoCartao({ id: 'm1', cleared: true }, 'm2')).toBe('limpa');
    expect(estadoDoCartao({ id: 'm2', cleared: false }, 'm2')).toBe('proxima');
    expect(estadoDoCartao({ id: 'm3', cleared: false }, 'm2')).toBe('disponivel');
  });
});

describe('a navegação entre o grid e a Preparação, na store', () => {
  beforeEach(() => {
    useBattleStore.setState((s) => ({
      campaign: {
        ...s.campaign,
        chapters: [
          {
            id: 'cap-1',
            order: 1,
            name: 'A Estrada',
            cleared: false,
            missions: [{ id: 'm1', order: 1, name: 'A Trilha', slots: 1, cleared: false }],
          },
          {
            id: 'cap-2',
            order: 2,
            name: 'A Serra',
            cleared: false,
            missions: [{ id: 'm3', order: 1, name: 'O Passo', slots: 2, cleared: false }],
          },
        ] as never,
        openChapterIds: [],
        selectedMissionId: 'm1',
      },
    }));
  });

  it('"← Missões" solta a missão escolhida e volta ao grid', () => {
    useBattleStore.getState().voltarParaMissoes();
    expect(useBattleStore.getState().campaign.selectedMissionId).toBeNull();
  });

  it('escolher uma aba de capítulo põe ESSE capítulo em foco', () => {
    useBattleStore.getState().escolherCapitulo('cap-2');
    const { campaign } = useBattleStore.getState();
    expect(capituloEmFoco(campaign.chapters, campaign.openChapterIds[0] ?? null, null)).toBe('cap-2');
  });
});
