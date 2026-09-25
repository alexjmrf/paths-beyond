import { describe, expect, it } from 'vitest';
import { RANKS_DE_BASE, type BaseRank } from '@paths-beyond/core';
import {
  INITIAL_PITY,
  advancePity,
  isPityArmed,
  rankGarantido,
  outcomeId,
  rollSummon,
  type BannerDef,
  type PityState,
} from '../src/index.js';

// D50 (M37, 2/N) — O PITY DE DOIS ANDARES.
//
// **O banner deixa de ter um contador e passa a ter um por rank.** `Adventurer` garante a cada
// 10 rolagens e `Hero` a cada 90 (números do usuário; aqui embaixo são 3 e 7, porque o que se
// afirma é a MECÂNICA e não o número — o número mora em `packages/data`).
//
// Três decisões do usuário que este arquivo é o único lugar a provar:
//
// **a) A garantia entrega QUALQUER UM daquele rank, não um personagem novo.** Isto reverte D18
// de propósito: duplicata vira fragmento, como em qualquer rolagem. É o que faz o 90 significar
// no mercado o que ele significa aqui. A consequência de forma é o congelamento — o contador de
// um rank congela quando o BANNER não oferece aquele rank, e não mais quando o jogador já possui
// todos.
//
// **b) Os contadores são INDEPENDENTES.** Um `Hero` não zera o de `Adventurer`. Quem tirou um
// `Hero` na rolagem 9 ainda recebe o `Adventurer` garantido na 10 — o oposto do "4★ ou melhor"
// do Genshin, e mais generoso.
//
// **c) Com os dois armados na mesma rolagem, o `Hero` tem precedência.** Entregar o `Adventurer`
// faria o prêmio caro escorregar; e como (b) vale, o de `Adventurer` dispara na rolagem seguinte
// sem nada se perder.

// M38 3/N — a curva com taxa ZERO e rampa ZERO é o pity duro puro: o `Hero` só sai no teto.
// É o que deixa as asserções abaixo continuarem exatas; a rampa tem o arquivo dela,
// `softPity.test.ts`.
const banner: BannerDef = {
  id: 'banner-teste',
  kind: 'generic',
  choiceEvery: 1000,
  softPity: { baseRate: 0, softStart: 7, step: 0 },
  pityThresholds: { adventurer: 3, hero: 7 },
  pool: [
    { characterId: 'char-a', rank: 'adventurer', weight: 1, fragmentMaterialId: 'frag-a' },
    { characterId: 'char-b', rank: 'adventurer', weight: 1, fragmentMaterialId: 'frag-b' },
    { characterId: 'char-h', rank: 'hero', weight: 1, fragmentMaterialId: 'frag-h' },
  ],
};

const rankDe = new Map(banner.pool.map((entry) => [entry.characterId, entry.rank] as const));

function pity(adventurer: number, hero: number): PityState {
  return { adventurer, hero };
}

describe('o pity de dois andares (D50)', () => {
  it('começa zerado nos DOIS ranks — e a lista de contadores é a dos ranks de base', () => {
    expect(INITIAL_PITY).toEqual({ adventurer: 0, hero: 0 });
    // Se um rank de base novo aparecer em `packages/core`, o contador dele não pode nascer
    // ausente: seria um rank sem garantia nenhuma, em silêncio.
    expect(Object.keys(INITIAL_PITY).sort()).toEqual([...RANKS_DE_BASE].sort());
  });

  it('com o contador de `Adventurer` armado, a rolagem seguinte É um `Adventurer` — 300 seeds', () => {
    // A propriedade que fez o pity duro ser escolhido em vez de taxa pura (D18): ela é
    // afirmável, e não estatística.
    const armado = pity(banner.pityThresholds.adventurer, 0);

    for (let seed = 0; seed < 300; seed++) {
      const result = rollSummon({ banner, owned: [], ownedArtifacts: [], pity: armado, seed, rollId: `run-${seed}` });

      expect(result.outcome.rank, `seed ${seed}`).toBe('adventurer');
      expect(result.guaranteed).toBe('adventurer');
    }
  });

  it('com o contador de `Hero` armado, a rolagem seguinte É um `Hero` — 300 seeds', () => {
    const armado = pity(0, banner.pityThresholds.hero);

    for (let seed = 0; seed < 300; seed++) {
      const result = rollSummon({ banner, owned: [], ownedArtifacts: [], pity: armado, seed, rollId: `run-${seed}` });

      expect(result.outcome.rank, `seed ${seed}`).toBe('hero');
      expect(result.guaranteed).toBe('hero');
    }
  });

  it('com os DOIS armados, sai `Hero` — e o de `Adventurer` continua armado depois (c + b)', () => {
    const armado = pity(banner.pityThresholds.adventurer, banner.pityThresholds.hero);

    for (let seed = 0; seed < 100; seed++) {
      const result = rollSummon({ banner, owned: [], ownedArtifacts: [], pity: armado, seed, rollId: `run-${seed}` });

      expect(result.outcome.rank, `seed ${seed}`).toBe('hero');
      expect(result.guaranteed).toBe('hero');
      // O `Hero` zerou o contador DELE e só. O de `Adventurer` avançou mais um e dispara na
      // próxima — a garantia cara não comeu a barata.
      expect(result.pity.hero).toBe(0);
      expect(result.pity.adventurer).toBe(banner.pityThresholds.adventurer + 1);
    }
  });

  it('um rank abaixo do limiar não arma nada: sem garantia, o pool inteiro é sorteável', () => {
    // M38 3/N — "abaixo do limiar" é uma rolagem ANTES da garantida (D55), e o `Hero` só
    // aparece fora do teto se a curva tiver taxa: por isso o banner aqui ganha uma.
    const quase = pity(banner.pityThresholds.adventurer - 2, banner.pityThresholds.hero - 2);
    const comTaxa: BannerDef = { ...banner, softPity: { baseRate: 300, softStart: 7, step: 0 } };

    const ranks = new Set<BaseRank>();
    for (let seed = 0; seed < 200; seed++) {
      const result = rollSummon({ banner: comTaxa, owned: [], ownedArtifacts: [], pity: quase, seed, rollId: `run-${seed}` });
      expect(result.guaranteed, `seed ${seed}`).toBeNull();
      ranks.add(result.outcome.rank);
    }

    // Sem garantia os dois ranks aparecem — é o que distingue "não armado" de "armado".
    expect([...ranks].sort()).toEqual(['adventurer', 'hero']);
  });

  it('a garantia entrega QUALQUER UM daquele rank: com o rank todo possuído, ela sai DUPLICATA (a)', () => {
    // A reversão de D18, e é a asserção que a distingue. Antes a garantia restringia ao não
    // possuído e o contador congelava; agora ela dispara do mesmo jeito e paga fragmento.
    const owned = ['char-a', 'char-b'];
    const armado = pity(banner.pityThresholds.adventurer, 0);

    for (let seed = 0; seed < 100; seed++) {
      const result = rollSummon({ banner, owned, ownedArtifacts: [], pity: armado, seed, rollId: `run-${seed}` });

      expect(result.guaranteed).toBe('adventurer');
      expect(result.outcome.kind, `seed ${seed}`).toBe('duplicate');
      expect(result.outcome.rank).toBe('adventurer');
      // E o contador zerou, porque um `Adventurer` saiu — duplicata é um `Adventurer`.
      expect(result.pity.adventurer).toBe(0);
    }
  });

  it('os contadores são INDEPENDENTES: um `Hero` não zera o de `Adventurer`, nem o contrário (b)', () => {
    // O banner INTEIRO nos dois casos — de propósito. Recortá-lo a um rank só faria o outro
    // contador congelar por regra, e a asserção mediria o congelamento em vez da
    // independência. Quem força o rank de saída aqui é a garantia.
    const saiuHero = rollSummon({ banner, owned: [], ownedArtifacts: [], pity: pity(2, 7), seed: 5, rollId: 'run-1' });
    expect(saiuHero.outcome.rank).toBe('hero');
    expect(saiuHero.pity.hero).toBe(0);
    expect(saiuHero.pity.adventurer).toBe(3);

    const saiuAdv = rollSummon({ banner, owned: [], ownedArtifacts: [], pity: pity(3, 2), seed: 5, rollId: 'run-1' });
    expect(saiuAdv.outcome.rank).toBe('adventurer');
    expect(saiuAdv.pity.adventurer).toBe(0);
    expect(saiuAdv.pity.hero).toBe(3);
  });

  it('rank que o BANNER não oferece tem o contador CONGELADO — não há o que garantir', () => {
    // O congelamento do M18 1/N, reassentado: ele deixou de depender da posse (a) e passou a
    // depender do pool. Avançar acumularia uma garantia sem destino.
    const soAdventurer: BannerDef = { ...banner, pool: banner.pool.filter((e) => e.rank === 'adventurer') };

    let estado = pity(0, 4);
    for (let i = 0; i < 20; i++) {
      estado = rollSummon({ banner: soAdventurer, owned: [], ownedArtifacts: [], pity: estado, seed: 1, rollId: `run-${i}` }).pity;
    }

    expect(estado.hero).toBe(4);
  });

  it('congelado, o rank ausente NUNCA arma uma garantia que o pool não pode pagar', () => {
    const soAdventurer: BannerDef = { ...banner, pool: banner.pool.filter((e) => e.rank === 'adventurer') };

    // Mesmo com o contador muito acima do limiar — dado vindo de um banner anterior —, a
    // garantia não pode escolher um rank que não está no pool.
    const result = rollSummon({ banner: soAdventurer, owned: [], ownedArtifacts: [], pity: pity(0, 999), seed: 3, rollId: 'run-1' });

    expect(result.outcome.rank).toBe('adventurer');
    expect(result.guaranteed).toBeNull();
  });

  it('nenhum rank fica mais de `limiar` rolagens sem sair — 400 rolagens encadeadas', () => {
    // O laço que um jogador de verdade percorre, com os dois contadores correndo juntos.
    let estado = INITIAL_PITY;
    const desde: Record<BaseRank, number> = { adventurer: 0, hero: 0 };
    const pior: Record<BaseRank, number> = { adventurer: 0, hero: 0 };

    for (let i = 0; i < 400; i++) {
      const result = rollSummon({ banner, owned: [], ownedArtifacts: [], pity: estado, seed: 77, rollId: `run-${i}` });
      estado = result.pity;

      for (const rank of RANKS_DE_BASE) {
        if (result.outcome.rank === rank) desde[rank] = 0;
        else desde[rank] += 1;
        pior[rank] = Math.max(pior[rank], desde[rank]);
      }
    }

    // D55 — a N-ésima é garantida, então nunca há N rolagens seguidas sem o rank.
    expect(pior.adventurer).toBeLessThanOrEqual(banner.pityThresholds.adventurer - 1);
    expect(pior.hero).toBeLessThanOrEqual(banner.pityThresholds.hero - 1);
  });
});

describe('isPityArmed, rankGarantido e advancePity, isolados', () => {
  it('isPityArmed arma para a N-ésima rolagem: com N-1 sem prêmio, a próxima é garantida (D55)', () => {
    expect(isPityArmed(pity(1, 0), banner.pityThresholds, 'adventurer')).toBe(false);
    expect(isPityArmed(pity(2, 0), banner.pityThresholds, 'adventurer')).toBe(true);
    expect(isPityArmed(pity(3, 0), banner.pityThresholds, 'adventurer')).toBe(true);
    expect(isPityArmed(pity(0, 5), banner.pityThresholds, 'hero')).toBe(false);
    expect(isPityArmed(pity(0, 6), banner.pityThresholds, 'hero')).toBe(true);
  });

  it('rankGarantido devolve null, o rank armado, e o `Hero` quando os dois armam', () => {
    expect(rankGarantido(banner, pity(0, 0))).toBeNull();
    expect(rankGarantido(banner, pity(2, 0))).toBe('adventurer');
    expect(rankGarantido(banner, pity(0, 6))).toBe('hero');
    expect(rankGarantido(banner, pity(2, 6))).toBe('hero');
  });

  it('rankGarantido ignora rank que o banner não oferece, por armado que esteja', () => {
    const soAdventurer: BannerDef = { ...banner, pool: banner.pool.filter((e) => e.rank === 'adventurer') };

    expect(rankGarantido(soAdventurer, pity(0, 999))).toBeNull();
    expect(rankGarantido(soAdventurer, pity(3, 999))).toBe('adventurer');
  });

  it('advancePity zera só o rank que saiu, congela o ausente e soma um no resto', () => {
    expect(advancePity(pity(2, 5), { grantedRank: 'hero', ranksSemEntrada: [] })).toEqual(pity(3, 0));
    expect(advancePity(pity(2, 5), { grantedRank: 'adventurer', ranksSemEntrada: [] })).toEqual(pity(0, 6));
    expect(advancePity(pity(2, 5), { grantedRank: 'adventurer', ranksSemEntrada: ['hero'] })).toEqual(pity(0, 5));
  });

  it('não muta a entrada: o estado recebido continua o mesmo valor', () => {
    const estado = pity(2, 5);
    rollSummon({ banner, owned: [], ownedArtifacts: [], pity: estado, seed: 9, rollId: 'run-1' });

    expect(estado).toEqual({ adventurer: 2, hero: 5 });
  });

  it('o rank do resultado é o que o BANNER declara para aquele personagem', () => {
    // O motor não deriva rank de id nem de nome: ele repete o que a entrada trouxe, e a
    // entrada é derivada do catálogo por `packages/content` (regra 4).
    for (let seed = 0; seed < 60; seed++) {
      const result = rollSummon({ banner, owned: [], ownedArtifacts: [], pity: INITIAL_PITY, seed, rollId: `run-${seed}` });

      expect(result.outcome.rank).toBe(rankDe.get(outcomeId(result.outcome)));
    }
  });
});
