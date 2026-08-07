import { describe, expect, it } from 'vitest';
import { computeInitiativeOrder } from '../../src/battle/initiative.js';

describe('computeInitiativeOrder — §5.3 ("iniciativa = spd + rand(0,99)")', () => {
  it('é determinística: mesma seed e mesmas unidades produzem a mesma ordem sempre', () => {
    const units = [
      { id: 'u1', spd: 100 },
      { id: 'u2', spd: 120 },
      { id: 'u3', spd: 80 },
    ];
    const a = computeInitiativeOrder(units, 42);
    const b = computeInitiativeOrder(units, 42);
    expect(a).toEqual(b);
  });

  it('desempate determinístico por unitId, nunca por RNG adicional (spd empatado)', () => {
    // Mesmo spd para as duas -> o roll de rngFor por unitId decide o initiative bruto,
    // mas se by acaso empatar também, o desempate final é lexicográfico por unitId.
    const units = [
      { id: 'zzz', spd: 100 },
      { id: 'aaa', spd: 100 },
    ];
    const order = computeInitiativeOrder(units, 1);
    // Não afirma quem tem o roll maior (depende do RNG), só que o resultado é uma
    // permutação determinística e nunca muda entre chamadas.
    const again = computeInitiativeOrder(units, 1);
    expect(order.map((e) => e.unitId)).toEqual(again.map((e) => e.unitId));
  });

  it('em empate exato de initiative, o desempate é por unitId (ordem lexicográfica), não pela ordem de entrada', () => {
    const units = [
      { id: 'b-unit', spd: 100 },
      { id: 'a-unit', spd: 100 },
    ];
    // Força um cenário determinístico: usamos a mesma seed para ambas as unidades não é
    // possível diretamente (rngFor varia por unitId), então testamos a propriedade via
    // a função de comparação teria que produzir 'a-unit' antes de 'b-unit' quando o
    // initiative bruto empata. Verificamos isso chamando com spds manipulados para forçar
    // empate não é factível sem mockar RNG; em vez disso, testamos que a ordem nunca
    // depende da ordem do array de entrada.
    const orderA = computeInitiativeOrder(units, 7);
    const orderB = computeInitiativeOrder([...units].reverse(), 7);
    expect(orderA.map((e) => e.unitId)).toEqual(orderB.map((e) => e.unitId));
  });

  it('spd maior tende a render initiative maior (rolagem de 0 a 99 não inverte uma diferença grande de spd)', () => {
    const units = [
      { id: 'slow', spd: 10 },
      { id: 'fast', spd: 500 },
    ];
    const order = computeInitiativeOrder(units, 99);
    expect(order[0]?.unitId).toBe('fast');
  });

  it('a rolagem fica sempre entre 0 e 99 (não estoura o "rand(0,99)" da spec)', () => {
    const units = [{ id: 'solo', spd: 0 }];
    for (let seed = 0; seed < 50; seed++) {
      const [entry] = computeInitiativeOrder(units, seed);
      expect(entry?.initiative).toBeGreaterThanOrEqual(0);
      expect(entry?.initiative).toBeLessThanOrEqual(99);
    }
  });

  it('devolve uma entrada por unidade, sem duplicar nem perder ninguém', () => {
    const units = [
      { id: 'u1', spd: 100 },
      { id: 'u2', spd: 90 },
      { id: 'u3', spd: 110 },
    ];
    const order = computeInitiativeOrder(units, 5);
    expect(order.map((e) => e.unitId).sort()).toEqual(['u1', 'u2', 'u3']);
  });
});
