import { describe, expect, it } from 'vitest';
import { INITIAL_PITY, rollSummon, type BannerDef } from '../src/index.js';

// Banner de teste. Nenhum destes ids é conteúdo real — o pacote não conhece o catálogo,
// e é justamente isso que o mantém fora da regra 4.
const banner: BannerDef = {
  id: 'banner-teste',
  pityThreshold: 5,
  pool: [
    { characterId: 'char-a', weight: 1, fragmentMaterialId: 'frag-a' },
    { characterId: 'char-b', weight: 1, fragmentMaterialId: 'frag-b' },
    { characterId: 'char-c', weight: 1, fragmentMaterialId: 'frag-c' },
  ],
};

describe('rollSummon', () => {
  it('é determinístico: mesma seed e mesmo rollId produzem exatamente o mesmo resultado', () => {
    const input = { banner, owned: [], pity: INITIAL_PITY, seed: 42, rollId: 'run-1' };

    expect(rollSummon(input)).toEqual(rollSummon(input));
  });

  it('rollId diferente é stream diferente: 50 rolagens da mesma seed não são todas iguais', () => {
    const results = new Set<string>();
    for (let i = 0; i < 50; i++) {
      const result = rollSummon({ banner, owned: [], pity: INITIAL_PITY, seed: 42, rollId: `run-${i}` });
      results.add(result.outcome.characterId);
    }

    // Se o `rollId` não entrasse na derivação da seed, as 50 dariam o mesmo personagem.
    expect(results.size).toBeGreaterThan(1);
  });

  it('seed diferente também é stream diferente', () => {
    const results = new Set<string>();
    for (let seed = 0; seed < 50; seed++) {
      const result = rollSummon({ banner, owned: [], pity: INITIAL_PITY, seed, rollId: 'run-1' });
      results.add(result.outcome.characterId);
    }

    expect(results.size).toBeGreaterThan(1);
  });

  it('personagem que o jogador não possui sai como personagem', () => {
    const result = rollSummon({ banner, owned: [], pity: INITIAL_PITY, seed: 7, rollId: 'run-1' });

    expect(result.outcome.kind).toBe('character');
  });

  it('duplicata devolve o fragmento DO PRÓPRIO personagem, não um genérico', () => {
    // Com o pool inteiro possuído, toda rolagem é duplicata — qualquer que seja o sorteado.
    const owned = ['char-a', 'char-b', 'char-c'];

    for (let seed = 0; seed < 30; seed++) {
      const result = rollSummon({ banner, owned, pity: INITIAL_PITY, seed, rollId: 'run-1' });

      expect(result.outcome.kind).toBe('duplicate');
      if (result.outcome.kind !== 'duplicate') throw new Error('inalcançável');
      // O fragmento é o declarado na entrada daquele personagem, e não derivado do id por
      // convenção de nome: derivar seria o motor inventando conteúdo (regra 4).
      expect(result.outcome.fragmentMaterialId).toBe(`frag-${result.outcome.characterId.slice('char-'.length)}`);
    }
  });

  it('o peso do dado decide a distribuição: 90/10 sai perto de 90/10 em 2000 rolagens', () => {
    const pesado: BannerDef = {
      id: 'banner-pesado',
      pityThreshold: 1000,
      pool: [
        { characterId: 'char-comum', weight: 90, fragmentMaterialId: 'frag-comum' },
        { characterId: 'char-raro', weight: 10, fragmentMaterialId: 'frag-raro' },
      ],
    };
    // Pool inteiro possuído: sem isso o pity entraria no caminho e a medição seria de
    // outra coisa. O que se mede aqui é só o sorteio ponderado.
    const owned = ['char-comum', 'char-raro'];

    let comum = 0;
    const total = 2000;
    for (let i = 0; i < total; i++) {
      const result = rollSummon({ banner: pesado, owned, pity: INITIAL_PITY, seed: 1, rollId: `run-${i}` });
      if (result.outcome.characterId === 'char-comum') comum++;
    }

    expect(comum / total).toBeGreaterThan(0.85);
    expect(comum / total).toBeLessThan(0.95);
  });

  it('nunca sorteia fora do pool declarado', () => {
    const ids = new Set(banner.pool.map((entry) => entry.characterId));

    for (let i = 0; i < 200; i++) {
      const result = rollSummon({ banner, owned: [], pity: INITIAL_PITY, seed: 3, rollId: `run-${i}` });
      expect(ids.has(result.outcome.characterId)).toBe(true);
    }
  });

  it('não muta a entrada: o estado de pity recebido continua o mesmo objeto e o mesmo valor', () => {
    const pity = { rollsSinceNew: 2 };
    rollSummon({ banner, owned: ['char-a', 'char-b', 'char-c'], pity, seed: 9, rollId: 'run-1' });

    expect(pity).toEqual({ rollsSinceNew: 2 });
  });
});
