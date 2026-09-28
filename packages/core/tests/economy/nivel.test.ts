import { describe, expect, it } from 'vitest';
import { MAX_LEVEL, aplicarExp, expDaInstancia, type CurvaDeExp } from '../../src/economy/nivel.js';
import type { Hero } from '../../src/hero/types.js';

// M39 1/N — A SUBIDA DE NÍVEL (decisões do usuário, 2026-09-26).
//
// Até aqui o herói nascia no nível 10 e ficava nele: o `exp` era sorteado no drop da masmorra e
// descartado. Agora:
// - o exp vem de QUALQUER instância PvE (campanha, masmorra, evento), e é a soma dos inimigos
//   dela — cada inimigo vale pelo NÍVEL dele (quantidade e nível dos inimigos variam o ganho);
// - os Tomos de Experiência são o jeito mais eficiente (a rota de usar tomo usa esta mesma
//   `aplicarExp`);
// - a curva é dado (`economy.json`), e a subida vai até o nível 60, o tamanho da `statCurve`.

// Curva de teste: 100 exp do 1 para o 2, 200 do 2 para o 3, e assim por diante.
const curva: CurvaDeExp = { expParaProximo: Array.from({ length: MAX_LEVEL - 1 }, (_, i) => (i + 1) * 100) };

function heroi(level: number, exp = 0): Hero {
  return {
    id: 'h1',
    characterId: 'c1',
    classId: 'class-x',
    level,
    exp,
    awakening: 0,
    imprint: 0,
    talents: {},
    equipment: { weapon: null, helmet: null, armor: null, necklace: null, ring: null, boots: null },
    weaponType: 'sword',
    duelSkills: [],
    mapSkills: [],
    tacticsScript: [],
  } as Hero;
}

describe('aplicarExp', () => {
  it('abaixo do limiar, só acumula', () => {
    const r = aplicarExp(heroi(1), 60, curva);
    expect(r.hero.level).toBe(1);
    expect(r.hero.exp).toBe(60);
    expect(r.niveisGanhos).toBe(0);
  });

  it('bater o limiar exato sobe um nível e zera a barra', () => {
    const r = aplicarExp(heroi(1, 60), 40, curva);
    expect(r.hero.level).toBe(2);
    expect(r.hero.exp).toBe(0);
    expect(r.niveisGanhos).toBe(1);
  });

  it('sobe VÁRIOS níveis de uma vez e guarda a sobra', () => {
    // 1→2 custa 100, 2→3 custa 200: 350 sobe dois níveis e sobram 50.
    const r = aplicarExp(heroi(1), 350, curva);
    expect(r.hero.level).toBe(3);
    expect(r.hero.exp).toBe(50);
    expect(r.niveisGanhos).toBe(2);
  });

  it('para no nível máximo, e o exp além dele é descartado', () => {
    const r = aplicarExp(heroi(MAX_LEVEL - 1), 10_000_000, curva);
    expect(r.hero.level).toBe(MAX_LEVEL);
    expect(r.hero.exp).toBe(0);
    expect(r.niveisGanhos).toBe(1);
    expect(aplicarExp(heroi(MAX_LEVEL), 500, curva).hero).toMatchObject({ level: MAX_LEVEL, exp: 0 });
  });

  it('exp zero ou negativo não muda nada', () => {
    const h = heroi(5, 30);
    expect(aplicarExp(h, 0, curva)).toEqual({ hero: h, niveisGanhos: 0 });
    expect(aplicarExp(h, -10, curva)).toEqual({ hero: h, niveisGanhos: 0 });
  });

  it('curva que não cobre o nível falha alto — dado incompleto não vira herói travado em silêncio', () => {
    expect(() => aplicarExp(heroi(1), 500, { expParaProximo: [100] })).toThrow(/curva/);
  });

  it('é pura: não muta o herói recebido', () => {
    const h = heroi(1, 10);
    aplicarExp(h, 500, curva);
    expect(h).toMatchObject({ level: 1, exp: 10 });
  });

  it('é determinística: mesma entrada, mesmo resultado, duas vezes', () => {
    expect(JSON.stringify(aplicarExp(heroi(3, 7), 1234, curva))).toBe(JSON.stringify(aplicarExp(heroi(3, 7), 1234, curva)));
  });
});

describe('expDaInstancia', () => {
  it('é a soma dos inimigos, cada um pelo nível dele', () => {
    expect(expDaInstancia([{ level: 10 }, { level: 12 }], 20)).toBe(440);
  });

  it('mais inimigos, ou inimigos mais fortes, dão mais exp', () => {
    expect(expDaInstancia([{ level: 10 }, { level: 10 }, { level: 10 }], 20)).toBeGreaterThan(expDaInstancia([{ level: 10 }], 20));
    expect(expDaInstancia([{ level: 20 }], 20)).toBeGreaterThan(expDaInstancia([{ level: 10 }], 20));
  });

  it('instância sem inimigo não dá exp', () => {
    expect(expDaInstancia([], 20)).toBe(0);
  });
});

// M39 1/N — a subida de nível é regra: o mesmo herói, depois de uma vitória, tem outro stat
// sheet. RULES_VERSION sobe.
describe('RULES_VERSION — a subida de nível', () => {
  // A versão exata é afirmada pela fatia mais recente (M39 2/N: `tests/soul/soul.test.ts`);
  // aqui fica o que a 1/N garantiu: o cliente de antes da subida de nível não volta.
  it('subiu do M38: o cliente de 0.23.0 é recusado', async () => {
    const { RULES_VERSION } = await import('../../src/rulesVersion.js');
    const { checkRulesVersion } = await import('../../src/rulesVersionCompat.js');
    expect(RULES_VERSION).not.toBe('0.23.0');
    expect(checkRulesVersion('0.23.0')).not.toBeNull();
  });
});
