import { beforeEach, describe, expect, it } from 'vitest';
import { proximaMissao, useBattleStore } from '../src/store/battleStore.js';

// M32 — depois de VENCER, a próxima ação é a missão seguinte, não a que acabou de ser limpa.
//
// Visto na tela com sessão de verdade: vencida "A Trilha" e confirmada pelo servidor, "Voltar
// aos capítulos" devolvia o hub com a missão 1 ainda SELECIONADA — e o botão azul dizia
// "Entrar na missão" apontando para a missão limpa, enquanto a 2 ficava sem destaque
// (`proximaMissao` só vira `acao-principal` quando nada está selecionado). O jogador que
// seguisse o botão jogaria a mesma missão de novo.
//
// A regra: sair de uma missão que ficou LIMPA solta a seleção; sair de uma que não ficou
// (abandonada, derrota) mantém — ele provavelmente quer tentar de novo.

const CAPITULOS = (limpa1: boolean) => [
  {
    id: 'chapter-1',
    order: 1,
    name: 'Capítulo 1',
    cleared: false,
    missions: [
      { id: 'encounter-campanha-1', order: 1, name: 'Missão 1', cleared: limpa1, slots: 1 },
      { id: 'encounter-campanha-2', order: 2, name: 'Missão 2', cleared: false, slots: 2 },
    ],
  },
];

const TICKET = { chapterId: 'encounter-campanha-1' } as never;

beforeEach(() => {
  useBattleStore.setState((s) => ({
    campaign: { ...s.campaign, ticket: TICKET, selectedMissionId: 'encounter-campanha-1', error: null, status: null },
  }));
});

describe('a seleção da missão ao sair da batalha (M32)', () => {
  it('missão limpa: a seleção solta e a próxima ação passa a ser a missão 2', () => {
    useBattleStore.setState((s) => ({ campaign: { ...s.campaign, chapters: CAPITULOS(true) } }));

    useBattleStore.getState().exitCampaign();
    const { campaign } = useBattleStore.getState();

    expect(campaign.ticket).toBeNull();
    expect(campaign.selectedMissionId).toBeNull();
    expect(proximaMissao(campaign.chapters)).toBe('encounter-campanha-2');
  });

  it('missão NÃO limpa (abandonada ou perdida): a seleção fica, para tentar de novo', () => {
    useBattleStore.setState((s) => ({ campaign: { ...s.campaign, chapters: CAPITULOS(false) } }));

    useBattleStore.getState().exitCampaign();
    const { campaign } = useBattleStore.getState();

    expect(campaign.ticket).toBeNull();
    expect(campaign.selectedMissionId).toBe('encounter-campanha-1');
  });
});
