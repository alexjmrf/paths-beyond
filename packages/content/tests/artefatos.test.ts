import { describe, expect, it } from 'vitest';
import { resolveHeroCombatProfile } from '@paths-beyond/core';
import { buildCatalog } from '../src/buildCatalog.js';
import { loadCatalogFromDisk, readContentFilesFromDisk } from '../src/loadCatalogFromDisk.js';

// M38 2/N (D53/D54) — o artefato conversando com o resto do catálogo. O schema valida cada
// arquivo sozinho; o que cruza tipos (o dono existe? a classe é a dele? a skill da passiva
// existe e é reação?) é trabalho de `buildCatalog`, e falha ALTO na carga.

const catalog = loadCatalogFromDisk();
const artefatos = Object.values(catalog.artifacts);

function comArtefatoAlterado(id: string, patch: Record<string, unknown>) {
  const files = readContentFilesFromDisk();
  return () =>
    buildCatalog({
      ...files,
      artifacts: files.artifacts.map((raw) => ((raw as { id: string }).id === id ? { ...(raw as object), ...patch } : raw)),
    });
}

describe('o catálogo carrega os artefatos', () => {
  it('15, indexados por id', () => {
    expect(artefatos).toHaveLength(15);
    for (const [id, a] of Object.entries(catalog.artifacts)) expect(a.id).toBe(id);
  });

  it('a tabela de evolução do artefato chega ao catálogo', () => {
    expect(catalog.economyRules.artifactAwakening).toHaveLength(6);
    expect(catalog.economyRules.artifactImprint).toHaveLength(5);
  });
});

describe('as referências cruzadas falham alto', () => {
  const alvo = 'artifact-lamina-do-juramento';

  it('dono que não existe no elenco', () => {
    expect(comArtefatoAlterado(alvo, { signatureOf: 'ally-ninguem' })).toThrow(/elenco/);
  });

  it('classe diferente da do dono', () => {
    expect(comArtefatoAlterado(alvo, { classId: 'class-arqueiro' })).toThrow(/classe/);
  });

  it('rank diferente do do dono', () => {
    expect(comArtefatoAlterado(alvo, { rank: 'adventurer' })).toThrow(/rank/);
  });

  it('passiva de reação com skill que não existe, ou que não é reação', () => {
    expect(comArtefatoAlterado(alvo, { passive: { t: 'reaction', skillId: 'skill-inexistente' } })).toThrow(/skill/);
    expect(comArtefatoAlterado(alvo, { passive: { t: 'reaction', skillId: 'skill-ataque-espadachim' } })).toThrow(/reação/);
  });

  it('dois artefatos para o mesmo dono', () => {
    expect(comArtefatoAlterado('artifact-broquel-de-sena', { signatureOf: 'hero-jogador', rank: 'hero' })).toThrow(/dois artefatos|mesmo dono/);
  });
});

describe('o artefato real resolve pelo core', () => {
  it('cada um resolve no herói do próprio dono, com a ficha inicial dele', () => {
    for (const a of artefatos) {
      const dono = catalog.characters[a.signatureOf]!;
      const classDef = catalog.classes[dono.classId]!;
      const semArtefato = resolveHeroCombatProfile({
        hero: { id: 'h', characterId: dono.id, classId: dono.classId, level: 10, exp: 0, awakening: 0, imprint: 0, talents: {},
          equipment: { weapon: null, helmet: null, armor: null, necklace: null, ring: null, boots: null },
          weaponType: classDef.allowedWeapons[0]!, duelSkills: [], mapSkills: [], tacticsScript: [] },
        classDef, equippedItems: [], itemSets: catalog.itemSets, talentTree: [], skillsCatalog: catalog.skills,
        weaponDuelRanges: catalog.weaponDuelRanges, baselineReactionSkillIds: catalog.baselineReactionSkillIds,
      });
      const comArtefato = resolveHeroCombatProfile({
        hero: { id: 'h', characterId: dono.id, classId: dono.classId, level: 10, exp: 0, awakening: 0, imprint: 0, talents: {},
          equipment: { weapon: null, helmet: null, armor: null, necklace: null, ring: null, boots: null },
          weaponType: classDef.allowedWeapons[0]!, duelSkills: [], mapSkills: [], tacticsScript: [] },
        classDef, equippedItems: [], itemSets: catalog.itemSets, talentTree: [], skillsCatalog: catalog.skills,
        weaponDuelRanges: catalog.weaponDuelRanges, baselineReactionSkillIds: catalog.baselineReactionSkillIds,
        artifact: { def: a, instance: { id: 'i', artifactId: a.id, awakening: 0, imprint: 0 } },
      });
      expect(comArtefato.stats.atk, a.id).toBeGreaterThan(semArtefato.stats.atk);
    }
  });
});

// M38 5/N — o artefato declarado na unidade de comp cruza com o catálogo na CARGA.
describe('o artefato da comp falha alto na carga', () => {
  function comArtefatoNaComp(artifactId: string) {
    const files = readContentFilesFromDisk();
    return () =>
      buildCatalog({
        ...files,
        comps: files.comps.map((raw, i) => {
          if (i !== 0) return raw;
          const comp = raw as { units: Record<string, unknown>[] };
          return { ...comp, units: comp.units.map((u, j) => (j === 0 ? { ...u, artifactId } : u)) };
        }),
      });
  }

  it('artefato que não existe', () => {
    expect(comArtefatoNaComp('artifact-que-nao-existe')).toThrow(/não existe/);
  });

  it('artefato de outra classe', () => {
    // A primeira unidade da primeira comp (ordem do disco) é o Dorn, clérigo; a Lança-Muralha é de lanceiro.
    expect(comArtefatoNaComp('artifact-lanca-muralha')).toThrow(/classe/);
  });

  it('o artefato declarado chega à comp do catálogo', () => {
    for (const comp of catalog.comps) {
      for (const unit of comp.units) expect(unit.artifactId, `${comp.id}/${unit.hero.id}`).toBeDefined();
    }
  });
});
