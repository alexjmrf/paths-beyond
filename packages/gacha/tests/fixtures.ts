import type { GenericBanner, RotatingArtifactBanner, RotatingCharacterBanner } from '../src/index.js';

// M38 3/N — os três tipos de banner de D54, com os NÚMEROS DE D54 (a curva é o que se mede
// aqui). Os ids são de teste: o pacote não conhece o catálogo (regra 4).

export const CURVA_PERSONAGEM = { baseRate: 6, softStart: 74, step: 60 } as const;
export const CURVA_ARTEFATO = { baseRate: 7, softStart: 50, step: 70 } as const;
export const CURVA_GENERICO = { baseRate: 6, softStart: 89, step: 60 } as const;

export const rotativoDePersonagem: RotatingCharacterBanner = {
  id: 'banner-rot-h',
  kind: 'rotatingCharacter',
  featuredCharacterId: 'char-h',
  token: { threshold: 135, artifactId: 'art-h', fragmentMaterialId: 'frag-art-h' },
  pityThresholds: { adventurer: 10, hero: 90 },
  softPity: CURVA_PERSONAGEM,
  pool: [
    { characterId: 'char-h', rank: 'hero', weight: 1, fragmentMaterialId: 'frag-h' },
    { characterId: 'char-a', rank: 'adventurer', weight: 1, fragmentMaterialId: 'frag-a' },
    { characterId: 'char-b', rank: 'adventurer', weight: 1, fragmentMaterialId: 'frag-b' },
  ],
};

export const rotativoDeArtefato: RotatingArtifactBanner = {
  id: 'banner-rot-art-h',
  kind: 'rotatingArtifact',
  featuredArtifactId: 'art-h',
  pityThresholds: { adventurer: 10, hero: 60 },
  softPity: CURVA_ARTEFATO,
  pool: [
    { artifactId: 'art-h', rank: 'hero', weight: 1, fragmentMaterialId: 'frag-art-h' },
    { artifactId: 'art-a', rank: 'adventurer', weight: 1, fragmentMaterialId: 'frag-art-a' },
    { artifactId: 'art-b', rank: 'adventurer', weight: 1, fragmentMaterialId: 'frag-art-b' },
  ],
};

export const generico: GenericBanner = {
  id: 'banner-generico',
  kind: 'generic',
  choiceEvery: 180,
  pityThresholds: { adventurer: 10, hero: 105 },
  softPity: CURVA_GENERICO,
  pool: [
    { characterId: 'char-g', rank: 'hero', weight: 1, fragmentMaterialId: 'frag-g' },
    { artifactId: 'art-g', rank: 'hero', weight: 1, fragmentMaterialId: 'frag-art-g' },
    { characterId: 'char-a', rank: 'adventurer', weight: 1, fragmentMaterialId: 'frag-a' },
    { artifactId: 'art-a', rank: 'adventurer', weight: 1, fragmentMaterialId: 'frag-art-a' },
  ],
};
