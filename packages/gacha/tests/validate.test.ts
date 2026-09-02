import { describe, expect, it } from 'vitest';
import { rateOf, validateBanner, type BannerDef } from '../src/index.js';

const adquiriveis = ['char-a', 'char-b', 'char-c'];

const bannerSao: BannerDef = {
  id: 'banner-teste',
  pityThreshold: 5,
  pool: [
    { characterId: 'char-a', weight: 1, fragmentMaterialId: 'frag-a' },
    { characterId: 'char-b', weight: 1, fragmentMaterialId: 'frag-b' },
    { characterId: 'char-c', weight: 2, fragmentMaterialId: 'frag-c' },
  ],
};

function codes(banner: BannerDef): readonly string[] {
  return validateBanner(banner, { acquirableCharacterIds: adquiriveis }).map((issue) => issue.code);
}

describe('validateBanner', () => {
  it('um banner são não tem nenhum problema', () => {
    expect(validateBanner(bannerSao, { acquirableCharacterIds: adquiriveis })).toEqual([]);
  });

  it('recusa pool vazio', () => {
    expect(codes({ ...bannerSao, pool: [] })).toContain('pool-vazio');
  });

  it('recusa peso zero, negativo ou fracionário — o sorteio é inteiro (regra 2)', () => {
    const zero = { ...bannerSao, pool: [{ characterId: 'char-a', weight: 0, fragmentMaterialId: 'frag-a' }] };
    const negativo = { ...bannerSao, pool: [{ characterId: 'char-a', weight: -1, fragmentMaterialId: 'frag-a' }] };
    const fracionario = { ...bannerSao, pool: [{ characterId: 'char-a', weight: 1.5, fragmentMaterialId: 'frag-a' }] };

    expect(codes(zero)).toContain('peso-invalido');
    expect(codes(negativo)).toContain('peso-invalido');
    expect(codes(fracionario)).toContain('peso-invalido');
  });

  it('recusa o mesmo personagem duas vezes no pool', () => {
    const repetido = {
      ...bannerSao,
      pool: [
        { characterId: 'char-a', weight: 1, fragmentMaterialId: 'frag-a' },
        { characterId: 'char-a', weight: 1, fragmentMaterialId: 'frag-a' },
      ],
    };

    expect(codes(repetido)).toContain('personagem-repetido');
  });

  it('recusa personagem de NÚCLEO DE HISTÓRIA no pool — é o erro que D14 torna possível', () => {
    // Um personagem garantido dentro do banner seria uma rolagem que nunca pode dar
    // personagem novo: ela nasceria duplicata para todo jogador.
    const comNucleo = {
      ...bannerSao,
      pool: [
        ...bannerSao.pool,
        { characterId: 'hero-jogador', weight: 1, fragmentMaterialId: 'frag-hero' },
      ],
    };

    expect(codes(comNucleo)).toContain('personagem-nao-adquirivel');
  });

  it('recusa limiar de pity ausente, zero ou fracionário', () => {
    expect(codes({ ...bannerSao, pityThreshold: 0 })).toContain('pity-invalido');
    expect(codes({ ...bannerSao, pityThreshold: -3 })).toContain('pity-invalido');
    expect(codes({ ...bannerSao, pityThreshold: 2.5 })).toContain('pity-invalido');
  });

  it('recusa entrada sem fragmento: sem ele a duplicata não teria o que pagar', () => {
    const semFragmento = {
      ...bannerSao,
      pool: [{ characterId: 'char-a', weight: 1, fragmentMaterialId: '' }],
    };

    expect(codes(semFragmento)).toContain('fragmento-ausente');
  });

  it('a mensagem de cada problema diz qual entrada está errada', () => {
    const issues = validateBanner(
      { ...bannerSao, pool: [{ characterId: 'char-a', weight: 0, fragmentMaterialId: 'frag-a' }] },
      { acquirableCharacterIds: adquiriveis },
    );

    expect(issues[0]?.message).toContain('char-a');
  });
});

describe('rateOf', () => {
  it('devolve a chance em escala 1000 (regra 2: nenhum float em cálculo de regra)', () => {
    // Pesos 1/1/2 sobre total 4: 250, 250 e 500 por mil.
    expect(rateOf(bannerSao, 'char-a')).toBe(250);
    expect(rateOf(bannerSao, 'char-b')).toBe(250);
    expect(rateOf(bannerSao, 'char-c')).toBe(500);
  });

  it('soma exatamente 1000 quando os pesos dividem o total', () => {
    const total = bannerSao.pool.reduce((sum, entry) => sum + rateOf(bannerSao, entry.characterId), 0);

    expect(total).toBe(1000);
  });

  it('personagem fora do pool tem chance zero', () => {
    expect(rateOf(bannerSao, 'char-inexistente')).toBe(0);
  });
});
