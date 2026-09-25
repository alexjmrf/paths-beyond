import { describe, expect, it } from 'vitest';
import bannerSchema from '../schemas/banners.schema.js';

// §10 (M18, 2/N), reescrito no M38 3/N (D54/D55) — o schema dos TRÊS tipos de banner.
//
// O que este arquivo protege é a forma do dado, e só isso. A conformidade com o ELENCO e com o
// catálogo de artefatos — o destaque é `hero`, o rotativo não tem outro `hero`, o token aponta
// para o artefato assinatura do destaque — é validação cruzada e vive em `packages/content` e
// em `validateBanner` de `packages/gacha`: um schema de `packages/data` valida um arquivo
// isolado, sem conhecer os outros.

const frag = (id: string) => `material-fragmento-${id}`;

function rotativoDePersonagem(overrides: Record<string, unknown> = {}) {
  return {
    id: 'banner-rotativo-teste',
    kind: 'rotatingCharacter',
    name: 'Rotativo de Teste',
    activeFrom: '2026-09-25T00:00:00Z',
    activeUntil: '2026-10-09T00:00:00Z',
    featuredCharacterId: 'ally-guerreiro',
    tokenThreshold: 135,
    pityThresholds: { adventurer: 10, hero: 90 },
    softPity: { baseRate: 6, softStart: 74, step: 60 },
    pool: [
      { characterId: 'ally-guerreiro', weight: 1, fragmentMaterialId: frag('ally-guerreiro') },
      { characterId: 'ally-mensageira', weight: 1, fragmentMaterialId: frag('ally-mensageira') },
    ],
    ...overrides,
  };
}

function rotativoDeArtefato(overrides: Record<string, unknown> = {}) {
  return {
    id: 'banner-rotativo-artefato-teste',
    kind: 'rotatingArtifact',
    name: 'Rotativo de Artefato de Teste',
    activeFrom: '2026-09-25T00:00:00Z',
    activeUntil: '2026-10-09T00:00:00Z',
    featuredArtifactId: 'artifact-machado-do-tirano',
    pityThresholds: { adventurer: 10, hero: 60 },
    softPity: { baseRate: 7, softStart: 50, step: 70 },
    pool: [
      { artifactId: 'artifact-machado-do-tirano', weight: 1, fragmentMaterialId: 'f-tirano' },
      { artifactId: 'artifact-pena-de-grifo', weight: 1, fragmentMaterialId: 'f-grifo' },
    ],
    ...overrides,
  };
}

function generico(overrides: Record<string, unknown> = {}) {
  return {
    id: 'banner-generico-teste',
    kind: 'generic',
    name: 'Genérico de Teste',
    choiceEvery: 180,
    pityThresholds: { adventurer: 10, hero: 105 },
    softPity: { baseRate: 6, softStart: 89, step: 60 },
    pool: [
      { characterId: 'ally-couracado', weight: 5, fragmentMaterialId: frag('ally-couracado') },
      { artifactId: 'artifact-egide-de-bardan', weight: 2, fragmentMaterialId: 'f-egide' },
      { characterId: 'ally-mensageira', weight: 9, fragmentMaterialId: frag('ally-mensageira') },
    ],
    ...overrides,
  };
}

const aceita = (raw: unknown) => bannerSchema.safeParse(raw).success;

describe('banners.schema — os três tipos (D54)', () => {
  it('aceita um banner bem formado de cada tipo', () => {
    expect(aceita(rotativoDePersonagem())).toBe(true);
    expect(aceita(rotativoDeArtefato())).toBe(true);
    expect(aceita(generico())).toBe(true);
  });

  it('recusa tipo desconhecido ou ausente', () => {
    expect(aceita(generico({ kind: 'evento' }))).toBe(false);
    expect(aceita(generico({ kind: undefined }))).toBe(false);
  });

  it('recusa pool vazio', () => {
    expect(aceita(generico({ pool: [] }))).toBe(false);
  });

  it('recusa peso fracionário, zero ou negativo — o sorteio é inteiro (regra 2)', () => {
    for (const weight of [0.2, 0, -1]) {
      expect(aceita(generico({ pool: [{ characterId: 'ally-mensageira', weight, fragmentMaterialId: 'f' }] }))).toBe(false);
    }
  });

  it('recusa `pityThresholds` incompleto, com rank inventado, zero ou fracionário', () => {
    expect(aceita(generico({ pityThresholds: undefined }))).toBe(false);
    expect(aceita(generico({ pityThresholds: { adventurer: 10 } }))).toBe(false);
    expect(aceita(generico({ pityThresholds: { adventurer: 10, hero: 105, legend: 200 } }))).toBe(false);
    expect(aceita(generico({ pityThresholds: { adventurer: 0, hero: 105 } }))).toBe(false);
    expect(aceita(generico({ pityThresholds: { adventurer: 10, hero: 1.5 } }))).toBe(false);
  });

  it('recusa `rank` dentro da entrada — o rank é derivado do elenco e dos artefatos (D49)', () => {
    expect(
      aceita(generico({ pool: [{ characterId: 'ally-mensageira', rank: 'adventurer', weight: 1, fragmentMaterialId: 'f' }] })),
    ).toBe(false);
  });

  it('recusa entrada sem fragmento, e uma `rate` em ponto flutuante', () => {
    expect(aceita(generico({ pool: [{ characterId: 'ally-mensageira', weight: 1 }] }))).toBe(false);
    expect(
      aceita(generico({ pool: [{ characterId: 'ally-mensageira', weight: 1, rate: 0.02, fragmentMaterialId: 'f' }] })),
    ).toBe(false);
  });

  it('recusa entrada que seja personagem E artefato ao mesmo tempo, ou nenhum dos dois', () => {
    expect(
      aceita(generico({ pool: [{ characterId: 'a', artifactId: 'b', weight: 1, fragmentMaterialId: 'f' }] })),
    ).toBe(false);
    expect(aceita(generico({ pool: [{ weight: 1, fragmentMaterialId: 'f' }] }))).toBe(false);
  });

  it('recusa a mesma entrada duas vezes no pool', () => {
    const repetido = generico({
      pool: [
        { characterId: 'ally-mensageira', weight: 1, fragmentMaterialId: 'f' },
        { characterId: 'ally-mensageira', weight: 2, fragmentMaterialId: 'f' },
      ],
    });
    expect(aceita(repetido)).toBe(false);
  });
});

describe('banners.schema — a curva de soft pity (D54)', () => {
  it('é obrigatória, em milésimos inteiros e positivos', () => {
    expect(aceita(generico({ softPity: undefined }))).toBe(false);
    expect(aceita(generico({ softPity: { baseRate: 0.6, softStart: 89, step: 60 } }))).toBe(false);
    expect(aceita(generico({ softPity: { baseRate: 6, softStart: 89, step: 6.5 } }))).toBe(false);
    expect(aceita(generico({ softPity: { baseRate: 0, softStart: 89, step: 60 } }))).toBe(false);
    expect(aceita(generico({ softPity: { baseRate: 6, softStart: 89, step: 60, cap: 300 } }))).toBe(false);
  });

  it('a rampa começa dentro do teto duro — senão ela nunca apareceria', () => {
    expect(aceita(generico({ softPity: { baseRate: 6, softStart: 105, step: 60 } }))).toBe(true);
    expect(aceita(generico({ softPity: { baseRate: 6, softStart: 106, step: 60 } }))).toBe(false);
  });
});

describe('banners.schema — os rotativos', () => {
  it('declaram a janela de atividade, e ela não é vazia nem invertida', () => {
    expect(aceita(rotativoDePersonagem({ activeFrom: undefined }))).toBe(false);
    expect(aceita(rotativoDePersonagem({ activeUntil: undefined }))).toBe(false);
    expect(aceita(rotativoDePersonagem({ activeFrom: 'amanhã' }))).toBe(false);
    expect(aceita(rotativoDePersonagem({ activeUntil: '2026-09-25T00:00:00Z' }))).toBe(false);
    expect(aceita(rotativoDeArtefato({ activeUntil: '2026-09-01T00:00:00Z' }))).toBe(false);
  });

  it('o rotativo de personagem declara destaque e token inteiro positivo', () => {
    expect(aceita(rotativoDePersonagem({ featuredCharacterId: undefined }))).toBe(false);
    expect(aceita(rotativoDePersonagem({ tokenThreshold: undefined }))).toBe(false);
    expect(aceita(rotativoDePersonagem({ tokenThreshold: 0 }))).toBe(false);
    expect(aceita(rotativoDePersonagem({ tokenThreshold: 135.5 }))).toBe(false);
  });

  it('o destaque está no pool', () => {
    expect(aceita(rotativoDePersonagem({ featuredCharacterId: 'ally-lanceiro' }))).toBe(false);
    expect(aceita(rotativoDeArtefato({ featuredArtifactId: 'artifact-lanca-muralha' }))).toBe(false);
  });

  it('o rotativo de personagem só oferece personagem; o de artefato só artefato', () => {
    const comArtefato = rotativoDePersonagem({
      pool: [...rotativoDePersonagem().pool, { artifactId: 'artifact-pena-de-grifo', weight: 1, fragmentMaterialId: 'f' }],
    });
    const comPersonagem = rotativoDeArtefato({
      pool: [...rotativoDeArtefato().pool, { characterId: 'ally-mensageira', weight: 1, fragmentMaterialId: 'f' }],
    });
    expect(aceita(comArtefato)).toBe(false);
    expect(aceita(comPersonagem)).toBe(false);
  });

  it('o rotativo de artefato não tem token, e o genérico não tem janela nem destaque', () => {
    expect(aceita(rotativoDeArtefato({ tokenThreshold: 135 }))).toBe(false);
    expect(aceita(generico({ activeFrom: '2026-09-25T00:00:00Z' }))).toBe(false);
    expect(aceita(generico({ featuredCharacterId: 'ally-couracado' }))).toBe(false);
  });
});

describe('banners.schema — o genérico', () => {
  it('declara a escolha como inteiro positivo', () => {
    expect(aceita(generico({ choiceEvery: undefined }))).toBe(false);
    expect(aceita(generico({ choiceEvery: 0 }))).toBe(false);
    expect(aceita(generico({ choiceEvery: 180.5 }))).toBe(false);
  });

  it('é misto: aceita personagem e artefato no mesmo pool (D55)', () => {
    expect(aceita(generico())).toBe(true);
  });
});
