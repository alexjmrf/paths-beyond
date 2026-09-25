import { RULES_VERSION, checkRulesVersion } from '@paths-beyond/core';
import { describe, expect, it } from 'vitest';

// M38 3/N (D54/D55) — os três banners são regra nova (regra 11): o soft pity muda QUAL rank
// sai, o limiar passou a garantir a N-ésima rolagem, e o pity é guardado por tipo. A mesma
// sequência de rolagens daria prêmios diferentes em 0.21.0 e aqui.
describe('RULES_VERSION — os banners do M38 3/N', () => {
  // A versão exata é afirmada pela fatia mais recente (M38 5/N, `core/tests/hero/combatProfile.test.ts`).
  it('subiu da 2/N: o cliente de 0.21.0 é recusado', () => {
    expect(RULES_VERSION).not.toBe('0.21.0');
    expect(checkRulesVersion('0.21.0')).not.toBeNull();
    expect(checkRulesVersion(RULES_VERSION)).toBeNull();
  });
});
