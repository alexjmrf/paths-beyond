import { describe, expect, it } from 'vitest';
import { resolveEnergy, spendEnergy } from '../../src/economy/energy.js';
import type { EnergyRules, EnergyState } from '../../src/economy/types.js';

// M14, sub-sessão 1/N — §10: "Energia de conta limita o farm diário."
//
// A spec dá essa linha e nada mais. Decisão do usuário: regeneração CONTÍNUA, +1 a cada
// intervalo, até um teto de conta. Os dois números moram em `packages/data` (regra 4) e
// chegam aqui por parâmetro, junto com o instante — `packages/core` não lê relógio
// (regra 1), e é justamente isso que faz este teste ser determinístico em vez de depender
// de esperar o tempo passar.

const MINUTO = 60_000;

const REGRAS: EnergyRules = { max: 10, refillIntervalMs: 6 * MINUTO };

// Instante-base arbitrário mas fixo: o teste nunca chama `Date.now()`.
const T0 = 1_700_000_000_000;

describe('resolveEnergy', () => {
  it('não regenera nada antes de completar um intervalo', () => {
    const estado: EnergyState = { stored: 3, asOfMs: T0 };
    expect(resolveEnergy(estado, T0 + 6 * MINUTO - 1, REGRAS).stored).toBe(3);
  });

  it('regenera 1 por intervalo completo', () => {
    const estado: EnergyState = { stored: 3, asOfMs: T0 };
    expect(resolveEnergy(estado, T0 + 6 * MINUTO, REGRAS).stored).toBe(4);
    expect(resolveEnergy(estado, T0 + 18 * MINUTO, REGRAS).stored).toBe(6);
  });

  it('a fração de intervalo não se perde: fica creditada no próximo cálculo', () => {
    const estado: EnergyState = { stored: 0, asOfMs: T0 };
    // 7 minutos = 1 de energia + 1 minuto de sobra.
    const depois = resolveEnergy(estado, T0 + 7 * MINUTO, REGRAS);
    expect(depois.stored).toBe(1);
    // Mais 5 minutos fecham o segundo intervalo (1 + 5 = 6), então tem que virar 2.
    expect(resolveEnergy(depois, T0 + 12 * MINUTO, REGRAS).stored).toBe(2);
  });

  it('para no teto e não acumula além dele por mais tempo que passe', () => {
    const estado: EnergyState = { stored: 9, asOfMs: T0 };
    expect(resolveEnergy(estado, T0 + 600 * MINUTO, REGRAS).stored).toBe(10);
  });

  it('já no teto, o relógio de regeneração acompanha o agora (não guarda crédito)', () => {
    const cheio: EnergyState = { stored: 10, asOfMs: T0 };
    const depoisDeUmDia = resolveEnergy(cheio, T0 + 1440 * MINUTO, REGRAS);
    expect(depoisDeUmDia.stored).toBe(10);
    expect(depoisDeUmDia.asOfMs).toBe(T0 + 1440 * MINUTO);

    // Gastar 4 logo em seguida não pode "devolver" o dia parado no teto.
    const gasto = spendEnergy(depoisDeUmDia, T0 + 1440 * MINUTO, REGRAS, 4);
    expect(gasto.ok).toBe(true);
    expect(gasto.energy.stored).toBe(6);
    expect(resolveEnergy(gasto.energy, T0 + 1440 * MINUTO + 6 * MINUTO, REGRAS).stored).toBe(7);
  });

  it('relógio andando para trás não cria nem destrói energia', () => {
    const estado: EnergyState = { stored: 4, asOfMs: T0 };
    const resolvido = resolveEnergy(estado, T0 - 999 * MINUTO, REGRAS);
    expect(resolvido).toEqual(estado);
  });

  it('é idempotente: resolver duas vezes no mesmo instante dá o mesmo estado', () => {
    const estado: EnergyState = { stored: 2, asOfMs: T0 };
    const uma = resolveEnergy(estado, T0 + 40 * MINUTO, REGRAS);
    const duas = resolveEnergy(uma, T0 + 40 * MINUTO, REGRAS);
    expect(duas).toEqual(uma);
  });
});

describe('spendEnergy', () => {
  it('gasta a partir da energia JÁ regenerada, não da guardada', () => {
    const estado: EnergyState = { stored: 0, asOfMs: T0 };
    const gasto = spendEnergy(estado, T0 + 30 * MINUTO, REGRAS, 5);
    expect(gasto.ok).toBe(true);
    expect(gasto.energy.stored).toBe(0);
  });

  it('rejeita quando falta energia, e não muda o saldo', () => {
    const estado: EnergyState = { stored: 2, asOfMs: T0 };
    const gasto = spendEnergy(estado, T0, REGRAS, 3);
    expect(gasto.ok).toBe(false);
    expect(gasto.energy.stored).toBe(2);
    if (!gasto.ok) expect(gasto.reason).toContain('energia');
  });

  it('rejeita custo não positivo em vez de virar fonte de energia', () => {
    const estado: EnergyState = { stored: 5, asOfMs: T0 };
    expect(spendEnergy(estado, T0, REGRAS, 0).ok).toBe(false);
    expect(spendEnergy(estado, T0, REGRAS, -3).ok).toBe(false);
    expect(spendEnergy(estado, T0, REGRAS, -3).energy.stored).toBe(5);
  });

  it('gastar abaixo do teto faz o relógio de regeneração voltar a correr', () => {
    const cheio: EnergyState = { stored: 10, asOfMs: T0 };
    const gasto = spendEnergy(cheio, T0, REGRAS, 10);
    expect(gasto.energy.stored).toBe(0);
    expect(resolveEnergy(gasto.energy, T0 + 6 * MINUTO, REGRAS).stored).toBe(1);
  });
});
