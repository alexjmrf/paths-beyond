import { describe, expect, it } from 'vitest';
import { INITIAL_PITY, rollSummon, softRate, type BannerDef, type SoftPityCurve } from '../src/index.js';
import { CURVA_ARTEFATO, CURVA_GENERICO, CURVA_PERSONAGEM, generico, rotativoDeArtefato, rotativoDePersonagem } from './fixtures.js';

// M38 3/N (D54) — O SOFT PITY.
//
// A forma é a de Genshin: taxa base constante até o início da rampa, depois somando uma parcela
// fixa por rolagem, e 1000 no teto duro. A tabela de D54 foi calculada exatamente e aceita pelo
// usuário; este arquivo é o que prova que o motor implementa AQUELA tabela, e não uma parecida.

/** A distribuição exata da rolagem em que o primeiro `Hero` sai. Float é permitido em TESTE. */
function distribuicao(curva: SoftPityCurve, teto: number): { mediana: number; media: number } {
  let sobrevive = 1;
  let media = 0;
  let mediana = 0;
  for (let n = 1; n <= teto; n++) {
    const p = (sobrevive * softRate(curva, teto, n)) / 1000;
    media += n * p;
    sobrevive -= p;
    if (mediana === 0 && sobrevive <= 0.5) mediana = n;
  }
  return { mediana, media: Math.round(media * 10) / 10 };
}

describe('softRate — a taxa de `Hero` por rolagem, em milésimos (regra 2)', () => {
  it('é a base até a rolagem anterior ao início da rampa', () => {
    expect(softRate(CURVA_PERSONAGEM, 90, 1)).toBe(6);
    expect(softRate(CURVA_PERSONAGEM, 90, 73)).toBe(6);
  });

  it('soma `step` por rolagem a partir de `softStart`, inclusive', () => {
    expect(softRate(CURVA_PERSONAGEM, 90, 74)).toBe(66);
    expect(softRate(CURVA_PERSONAGEM, 90, 75)).toBe(126);
    expect(softRate(CURVA_PERSONAGEM, 90, 89)).toBe(966);
  });

  it('é 1000 no teto duro, e nunca passa de 1000', () => {
    expect(softRate(CURVA_PERSONAGEM, 90, 90)).toBe(1000);
    expect(softRate(CURVA_PERSONAGEM, 90, 200)).toBe(1000);
    // Uma rampa que passaria de 1000 antes do teto é aparada.
    expect(softRate({ baseRate: 6, softStart: 2, step: 600 }, 90, 5)).toBe(1000);
  });

  it('é sempre inteira', () => {
    for (let n = 1; n <= 120; n++) {
      expect(Number.isInteger(softRate(CURVA_GENERICO, 105, n))).toBe(true);
    }
  });
});

describe('a tabela de D54, exata', () => {
  it('rotativo de personagem: mediana 76, média 62,3', () => {
    expect(distribuicao(CURVA_PERSONAGEM, 90)).toEqual({ mediana: 76, media: 62.3 });
  });

  it('rotativo de artefato: mediana 52, média 44,7', () => {
    expect(distribuicao(CURVA_ARTEFATO, 60)).toEqual({ mediana: 52, media: 44.7 });
  });

  it('genérico: mediana 90, média 71,3', () => {
    expect(distribuicao(CURVA_GENERICO, 105)).toEqual({ mediana: 90, media: 71.3 });
  });
});

describe('a rolagem segue a curva', () => {
  function primeiroHero(banner: BannerDef, seed: number): number {
    let pity = INITIAL_PITY;
    for (let n = 1; n <= 500; n++) {
      const r = rollSummon({ banner, owned: [], ownedArtifacts: [], pity, seed, rollId: `r-${n}` });
      if (r.outcome.rank === 'hero') return n;
      pity = r.pity;
    }
    throw new Error('nenhum hero em 500 rolagens');
  }

  it('nenhum `Hero` passa do teto duro — 400 jogadores em cada banner', () => {
    for (const banner of [rotativoDePersonagem, rotativoDeArtefato, generico]) {
      for (let seed = 0; seed < 400; seed++) {
        expect(primeiroHero(banner, seed), `${banner.id} seed ${seed}`).toBeLessThanOrEqual(banner.pityThresholds.hero);
      }
    }
  });

  it('a mediana amostrada fica perto da exata: metade dos jogadores tira o destaque perto de 76', () => {
    const amostra: number[] = [];
    for (let seed = 0; seed < 2000; seed++) amostra.push(primeiroHero(rotativoDePersonagem, seed));
    amostra.sort((a, b) => a - b);

    const mediana = amostra[amostra.length / 2]!;
    expect(mediana).toBeGreaterThanOrEqual(73);
    expect(mediana).toBeLessThanOrEqual(78);
  });

  it('só o `Hero` do TETO é garantia; o que sai pela rampa não é', () => {
    const noTeto = rollSummon({
      banner: rotativoDePersonagem,
      owned: [],
      ownedArtifacts: [],
      pity: { adventurer: 0, hero: 89 },
      seed: 1,
      rollId: 'r',
    });
    expect(noTeto.outcome.rank).toBe('hero');
    expect(noTeto.guaranteed).toBe('hero');

    for (let seed = 0; seed < 300; seed++) {
      const r = rollSummon({
        banner: rotativoDePersonagem,
        owned: [],
        ownedArtifacts: [],
        pity: { adventurer: 0, hero: 80 },
        seed,
        rollId: `r-${seed}`,
      });
      if (r.outcome.rank === 'hero') expect(r.guaranteed).toBeNull();
    }
  });

  it('o andar de `Adventurer` continua duro em 10', () => {
    for (let seed = 0; seed < 300; seed++) {
      const r = rollSummon({
        banner: rotativoDePersonagem,
        owned: [],
        ownedArtifacts: [],
        pity: { adventurer: 10, hero: 0 },
        seed,
        rollId: `r-${seed}`,
      });
      // Com o `Hero` em 0,6%, a rampa pode tirar o `Hero` (que tem precedência, D50c); se não
      // tirou, é `Adventurer` e é garantia.
      if (r.outcome.rank === 'adventurer') expect(r.guaranteed).toBe('adventurer');
    }
  });

  it('é determinístico: mesma seed e mesmo rollId, mesmo resultado', () => {
    const input = { banner: generico, owned: [], ownedArtifacts: [], pity: { adventurer: 3, hero: 95 }, seed: 42, rollId: 'x' };
    expect(rollSummon(input)).toEqual(rollSummon(input));
  });
});
