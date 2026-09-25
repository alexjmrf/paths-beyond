import { describe, expect, it } from 'vitest';
import { INITIAL_PITY, pityScopeOf, rollSummon } from '../src/index.js';
import { generico, rotativoDeArtefato, rotativoDePersonagem } from './fixtures.js';

// M38 3/N (D54) — os ROTATIVOS e o que eles entregam.

describe('o rotativo de personagem', () => {
  it('o único `Hero` que sai é o destaque — tirar o `Hero` é tirar o destaque, e zera o contador', () => {
    for (let seed = 0; seed < 200; seed++) {
      const r = rollSummon({
        banner: rotativoDePersonagem,
        owned: [],
        ownedArtifacts: [],
        pity: { adventurer: 0, hero: 89 },
        seed,
        rollId: `r-${seed}`,
      });
      expect(r.outcome).toEqual({ kind: 'character', characterId: 'char-h', rank: 'hero' });
      expect(r.pity.hero).toBe(0);
    }
  });
});

describe('o rotativo de artefato', () => {
  it('garante o artefato do destaque no teto de 60, e entrega ARTEFATO, não personagem', () => {
    const r = rollSummon({
      banner: rotativoDeArtefato,
      owned: [],
      ownedArtifacts: [],
      pity: { adventurer: 0, hero: 59 },
      seed: 3,
      rollId: 'r',
    });
    expect(r.outcome).toEqual({ kind: 'artifact', artifactId: 'art-h', rank: 'hero' });
    expect(r.guaranteed).toBe('hero');
    expect(r.pity.hero).toBe(0);
  });

  it('artefato que o jogador já tem sai como duplicata e paga o fragmento DO ARTEFATO', () => {
    const r = rollSummon({
      banner: rotativoDeArtefato,
      owned: [],
      ownedArtifacts: ['art-h'],
      pity: { adventurer: 0, hero: 59 },
      seed: 3,
      rollId: 'r',
    });
    expect(r.outcome).toEqual({
      kind: 'artifactDuplicate',
      artifactId: 'art-h',
      rank: 'hero',
      fragmentMaterialId: 'frag-art-h',
    });
  });

  it('a posse de PERSONAGEM não transforma artefato em duplicata, nem o contrário', () => {
    // `char-h` e `art-h` são coisas diferentes: ter o Hero não é ter o artefato dele.
    const r = rollSummon({
      banner: rotativoDeArtefato,
      owned: ['art-h'],
      ownedArtifacts: [],
      pity: { adventurer: 0, hero: 59 },
      seed: 3,
      rollId: 'r',
    });
    expect(r.outcome.kind).toBe('artifact');
  });
});

describe('o genérico misto', () => {
  it('o prêmio sai personagem OU artefato, pelo peso — os dois aparecem em 300 tetos', () => {
    const vistos = new Set<string>();
    for (let seed = 0; seed < 300; seed++) {
      const r = rollSummon({
        banner: generico,
        owned: [],
        ownedArtifacts: [],
        pity: { adventurer: 0, hero: 104 },
        seed,
        rollId: `r-${seed}`,
      });
      expect(r.outcome.rank).toBe('hero');
      vistos.add(r.outcome.kind);
    }
    expect([...vistos].sort()).toEqual(['artifact', 'character']);
  });

  it('o prêmio do genérico zera o contador de soft pity (D55: só a escolha não zera)', () => {
    const r = rollSummon({
      banner: generico,
      owned: [],
      ownedArtifacts: [],
      pity: { adventurer: 0, hero: 104 },
      seed: 1,
      rollId: 'r',
    });
    expect(r.pity.hero).toBe(0);
  });
});

describe('o pity é guardado por TIPO de banner (D54)', () => {
  it('a chave do contador é o tipo, não o id', () => {
    expect(pityScopeOf(rotativoDePersonagem)).toBe('rotatingCharacter');
    expect(pityScopeOf({ ...rotativoDePersonagem, id: 'outro-rotativo' })).toBe('rotatingCharacter');
    expect(pityScopeOf(rotativoDeArtefato)).toBe('rotatingArtifact');
    expect(pityScopeOf(generico)).toBe('generic');
  });

  it('o contador que vem do banner anterior vale inteiro no seguinte', () => {
    // O rotativo de amanhã é outro banner com o mesmo tipo: o jogador que parou em 89 no de
    // hoje tira o destaque na primeira rolagem do próximo.
    const amanha = { ...rotativoDePersonagem, id: 'banner-rot-amanha' };
    const r = rollSummon({ banner: amanha, owned: [], ownedArtifacts: [], pity: { adventurer: 0, hero: 89 }, seed: 9, rollId: 'r' });
    expect(r.guaranteed).toBe('hero');
    expect(INITIAL_PITY).toEqual({ adventurer: 0, hero: 0 });
  });
});
