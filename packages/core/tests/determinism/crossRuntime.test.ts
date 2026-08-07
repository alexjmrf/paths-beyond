// Critério de aceite do M1/M3 que faltava (§01-fundacoes-tecnicas.md §3.3):
// "rodar o mesmo replay 1000 vezes e comparar hash do estado final; e rodar em Node e em
// browser (headless) comparando o hash."
//
// ESTE ARQUIVO RODA DUAS VEZES, em configs diferentes:
//   - `vitest.config.ts`          → environment 'node'    (pnpm test)
//   - `vitest.browser.config.ts`  → Chromium, Firefox e WebKit reais (pnpm test:browser)
//
// Por que navegadores de verdade e não jsdom/happy-dom: jsdom e happy-dom rodam DENTRO do
// Node, no mesmo V8. Eles trocam `document` e `window`, não a engine de JavaScript. Um
// teste nesses ambientes daria confiança falsa — ele nunca detectaria uma divergência
// entre V8, SpiderMonkey e JavaScriptCore, que é exatamente o risco que este teste existe
// para cobrir. Se o hash bater nas três engines, o replay é portável de verdade.

import { describe, expect, it } from 'vitest';
import { simulate } from '../../src/battle/simulate.js';
import { canonicalize, fnv1a32, hashState } from '../../src/determinism/hash.js';
import { fpMul } from '../../src/math/fixed.js';
import { buildGoldenReplay } from './goldenReplay.js';

// Hash congelado do estado final do replay canônico.
//
// Mudou? Então uma regra de simulação mudou. As únicas reações corretas são:
//   (a) foi intencional → suba RULES_VERSION e atualize esta constante no mesmo commit;
//   (b) não foi intencional → você acabou de encontrar uma regressão. Não atualize o valor.
// Atualizar esta constante para "fazer o teste passar" desliga a única defesa que o
// projeto tem contra divergência silenciosa de PvP.
const GOLDEN_HASH = '6249029d';

describe('determinismo entre runtimes (§3.3)', () => {
  it('o replay canônico produz o hash congelado', () => {
    const hash = hashState(simulate(buildGoldenReplay()));
    expect(hash).toBe(GOLDEN_HASH);
  });

  it('1000 execuções do mesmo replay produzem hashes idênticos', () => {
    const first = hashState(simulate(buildGoldenReplay()));
    for (let i = 0; i < 1000; i++) {
      expect(hashState(simulate(buildGoldenReplay()))).toBe(first);
    }
  });

  it('o resultado é estrutural, não só textual: dois BattleResult independentes são iguais em profundidade', () => {
    expect(simulate(buildGoldenReplay())).toEqual(simulate(buildGoldenReplay()));
  });

  it('mudar a seed muda o hash (o teste não é vacuamente verdadeiro)', () => {
    const base = buildGoldenReplay();
    const other = { ...base, seed: base.seed + 1 };
    expect(hashState(simulate(other))).not.toBe(GOLDEN_HASH);
  });
});

describe('canonicalize — a serialização não pode depender da ordem de inserção', () => {
  it('objetos com as mesmas chaves em ordens diferentes serializam igual', () => {
    expect(canonicalize({ a: 1, b: 2 })).toBe(canonicalize({ b: 2, a: 1 }));
  });

  it('rejeita número não-finito (sinal de que uma regra vazou para float)', () => {
    expect(() => canonicalize({ dano: Number.POSITIVE_INFINITY })).toThrow(/não-finito/);
    expect(() => canonicalize({ dano: Number.NaN })).toThrow(/não-finito/);
  });

  it('rejeita não-inteiro: todo número de regra é inteiro em escala 1000 (§3.1)', () => {
    expect(() => canonicalize({ dano: 12.5 })).toThrow(/inteiro seguro/);
  });

  it('rejeita inteiro fora da faixa segura (perda silenciosa de precisão)', () => {
    expect(() => canonicalize({ dano: Number.MAX_SAFE_INTEGER + 2 })).toThrow(/inteiro seguro/);
  });

  it('array preserva ordem (posição importa, diferente de chave de objeto)', () => {
    expect(canonicalize([1, 2])).not.toBe(canonicalize([2, 1]));
  });
});

describe('fnv1a32 — aritmética de 32 bits, idêntica em qualquer engine', () => {
  it('vetores conhecidos do FNV-1a 32 bits', () => {
    expect(fnv1a32('')).toBe(0x811c9dc5);
    expect(fnv1a32('a')).toBe(0xe40c292c);
    expect(fnv1a32('foobar')).toBe(0xbf9cf968);
  });

  it('devolve sempre uint32 sem sinal', () => {
    for (const s of ['', 'a', 'zzzz', 'Paths Beyond', '\u00e7\u00e3o']) {
      const h = fnv1a32(s);
      expect(Number.isInteger(h)).toBe(true);
      expect(h).toBeGreaterThanOrEqual(0);
      expect(h).toBeLessThanOrEqual(0xffffffff);
    }
  });
});

describe('fpMul — limite de precisão (achado da auditoria)', () => {
  // `fpMul(a,b)` calcula `Math.trunc((a*b)/1000)`. O produto intermediário `a*b` é um
  // Number: acima de 2^53 ele perde precisão SILENCIOSAMENTE, e o resultado deixa de ser
  // reprodutível de forma confiável. Estes testes documentam onde fica esse teto para que
  // ninguém empilhe multiplicadores até atravessá-lo sem perceber.
  it('é exato dentro da faixa realista de combate', () => {
    expect(fpMul(1_000_000, 1500)).toBe(1_500_000);
    expect(fpMul(999_999, 1001)).toBe(1_000_998);
  });

  it('o produto intermediário fica muito abaixo de 2^53 com valores plausíveis de combate', () => {
    // Pior caso realista: ATK altíssimo × multiplicador de skill altíssimo.
    const atkMax = 50_000;      // muito acima de qualquer build viável
    const multMax = 5000;       // 500%
    expect(atkMax * multMax).toBeLessThan(Number.MAX_SAFE_INTEGER);
  });

  it('DOCUMENTADO: acima de 2^53 o produto perde precisão — não empilhe multiplicadores até aqui', () => {
    const huge = 2 ** 45;
    const produto = huge * 100_000;
    expect(produto).toBeGreaterThan(Number.MAX_SAFE_INTEGER);
    expect(Number.isSafeInteger(produto)).toBe(false);
  });
});
