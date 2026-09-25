import { loadCatalogFromDisk } from '@paths-beyond/content';
import { describe, expect, it } from 'vitest';
import { runArtifactDelta, runTournament, toPlacements } from '../src/runTournament.js';

// M38 5/N — a medição COM artefato e o DELTA do artefato.
//
// Cada unidade leva o artefato que a comp declara (`artifactId`, da classe dela), em awakening 3
// e imprint 0 (decisão do usuário: o mínimo em que todos ficam no rank corrente Hero, o mesmo
// método do M37). Sem a opção, o torneio é o de sempre — a base da comparação.

const content = loadCatalogFromDisk();
const TIER = { awakening: 3, imprint: 0 } as const;
const comp = content.comps.find((c) => c.id === 'comp-guerreiro')!;

describe('toPlacements com artefato', () => {
  it('cada unidade leva o artefato DECLARADO na comp, no tier da medição', () => {
    const placements = toPlacements(comp, content, 'player', 0, TIER);
    comp.units.forEach((unit, i) => {
      const artifact = placements[i]!.artifact;
      expect(artifact?.def.id).toBe(unit.artifactId);
      expect(artifact?.instance).toMatchObject({ artifactId: unit.artifactId, awakening: 3, imprint: 0 });
    });
  });

  it('sem a opção, nenhuma unidade leva artefato — o torneio de sempre', () => {
    for (const placement of toPlacements(comp, content, 'player', 0)) expect(placement.artifact).toBeUndefined();
  });

  it('unidade sem artefato declarado faz a medição COM artefato falhar alto', () => {
    const sem = { ...comp, units: comp.units.map(({ artifactId: _fora, ...u }) => u) };
    expect(() => toPlacements(sem, content, 'player', 0, TIER)).toThrow(/artefato/);
  });
});

describe('o torneio com artefato', () => {
  it('é determinístico e diferente do sem artefato', () => {
    const a = runTournament(content, { runsPerPairing: 2, masterSeed: 7, artefatos: TIER });
    const b = runTournament(content, { runsPerPairing: 2, masterSeed: 7, artefatos: TIER });
    const sem = runTournament(content, { runsPerPairing: 2, masterSeed: 7 });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    // O artefato muda status (`atk` fixo + um stat): a mesma seed tem de dar outro torneio.
    expect(JSON.stringify(a)).not.toBe(JSON.stringify(sem));
  });
});

describe('o delta do artefato — cada comp contra ela mesma sem', () => {
  it('uma linha por comp, metade das partidas atacando com artefato e metade defendendo', () => {
    const delta = runArtifactDelta(content, { runsPerPairing: 4, masterSeed: 3, artefatos: TIER });
    expect(delta.map((d) => d.compId).sort()).toEqual(content.comps.map((c) => c.id).sort());
    for (const linha of delta) {
      expect(linha.comoAtacante.total).toBe(4);
      expect(linha.comoDefensor.total).toBe(4);
      expect(linha.comoAtacante.vitoriasComArtefato).toBeLessThanOrEqual(4);
      expect(linha.comoDefensor.vitoriasComArtefato).toBeLessThanOrEqual(4);
    }
  });

  it('o espelho DECIDE partidas — os dois lados não podem colidir nos ids de unidade', () => {
    // Defeito real da primeira medição: a comp contra ela mesma punha `heroi-x-1` dos dois
    // lados, e o delta saiu 0,0% para todas. Uma medição em que ninguém vence não mede nada.
    const delta = runArtifactDelta(content, { runsPerPairing: 4, masterSeed: 3, artefatos: TIER });
    const decididas = delta.reduce(
      (t, l) =>
        t +
        l.comoAtacante.vitoriasComArtefato +
        l.comoAtacante.vitoriasSemArtefato +
        l.comoDefensor.vitoriasComArtefato +
        l.comoDefensor.vitoriasSemArtefato,
      0,
    );
    expect(decididas).toBeGreaterThan(0);
  });

  it('toPlacements do lado espelhado dá ids de unidade distintos', () => {
    const a = toPlacements(comp, content, 'player', 0).map((p) => p.unitId);
    const b = toPlacements(comp, content, 'enemy', 6, undefined, '-espelho').map((p) => p.unitId);
    expect(a.some((id) => b.includes(id))).toBe(false);
  });

  it('é determinístico', () => {
    const a = runArtifactDelta(content, { runsPerPairing: 3, masterSeed: 9, artefatos: TIER });
    const b = runArtifactDelta(content, { runsPerPairing: 3, masterSeed: 9, artefatos: TIER });
    expect(a).toEqual(b);
  });
});
