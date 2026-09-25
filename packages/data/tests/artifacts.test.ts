import { describe, expect, it } from 'vitest';
import artifactSchema from '../schemas/artifacts.schema.js';
import heroSchema from '../schemas/heroes.schema.js';
import materialSchema from '../schemas/materials.schema.js';

// M38 1/N (D53) — o schema do ARTEFATO. As travas são de FORMA, não de varredura: o que o
// jogo proíbe (artefato sem classe, `legend` de base, rank corrente gravado, efeito novo por
// imprint) é recusado pelo schema antes de chegar ao motor.

const valido = {
  id: 'artifact-lamina-do-juramento',
  signatureOf: 'hero-jogador',
  name: 'Lâmina do Juramento',
  classId: 'class-espadachim',
  rank: 'hero',
  atkByAwakening: [30, 40, 50, 60, 70, 80, 100],
  variableStat: { stat: 'def', byAwakening: [10, 12, 14, 16, 18, 20, 25] },
  imprintFlat: [[], [{ stat: 'hp', flat: 50 }], [{ stat: 'hp', flat: 100 }], [{ stat: 'hp', flat: 150 }], [{ stat: 'hp', flat: 200 }], [{ stat: 'hp', flat: 300 }]],
  passive: { t: 'stat', stat: 'atk', pctByImprint: [100, 120, 140, 160, 180, 200] },
};

function sem<K extends keyof typeof valido>(chave: K) {
  const copia: Record<string, unknown> = { ...valido };
  delete copia[chave];
  return copia;
}

describe('artifacts.schema', () => {
  it('aceita um artefato completo', () => {
    expect(artifactSchema.safeParse(valido).success).toBe(true);
  });

  it('signatureOf é obrigatório: todo artefato é assinatura de alguém', () => {
    expect(artifactSchema.safeParse(sem('signatureOf')).success).toBe(false);
  });

  it('a trava por classe é forma: artefato sem classId é recusado', () => {
    expect(artifactSchema.safeParse(sem('classId')).success).toBe(false);
  });

  it('rank de base é adventurer ou hero — legend não é base, e o rank é obrigatório', () => {
    expect(artifactSchema.safeParse({ ...valido, rank: 'adventurer' }).success).toBe(true);
    expect(artifactSchema.safeParse({ ...valido, rank: 'legend' }).success).toBe(false);
    expect(artifactSchema.safeParse(sem('rank')).success).toBe(false);
  });

  it('estado de conta não mora no catálogo: awakening, imprint e rank corrente são recusados', () => {
    expect(artifactSchema.safeParse({ ...valido, awakening: 3 }).success).toBe(false);
    expect(artifactSchema.safeParse({ ...valido, imprint: 1 }).success).toBe(false);
    expect(artifactSchema.safeParse({ ...valido, currentRank: 'legend' }).success).toBe(false);
  });

  it('as curvas têm exatamente 7 degraus de awakening e 6 de imprint', () => {
    expect(artifactSchema.safeParse({ ...valido, atkByAwakening: [1, 2, 3] }).success).toBe(false);
    expect(artifactSchema.safeParse({ ...valido, variableStat: { stat: 'def', byAwakening: [1] } }).success).toBe(false);
    expect(artifactSchema.safeParse({ ...valido, imprintFlat: [[]] }).success).toBe(false);
    expect(
      artifactSchema.safeParse({ ...valido, passive: { t: 'stat', stat: 'atk', pctByImprint: [1, 2] } }).success,
    ).toBe(false);
  });

  it('as curvas não descem: awakening e imprint nunca tiram poder', () => {
    expect(artifactSchema.safeParse({ ...valido, atkByAwakening: [30, 40, 50, 40, 70, 80, 100] }).success).toBe(false);
    expect(
      artifactSchema.safeParse({ ...valido, passive: { t: 'stat', stat: 'atk', pctByImprint: [100, 90, 140, 160, 180, 200] } }).success,
    ).toBe(false);
  });

  it('o stat variável não pode ser atk: o fixo já é atk', () => {
    expect(artifactSchema.safeParse({ ...valido, variableStat: { stat: 'atk', byAwakening: valido.variableStat.byAwakening } }).success).toBe(false);
  });

  it('o imprint só mexe em NÚMERO: a passiva é uma só, sem efeito por nível', () => {
    expect(
      artifactSchema.safeParse({
        ...valido,
        passive: { t: 'stat', stat: 'atk', pctByImprint: [100, 120, 140, 160, 180, 200], effectsByImprint: [[], ['novo']] },
      }).success,
    ).toBe(false);
    expect(artifactSchema.safeParse({ ...valido, passives: [valido.passive, valido.passive] }).success).toBe(false);
  });

  it('as três passivas do vocabulário fechado', () => {
    expect(
      artifactSchema.safeParse({ ...valido, passive: { t: 'startingPool', pool: 'pp', amountByImprint: [1, 1, 1, 2, 2, 2] } }).success,
    ).toBe(true);
    expect(
      artifactSchema.safeParse({ ...valido, passive: { t: 'reaction', skillId: 'skill-x', multiplierByImprint: [500, 550, 600, 650, 700, 800] } }).success,
    ).toBe(true);
    expect(artifactSchema.safeParse({ ...valido, passive: { t: 'reaction', skillId: 'skill-x' } }).success).toBe(true);
    expect(artifactSchema.safeParse({ ...valido, passive: { t: 'regenAp', n: 1 } }).success).toBe(false);
  });
});

describe('materials.schema — o fragmento de artefato', () => {
  it('artifactFragment exige forArtifactId e proíbe forCharacterId', () => {
    expect(materialSchema.safeParse({ id: 'f', name: 'F', kind: 'artifactFragment', forArtifactId: 'artifact-x' }).success).toBe(true);
    expect(materialSchema.safeParse({ id: 'f', name: 'F', kind: 'artifactFragment' }).success).toBe(false);
    expect(
      materialSchema.safeParse({ id: 'f', name: 'F', kind: 'artifactFragment', forArtifactId: 'a', forCharacterId: 'c' }).success,
    ).toBe(false);
  });

  it('os outros kinds recusam forArtifactId', () => {
    expect(materialSchema.safeParse({ id: 'f', name: 'F', kind: 'heroFragment', forCharacterId: 'c', forArtifactId: 'a' }).success).toBe(false);
    expect(materialSchema.safeParse({ id: 'f', name: 'F', kind: 'awakening', forArtifactId: 'a' }).success).toBe(false);
  });
});

describe('heroes.schema — o 7º slot', () => {
  const heroi = {
    id: 'h',
    classId: 'class-x',
    level: 1,
    exp: 0,
    awakening: 0,
    imprint: 0,
    talents: {},
    equipment: { weapon: null, helmet: null, armor: null, necklace: null, ring: null, boots: null },
    weaponType: 'sword',
    duelSkills: [],
    mapSkills: [],
    tacticsScript: [],
  };

  it('herói sem o campo, com null e com uma instância são todos válidos', () => {
    expect(heroSchema.safeParse(heroi).success).toBe(true);
    expect(heroSchema.safeParse({ ...heroi, artifact: null }).success).toBe(true);
    expect(heroSchema.safeParse({ ...heroi, artifact: 'art-inst-1' }).success).toBe(true);
  });

  it('o artefato NÃO é slot de `equipment`', () => {
    const parsed = heroSchema.safeParse({ ...heroi, equipment: { ...heroi.equipment, artifact: 'x' } });
    // `equipment` descarta chave desconhecida ou recusa; nunca a guarda como slot de gear.
    if (parsed.success) expect('artifact' in parsed.data.equipment).toBe(false);
  });
});
