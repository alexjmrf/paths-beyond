import { describe, expect, it } from 'vitest';
import { fpDiv } from '@paths-beyond/core';
import { rateOf, validateBanner, type BannerDef } from '../src/index.js';
import { generico, rotativoDeArtefato, rotativoDePersonagem } from './fixtures.js';

const adquiriveis = ['char-a', 'char-b', 'char-c'];

const bannerSao: BannerDef = {
  id: 'banner-teste',
  kind: 'generic',
  choiceEvery: 180,
  softPity: { baseRate: 6, softStart: 30, step: 60 },
  pityThresholds: { adventurer: 5, hero: 40 },
  pool: [
    { characterId: 'char-a', rank: 'adventurer', weight: 1, fragmentMaterialId: 'frag-a' },
    { characterId: 'char-b', rank: 'hero', weight: 1, fragmentMaterialId: 'frag-b' },
    { characterId: 'char-c', rank: 'hero', weight: 2, fragmentMaterialId: 'frag-c' },
  ],
};

const contexto = { acquirableCharacterIds: adquiriveis, knownArtifactIds: ['art-a', 'art-h'] };

function codes(banner: BannerDef): readonly string[] {
  return validateBanner(banner, contexto).map((issue) => issue.code);
}

describe('validateBanner', () => {
  it('um banner são não tem nenhum problema', () => {
    expect(validateBanner(bannerSao, contexto)).toEqual([]);
  });

  it('recusa pool vazio', () => {
    expect(codes({ ...bannerSao, pool: [] })).toContain('pool-vazio');
  });

  it('recusa peso zero, negativo ou fracionário — o sorteio é inteiro (regra 2)', () => {
    const entrada = (weight: number) => ({
      ...bannerSao,
      pool: [
        { characterId: 'char-a', rank: 'adventurer' as const, weight, fragmentMaterialId: 'frag-a' },
        { characterId: 'char-b', rank: 'hero' as const, weight: 1, fragmentMaterialId: 'frag-b' },
      ],
    });

    expect(codes(entrada(0))).toContain('peso-invalido');
    expect(codes(entrada(-1))).toContain('peso-invalido');
    expect(codes(entrada(1.5))).toContain('peso-invalido');
  });

  it('recusa o mesmo personagem duas vezes no pool', () => {
    const repetido = {
      ...bannerSao,
      pool: [
        { characterId: 'char-a', rank: 'adventurer' as const, weight: 1, fragmentMaterialId: 'frag-a' },
        { characterId: 'char-a', rank: 'adventurer' as const, weight: 1, fragmentMaterialId: 'frag-a' },
        { characterId: 'char-b', rank: 'hero' as const, weight: 1, fragmentMaterialId: 'frag-b' },
      ],
    };

    expect(codes(repetido)).toContain('entrada-repetida');
  });

  it('recusa personagem de NÚCLEO DE HISTÓRIA no pool — é o erro que D14 torna possível', () => {
    // Um personagem garantido dentro do banner seria uma rolagem que nunca pode dar
    // personagem novo: ela nasceria duplicata para todo jogador.
    const comNucleo = {
      ...bannerSao,
      pool: [
        ...bannerSao.pool,
        { characterId: 'hero-jogador', rank: 'hero' as const, weight: 1, fragmentMaterialId: 'frag-hero' },
      ],
    };

    expect(codes(comNucleo)).toContain('personagem-nao-adquirivel');
  });

  it('recusa limiar de pity zero, negativo ou fracionário — nos DOIS ranks (D50)', () => {
    expect(codes({ ...bannerSao, pityThresholds: { adventurer: 0, hero: 40 } })).toContain('pity-invalido');
    expect(codes({ ...bannerSao, pityThresholds: { adventurer: -3, hero: 40 } })).toContain('pity-invalido');
    expect(codes({ ...bannerSao, pityThresholds: { adventurer: 2.5, hero: 40 } })).toContain('pity-invalido');
    expect(codes({ ...bannerSao, pityThresholds: { adventurer: 5, hero: 0 } })).toContain('pity-invalido');
    expect(codes({ ...bannerSao, pityThresholds: { adventurer: 5, hero: 1.5 } })).toContain('pity-invalido');
  });

  it('a mensagem do limiar diz QUAL rank está errado — dois números, duas mensagens', () => {
    const issues = validateBanner(
      { ...bannerSao, pityThresholds: { adventurer: 0, hero: 0 } },
      contexto,
    );

    expect(issues.filter((i) => i.code === 'pity-invalido')).toHaveLength(2);
    expect(issues.some((i) => i.message.includes('adventurer'))).toBe(true);
    expect(issues.some((i) => i.message.includes('hero'))).toBe(true);
  });

  it('recusa BANNER SÓ DE `Adventurer` — o tier de baixo não tem banner próprio (D49 §1)', () => {
    // Critério de aceite do M37, e é forma e não varredura: o `Adventurer` sai do banner de
    // `Hero` como o que se tira quando o `Hero` desejado não vem. Um banner sem `Hero` seria
    // um banner cuja garantia cara não tem o que pagar.
    const soAdventurer = {
      ...bannerSao,
      pool: [
        { characterId: 'char-a', rank: 'adventurer' as const, weight: 1, fragmentMaterialId: 'frag-a' },
        { characterId: 'char-b', rank: 'adventurer' as const, weight: 1, fragmentMaterialId: 'frag-b' },
      ],
    };

    expect(codes(soAdventurer)).toContain('banner-sem-hero');
  });

  // M38 3/N (D54) — o contrário também deixou de valer: com a rampa decidindo o rank, a
  // rolagem que não sai `Hero` precisa ter o que entregar. O `Adventurer` é o preenchimento.
  it('recusa banner só de `Hero` — a rolagem que não sai `Hero` não teria o que entregar (D54)', () => {
    const soHero = {
      ...bannerSao,
      pool: [
        { characterId: 'char-b', rank: 'hero' as const, weight: 1, fragmentMaterialId: 'frag-b' },
        { characterId: 'char-c', rank: 'hero' as const, weight: 1, fragmentMaterialId: 'frag-c' },
      ],
    };

    expect(codes(soHero)).not.toContain('banner-sem-hero');
    expect(codes(soHero)).toContain('banner-sem-preenchimento');
  });

  it('recusa entrada sem fragmento: sem ele a duplicata não teria o que pagar', () => {
    const semFragmento = {
      ...bannerSao,
      pool: [
        { characterId: 'char-a', rank: 'adventurer' as const, weight: 1, fragmentMaterialId: '' },
        { characterId: 'char-b', rank: 'hero' as const, weight: 1, fragmentMaterialId: 'frag-b' },
      ],
    };

    expect(codes(semFragmento)).toContain('fragmento-ausente');
  });

  it('a mensagem de cada problema diz qual entrada está errada', () => {
    const issues = validateBanner(
      {
        ...bannerSao,
        pool: [
          { characterId: 'char-a', rank: 'adventurer', weight: 0, fragmentMaterialId: 'frag-a' },
          { characterId: 'char-b', rank: 'hero', weight: 1, fragmentMaterialId: 'frag-b' },
        ],
      },
      contexto,
    );

    expect(issues[0]?.message).toContain('char-a');
  });
});

// M38 3/N (D54) — desde a curva de soft pity, o peso decide QUEM sai dentro do rank que a curva
// escolheu, e não mais qual rank sai. A chance que `rateOf` devolve passou a ser DENTRO DO RANK.
describe('rateOf', () => {
  it('devolve a chance dentro do rank, em escala 1000 (regra 2: nenhum float em cálculo de regra)', () => {
    // `char-a` é o único `adventurer`: 1000. Os dois `hero` pesam 1 e 2... sobre 3.
    expect(rateOf(bannerSao, 'char-a')).toBe(1000);
    expect(rateOf(bannerSao, 'char-b')).toBe(fpDiv(1, 3));
    expect(rateOf(bannerSao, 'char-c')).toBe(fpDiv(2, 3));
  });

  it('soma exatamente 1000 dentro de um rank quando os pesos dividem o total', () => {
    const par: BannerDef = {
      ...bannerSao,
      pool: [
        { characterId: 'char-a', rank: 'adventurer', weight: 1, fragmentMaterialId: 'frag-a' },
        { characterId: 'char-b', rank: 'hero', weight: 1, fragmentMaterialId: 'frag-b' },
        { artifactId: 'art-h', rank: 'hero', weight: 3, fragmentMaterialId: 'frag-art-h' },
      ],
    };

    expect(rateOf(par, 'char-b') + rateOf(par, 'art-h')).toBe(1000);
    expect(rateOf(par, 'art-h')).toBe(750);
  });

  it('id fora do pool tem chance zero', () => {
    expect(rateOf(bannerSao, 'char-inexistente')).toBe(0);
  });
});

// M38 3/N (D54/D55) — o que cada TIPO de banner exige de quem o autora.
describe('validateBanner, por tipo', () => {
  const ctx = {
    acquirableCharacterIds: ['char-h', 'char-g', 'char-a', 'char-b', 'char-x'],
    knownArtifactIds: ['art-h', 'art-g', 'art-a', 'art-b', 'art-x'],
  };
  const codigos = (b: BannerDef) => validateBanner(b, ctx).map((i) => i.code);

  it('os três bancos de teste com os números de D54 são sãos', () => {
    expect(validateBanner(rotativoDePersonagem, ctx)).toEqual([]);
    expect(validateBanner(rotativoDeArtefato, ctx)).toEqual([]);
    expect(validateBanner(generico, ctx)).toEqual([]);
  });

  it('rotativo de personagem: o destaque tem de estar no pool como `hero`', () => {
    expect(codigos({ ...rotativoDePersonagem, featuredCharacterId: 'char-x' })).toContain('destaque-fora-do-pool');
    expect(codigos({ ...rotativoDePersonagem, featuredCharacterId: 'char-a' })).toContain('destaque-fora-do-pool');
  });

  it('rotativo de personagem: nenhum OUTRO `hero` no pool — não existe 50/50 (D54)', () => {
    const comOutro = {
      ...rotativoDePersonagem,
      pool: [...rotativoDePersonagem.pool, { characterId: 'char-g', rank: 'hero' as const, weight: 1, fragmentMaterialId: 'frag-g' }],
    };
    expect(codigos(comOutro)).toContain('rotativo-com-outro-hero');
  });

  it('rotativo de personagem não oferece artefato, e o de artefato não oferece personagem', () => {
    const comArtefato = {
      ...rotativoDePersonagem,
      pool: [...rotativoDePersonagem.pool, { artifactId: 'art-a', rank: 'adventurer' as const, weight: 1, fragmentMaterialId: 'f' }],
    };
    const comPersonagem = {
      ...rotativoDeArtefato,
      pool: [...rotativoDeArtefato.pool, { characterId: 'char-a', rank: 'adventurer' as const, weight: 1, fragmentMaterialId: 'f' }],
    };
    expect(codigos(comArtefato)).toContain('entrada-de-tipo-errado');
    expect(codigos(comPersonagem)).toContain('entrada-de-tipo-errado');
  });

  it('rotativo de artefato: o destaque tem de estar no pool como `hero`, e sozinho', () => {
    expect(codigos({ ...rotativoDeArtefato, featuredArtifactId: 'art-a' })).toContain('destaque-fora-do-pool');
    const comOutro = {
      ...rotativoDeArtefato,
      pool: [...rotativoDeArtefato.pool, { artifactId: 'art-g', rank: 'hero' as const, weight: 1, fragmentMaterialId: 'f' }],
    };
    expect(codigos(comOutro)).toContain('rotativo-com-outro-hero');
  });

  it('o token tem limiar inteiro >= 1 e aponta para artefato conhecido', () => {
    expect(codigos({ ...rotativoDePersonagem, token: { ...rotativoDePersonagem.token, threshold: 0 } })).toContain('token-invalido');
    expect(codigos({ ...rotativoDePersonagem, token: { ...rotativoDePersonagem.token, threshold: 1.5 } })).toContain('token-invalido');
    expect(codigos({ ...rotativoDePersonagem, token: { ...rotativoDePersonagem.token, artifactId: 'art-nada' } })).toContain(
      'token-invalido',
    );
  });

  it('a escolha do genérico é inteira >= 1', () => {
    expect(codigos({ ...generico, choiceEvery: 0 })).toContain('escolha-invalida');
    expect(codigos({ ...generico, choiceEvery: 12.5 })).toContain('escolha-invalida');
  });

  it('a curva: base e rampa inteiras >= 0, e a rampa começa dentro do teto', () => {
    expect(codigos({ ...generico, softPity: { baseRate: -1, softStart: 89, step: 60 } })).toContain('soft-pity-invalido');
    expect(codigos({ ...generico, softPity: { baseRate: 0.6, softStart: 89, step: 60 } })).toContain('soft-pity-invalido');
    expect(codigos({ ...generico, softPity: { baseRate: 6, softStart: 0, step: 60 } })).toContain('soft-pity-invalido');
    expect(codigos({ ...generico, softPity: { baseRate: 6, softStart: 106, step: 60 } })).toContain('soft-pity-invalido');
    expect(codigos({ ...generico, softPity: { baseRate: 6, softStart: 89, step: 6.5 } })).toContain('soft-pity-invalido');
  });

  it('artefato desconhecido no pool é recusado', () => {
    const comDesconhecido = {
      ...generico,
      pool: [...generico.pool, { artifactId: 'art-nada', rank: 'hero' as const, weight: 1, fragmentMaterialId: 'f' }],
    };
    expect(codigos(comDesconhecido)).toContain('artefato-desconhecido');
  });
});
