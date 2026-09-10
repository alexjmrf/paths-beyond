import { describe, expect, it } from 'vitest';
import { isWithinWindow, meetsCondition, type AccountSnapshot } from '../src/rewards/conditions.js';

// §10 (M18, 4/N) — o avaliador de condições, testado como função pura. Ele não precisa de
// servidor, banco nem catálogo, e é essa a razão de ele não morar dentro do handler.

const conta: AccountSnapshot = {
  chaptersCleared: 3,
  missionsCleared: 3,
  dungeonsCleared: 2,
  charactersOwned: 6,
  bestImprint: 1,
  bestAwakening: 4,
  elo: 1250,
};

describe('meetsCondition', () => {
  it('cumpre no limiar exato, e não um antes', () => {
    expect(meetsCondition({ kind: 'chaptersCleared', atLeast: 3 }, conta)).toBe(true);
    expect(meetsCondition({ kind: 'chaptersCleared', atLeast: 4 }, conta)).toBe(false);
  });

  it('avalia os seis kinds contra o campo certo do retrato', () => {
    // Um por um, e com um valor que só passaria se o campo lido for o correto — a troca de
    // dois campos entre si é o erro provável aqui, e comparar todos contra o mesmo número
    // deixaria essa troca invisível.
    expect(meetsCondition({ kind: 'chaptersCleared', atLeast: 3 }, conta)).toBe(true);
    expect(meetsCondition({ kind: 'dungeonsCleared', atLeast: 3 }, conta)).toBe(false);
    expect(meetsCondition({ kind: 'charactersOwned', atLeast: 6 }, conta)).toBe(true);
    expect(meetsCondition({ kind: 'heroImprint', atLeast: 2 }, conta)).toBe(false);
    expect(meetsCondition({ kind: 'heroAwakening', atLeast: 4 }, conta)).toBe(true);
    expect(meetsCondition({ kind: 'elo', atLeast: 1300 }, conta)).toBe(false);
  });

  it('uma conta zerada não cumpre nada', () => {
    const nova: AccountSnapshot = {
      chaptersCleared: 0,
      missionsCleared: 0,
      dungeonsCleared: 0,
      charactersOwned: 0,
      bestImprint: 0,
      bestAwakening: 0,
      elo: 0,
    };

    for (const kind of ['chaptersCleared', 'dungeonsCleared', 'charactersOwned', 'heroImprint', 'heroAwakening', 'elo'] as const) {
      expect(meetsCondition({ kind, atLeast: 1 }, nova), kind).toBe(false);
    }
  });
});

describe('isWithinWindow', () => {
  const janela = { startsAt: 100, endsAt: 200 };

  it('abre no instante inicial (inclusive) e fecha no final (exclusive)', () => {
    expect(isWithinWindow(janela, 99)).toBe(false);
    expect(isWithinWindow(janela, 100)).toBe(true);
    expect(isWithinWindow(janela, 199)).toBe(true);
    expect(isWithinWindow(janela, 200)).toBe(false);
  });

  it('duas janelas emendadas não se sobrepõem no instante de virada', () => {
    // É a razão de a janela ser meia-aberta: `[a,b]` e `[b,c]` autoradas para emendar
    // teriam um milissegundo em que os dois eventos valem, e o instante de virada é
    // exatamente o que alguém escreve ao querer emendar.
    const primeira = { startsAt: 100, endsAt: 200 };
    const segunda = { startsAt: 200, endsAt: 300 };

    expect(isWithinWindow(primeira, 200)).toBe(false);
    expect(isWithinWindow(segunda, 200)).toBe(true);
  });
});
