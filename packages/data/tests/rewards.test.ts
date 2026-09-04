import { describe, expect, it } from 'vitest';
import achievementSchema from '../schemas/achievements.schema.js';
import eventSchema from '../schemas/events.schema.js';

// §10 (M18, 4/N) — a forma das duas fontes novas da moeda premium.
//
// Como todo schema de `packages/data`, estes validam um arquivo ISOLADO. Que a condição
// seja avaliável e que os números fechem com a economia é validação cruzada, e vive em
// `packages/content`.

function achievement(overrides: Record<string, unknown> = {}) {
  return {
    id: 'achievement-teste',
    name: 'Conquista de Teste',
    description: 'Faça alguma coisa.',
    premium: 100,
    platformId: 'ACH_TESTE',
    condition: { kind: 'dungeonsCleared', atLeast: 1 },
    ...overrides,
  };
}

function evento(overrides: Record<string, unknown> = {}) {
  return {
    id: 'event-teste',
    name: 'Evento de Teste',
    description: 'Apareça.',
    premium: 100,
    startsAt: 1_000,
    endsAt: 2_000,
    ...overrides,
  };
}

describe('achievements.schema', () => {
  it('aceita uma conquista bem formada', () => {
    expect(achievementSchema.safeParse(achievement()).success).toBe(true);
  });

  it('aceita os seis kinds de condição, e nenhum outro', () => {
    const kinds = ['chaptersCleared', 'dungeonsCleared', 'charactersOwned', 'heroImprint', 'heroAwakening', 'elo'];
    for (const kind of kinds) {
      expect(achievementSchema.safeParse(achievement({ condition: { kind, atLeast: 1 } })).success, kind).toBe(true);
    }

    // `gold` é a ausência deliberada: o banco guarda SALDO, não acumulado, e uma conquista
    // de "junte ouro" sumiria ao gastar.
    expect(achievementSchema.safeParse(achievement({ condition: { kind: 'gold', atLeast: 1 } })).success).toBe(false);
  });

  it('recusa prêmio zero, negativo ou fracionário — fonte que não paga é decoração', () => {
    expect(achievementSchema.safeParse(achievement({ premium: 0 })).success).toBe(false);
    expect(achievementSchema.safeParse(achievement({ premium: -1 })).success).toBe(false);
    expect(achievementSchema.safeParse(achievement({ premium: 1.5 })).success).toBe(false);
  });

  it('recusa `atLeast` zero ou fracionário', () => {
    expect(achievementSchema.safeParse(achievement({ condition: { kind: 'elo', atLeast: 0 } })).success).toBe(false);
    expect(achievementSchema.safeParse(achievement({ condition: { kind: 'elo', atLeast: 2.5 } })).success).toBe(false);
  });

  it('recusa campo desconhecido, na conquista e dentro da condição', () => {
    expect(achievementSchema.safeParse(achievement({ repeatable: true })).success).toBe(false);
    expect(
      achievementSchema.safeParse(achievement({ condition: { kind: 'elo', atLeast: 1, heroId: 'x' } })).success,
    ).toBe(false);
  });

  it('recusa conquista sem condição', () => {
    const semCondicao = achievement();
    delete (semCondicao as Record<string, unknown>).condition;
    expect(achievementSchema.safeParse(semCondicao).success).toBe(false);
  });

  // §9.4 (M21, 3/N) — o ESPELHO na plataforma.
  //
  // O nome que a Steam conhece é digitado no backend de parceiro, e é ele que o
  // `SetAchievement` recebe. Derivá-lo do `id` seria adivinhar: uma letra fora do lugar
  // produz uma conquista que nunca dispara, sem erro em lugar nenhum. Por isso ele é
  // AUTORADO, e por isso é obrigatório — um achievement sem espelho é um achievement que
  // paga moeda e não aparece no perfil do jogador.
  it('exige `platformId`, e no formato que a plataforma aceita', () => {
    const semEspelho = achievement();
    delete (semEspelho as Record<string, unknown>).platformId;
    expect(achievementSchema.safeParse(semEspelho).success).toBe(false);

    // Maiúsculas, dígitos e `_`. O que a Steam recusa — minúscula, hífen, espaço, acento —
    // o schema recusa antes, porque lá o erro só apareceria com o jogo publicado.
    expect(achievementSchema.safeParse(achievement({ platformId: 'ACH_MAOS_A_OBRA' })).success).toBe(true);
    expect(achievementSchema.safeParse(achievement({ platformId: 'ACH_2' })).success).toBe(true);
    expect(achievementSchema.safeParse(achievement({ platformId: 'ach_minuscula' })).success).toBe(false);
    expect(achievementSchema.safeParse(achievement({ platformId: 'ACH-HIFEN' })).success).toBe(false);
    expect(achievementSchema.safeParse(achievement({ platformId: 'ACH ESPACO' })).success).toBe(false);
    expect(achievementSchema.safeParse(achievement({ platformId: 'ACH_VÍNCULO' })).success).toBe(false);
    expect(achievementSchema.safeParse(achievement({ platformId: '' })).success).toBe(false);
  });

  // O evento NÃO tem espelho, e a ausência é deliberada: evento é janela de tempo, e uma
  // conquista de plataforma não expira. Quem perdeu a janela não "perdeu uma conquista".
  it('o evento não tem `platformId` — conquista de plataforma não expira', () => {
    expect(eventSchema.safeParse(evento({ platformId: 'ACH_EVENTO' })).success).toBe(false);
  });
});

describe('events.schema', () => {
  it('aceita um evento bem formado, com e sem condição', () => {
    expect(eventSchema.safeParse(evento()).success).toBe(true);
    expect(eventSchema.safeParse(evento({ condition: { kind: 'charactersOwned', atLeast: 5 } })).success).toBe(true);
  });

  it('recusa janela invertida ou de duração zero — nunca seria reivindicável', () => {
    expect(eventSchema.safeParse(evento({ startsAt: 2_000, endsAt: 1_000 })).success).toBe(false);
    expect(eventSchema.safeParse(evento({ startsAt: 1_000, endsAt: 1_000 })).success).toBe(false);
  });

  it('recusa instante fracionário ou negativo — epoch ms é inteiro', () => {
    expect(eventSchema.safeParse(evento({ startsAt: 1.5 })).success).toBe(false);
    expect(eventSchema.safeParse(evento({ startsAt: -1 })).success).toBe(false);
  });

  it('recusa data em ISO 8601: o projeto compara instantes como número', () => {
    expect(eventSchema.safeParse(evento({ startsAt: '2026-01-01T00:00:00Z' })).success).toBe(false);
  });

  it('recusa campo desconhecido', () => {
    expect(eventSchema.safeParse(evento({ multiplier: 2 })).success).toBe(false);
  });
});
