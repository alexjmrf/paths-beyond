import { describe, expect, it } from 'vitest';
import bannerSchema from '../schemas/banners.schema.js';

// §10 (M18, 2/N) — o schema do BANNER de invocação.
//
// O que este arquivo protege é a forma do dado, e só isso: que o pool exista, que o peso
// seja inteiro e que o pity seja declarado. A conformidade do banner com o ELENCO — pool
// só de adquiríveis, fragmento que existe de verdade — é validação cruzada e vive em
// `packages/content`, como toda a do projeto: um schema de `packages/data` valida um
// arquivo isolado, sem conhecer os outros.
//
// `.strict()` pelo mesmo motivo da árvore de coluna de M17 1/N e do inimigo de M17 3/N:
// um campo que o motor não lê tem de falhar alto, e não ser ignorado em silêncio. Uma
// `rate` autorada em ponto flutuante é o erro provável aqui, e ela não pode simplesmente
// não fazer nada.

function banner(overrides: Record<string, unknown> = {}) {
  return {
    id: 'banner-elenco',
    name: 'Invocação do Elenco',
    pityThreshold: 10,
    pool: [
      { characterId: 'ally-mensageira', weight: 1, fragmentMaterialId: 'material-fragmento-ally-mensageira' },
      { characterId: 'ally-couracado', weight: 1, fragmentMaterialId: 'material-fragmento-ally-couracado' },
    ],
    ...overrides,
  };
}

describe('banners.schema', () => {
  it('aceita um banner bem formado', () => {
    expect(bannerSchema.safeParse(banner()).success).toBe(true);
  });

  it('recusa pool vazio', () => {
    expect(bannerSchema.safeParse(banner({ pool: [] })).success).toBe(false);
  });

  it('recusa peso fracionário — o sorteio é inteiro (regra 2)', () => {
    const comFloat = banner({
      pool: [{ characterId: 'ally-mensageira', weight: 0.2, fragmentMaterialId: 'material-fragmento-ally-mensageira' }],
    });

    expect(bannerSchema.safeParse(comFloat).success).toBe(false);
  });

  it('recusa peso zero ou negativo', () => {
    const zero = banner({
      pool: [{ characterId: 'ally-mensageira', weight: 0, fragmentMaterialId: 'material-fragmento-ally-mensageira' }],
    });
    const negativo = banner({
      pool: [{ characterId: 'ally-mensageira', weight: -1, fragmentMaterialId: 'material-fragmento-ally-mensageira' }],
    });

    expect(bannerSchema.safeParse(zero).success).toBe(false);
    expect(bannerSchema.safeParse(negativo).success).toBe(false);
  });

  it('recusa pityThreshold ausente, zero ou fracionário', () => {
    expect(bannerSchema.safeParse(banner({ pityThreshold: undefined })).success).toBe(false);
    expect(bannerSchema.safeParse(banner({ pityThreshold: 0 })).success).toBe(false);
    expect(bannerSchema.safeParse(banner({ pityThreshold: 2.5 })).success).toBe(false);
  });

  it('recusa entrada sem fragmento: a duplicata não teria o que pagar', () => {
    const sem = banner({ pool: [{ characterId: 'ally-mensageira', weight: 1 }] });

    expect(bannerSchema.safeParse(sem).success).toBe(false);
  });

  it('recusa uma `rate` em ponto flutuante — a forma que alguém tentaria escrever', () => {
    // `.strict()` é o que faz isto falhar. Sem ele o campo seria ignorado e o autor teria
    // um banner cujas taxas declaradas não significam nada.
    const comRate = banner({
      pool: [
        {
          characterId: 'ally-mensageira',
          weight: 1,
          rate: 0.02,
          fragmentMaterialId: 'material-fragmento-ally-mensageira',
        },
      ],
    });

    expect(bannerSchema.safeParse(comRate).success).toBe(false);
  });

  it('recusa o mesmo personagem duas vezes no pool', () => {
    const repetido = banner({
      pool: [
        { characterId: 'ally-mensageira', weight: 1, fragmentMaterialId: 'material-fragmento-ally-mensageira' },
        { characterId: 'ally-mensageira', weight: 2, fragmentMaterialId: 'material-fragmento-ally-mensageira' },
      ],
    });

    expect(bannerSchema.safeParse(repetido).success).toBe(false);
  });
});
