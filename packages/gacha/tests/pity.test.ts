import { describe, expect, it } from 'vitest';
import { INITIAL_PITY, advancePity, isPityArmed, rollSummon, type BannerDef } from '../src/index.js';

const banner: BannerDef = {
  id: 'banner-teste',
  pityThreshold: 5,
  pool: [
    { characterId: 'char-a', weight: 1, fragmentMaterialId: 'frag-a' },
    { characterId: 'char-b', weight: 1, fragmentMaterialId: 'frag-b' },
    { characterId: 'char-c', weight: 1, fragmentMaterialId: 'frag-c' },
  ],
};

describe('pity duro contado (D18)', () => {
  it('a rolagem N+1 NUNCA falha: com o pity armado, 300 seeds diferentes dão personagem novo', () => {
    // É esta a propriedade que fez o pity duro ser escolhido em vez de taxa pura: ela é
    // afirmável em uma linha, e não uma estatística sobre muitas seeds.
    const armado = { rollsSinceNew: banner.pityThreshold };
    const owned = ['char-a']; // sobram dois no pool

    for (let seed = 0; seed < 300; seed++) {
      const result = rollSummon({ banner, owned, pity: armado, seed, rollId: `run-${seed}` });

      expect(result.outcome.kind).toBe('character');
      if (result.outcome.kind !== 'character') throw new Error('inalcançável');
      expect(result.outcome.guaranteed).toBe(true);
      expect(owned).not.toContain(result.outcome.characterId);
    }
  });

  it('antes do limiar a garantia não vale: com o pool quase todo possuído, sai duplicata', () => {
    const quaseArmado = { rollsSinceNew: banner.pityThreshold - 1 };
    const owned = ['char-a', 'char-b'];

    // `char-c` é o único não possuído: sem garantia, o pool inteiro continua sorteável e
    // cerca de 2 em 3 rolagens caem em duplicata. A faixa é larga de propósito — o que se
    // afirma é que a garantia NÃO está valendo, não a distribuição.
    let duplicatas = 0;
    for (let seed = 0; seed < 60; seed++) {
      const result = rollSummon({ banner, owned, pity: quaseArmado, seed, rollId: `run-${seed}` });
      if (result.outcome.kind === 'duplicate') duplicatas++;
    }

    expect(duplicatas).toBeGreaterThan(20);
  });

  it('o contador zera quando sai personagem novo', () => {
    const result = rollSummon({ banner, owned: [], pity: { rollsSinceNew: 3 }, seed: 11, rollId: 'run-1' });

    expect(result.outcome.kind).toBe('character');
    expect(result.pity).toEqual({ rollsSinceNew: 0 });
  });

  it('o contador avança em duplicata', () => {
    // Semente escolhida por medição para cair em personagem já possuído. O desfecho é
    // afirmado DURO antes do contador: um `if` aqui deixaria o teste passar pelo ramo
    // errado sem ninguém notar — foi o que aconteceu na primeira escrita deste arquivo.
    const result = rollSummon({
      banner,
      owned: ['char-a', 'char-b'],
      pity: { rollsSinceNew: 1 },
      seed: 0,
      rollId: 'duplicata',
    });

    expect(result.outcome.kind).toBe('duplicate');
    expect(result.pity).toEqual({ rollsSinceNew: 2 });
  });

  it('a garantia armada é CONSUMIDA: depois de usá-la, o contador volta a zero', () => {
    const result = rollSummon({
      banner,
      owned: ['char-a'],
      pity: { rollsSinceNew: banner.pityThreshold },
      seed: 5,
      rollId: 'run-1',
    });

    expect(result.outcome.kind).toBe('character');
    expect(result.pity).toEqual({ rollsSinceNew: 0 });
  });

  it('pool esgotado: o contador CONGELA e a garantia não é gasta com nada', () => {
    // Leitura registrada em DECISIONS.md: quando o jogador já possui o pool inteiro não há
    // o que garantir. Avançar o contador seria acumular uma garantia sem destino; consumi-la
    // seria pior ainda — o jogador perderia uma garantia que ninguém pagou.
    const owned = ['char-a', 'char-b', 'char-c'];
    const armado = { rollsSinceNew: banner.pityThreshold };

    const result = rollSummon({ banner, owned, pity: armado, seed: 4, rollId: 'run-1' });

    expect(result.outcome.kind).toBe('duplicate');
    expect(result.pity).toEqual(armado);
  });

  it('pool esgotado com o contador no meio do caminho: também congela', () => {
    const owned = ['char-a', 'char-b', 'char-c'];

    const result = rollSummon({ banner, owned, pity: { rollsSinceNew: 2 }, seed: 4, rollId: 'run-1' });

    expect(result.pity).toEqual({ rollsSinceNew: 2 });
  });

  it('uma sequência real de rolagens nunca passa do limiar sem entregar personagem', () => {
    // O laço que um jogador de verdade percorre: pity e posse encadeados rolagem a rolagem.
    let owned: string[] = [];
    let pity = INITIAL_PITY;
    let semNovoSeguidas = 0;

    for (let i = 0; i < 200; i++) {
      const result = rollSummon({ banner, owned, pity, seed: 123, rollId: `run-${i}` });
      pity = result.pity;

      if (result.outcome.kind === 'character') {
        owned = [...owned, result.outcome.characterId];
        semNovoSeguidas = 0;
      } else if (owned.length < banner.pool.length) {
        semNovoSeguidas++;
      }

      // Enquanto houver o que ganhar, a sequência sem personagem novo nunca ultrapassa N.
      expect(semNovoSeguidas).toBeLessThanOrEqual(banner.pityThreshold);
    }

    // E em 200 rolagens o pool inteiro é obtido, senão o teste acima seria vacuamente verde.
    expect(owned.length).toBe(banner.pool.length);
  });
});

describe('isPityArmed / advancePity', () => {
  it('arma exatamente no limiar, não antes', () => {
    expect(isPityArmed({ rollsSinceNew: 4 }, 5)).toBe(false);
    expect(isPityArmed({ rollsSinceNew: 5 }, 5)).toBe(true);
    expect(isPityArmed({ rollsSinceNew: 6 }, 5)).toBe(true);
  });

  it('zera com personagem novo, avança sem, congela com o pool esgotado', () => {
    expect(advancePity({ rollsSinceNew: 3 }, { grantedNew: true, poolExhausted: false })).toEqual({ rollsSinceNew: 0 });
    expect(advancePity({ rollsSinceNew: 3 }, { grantedNew: false, poolExhausted: false })).toEqual({ rollsSinceNew: 4 });
    expect(advancePity({ rollsSinceNew: 3 }, { grantedNew: false, poolExhausted: true })).toEqual({ rollsSinceNew: 3 });
  });
});
