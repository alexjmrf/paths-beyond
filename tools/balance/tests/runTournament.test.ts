import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { loadBalanceContent } from '../src/loadContent.js';
import { runTournament } from '../src/runTournament.js';

// M8, sub-sessão 2/N: `loadBalanceContent()` sem argumentos agora aponta pro conteúdo
// REAL de `packages/data/` (7 classes/comps autoria desta fatia), não mais pros fixtures
// sintéticos de `test-fixtures/` usados na primeira sub-sessão. Os testes de regressão
// abaixo apontam explicitamente pra `test-fixtures/` (layout `valid-subdir`, o layout
// antigo) pra provar que a parametrização não quebrou o comportamento original.
function testFixturesDir(): string {
  const hereDir = fileURLToPath(new URL('.', import.meta.url)); // tools/balance/tests/
  return join(hereDir, '..', '..', '..', 'packages', 'data', 'test-fixtures');
}

describe('loadBalanceContent() — conteúdo real de packages/data (default)', () => {
  it('encontra as 9 composições reais de M8, com classes e skills resolvíveis', () => {
    const content = loadBalanceContent();
    expect(content.comps.length).toBe(9);
    for (const comp of content.comps) {
      for (const unit of comp.units) {
        expect(content.classes[unit.hero.classId]).toBeDefined();
        for (const skillId of unit.hero.duelSkills) {
          expect(content.skills[skillId]).toBeDefined();
        }
      }
    }
  });

  it('carrega um GridMap com terrenos resolvidos (não strings soltas)', () => {
    const content = loadBalanceContent();
    expect(content.map.grid.width).toBeGreaterThan(0);
    const firstTile = content.map.grid.tiles[0]?.[0];
    expect(firstTile).toBeDefined();
    expect(content.map.grid.terrains[firstTile!.terrain]).toBeDefined();
  });
});

describe('loadBalanceContent({ rootDir, layout: "valid-subdir" }) — regressão contra test-fixtures/', () => {
  it('continua encontrando as 3 composições sintéticas da primeira sub-sessão', () => {
    const content = loadBalanceContent({ rootDir: testFixturesDir(), layout: 'valid-subdir' });
    expect(content.comps.length).toBeGreaterThanOrEqual(2);
    for (const comp of content.comps) {
      for (const unit of comp.units) {
        expect(content.classes[unit.hero.classId]).toBeDefined();
      }
    }
  });
});

describe('runTournament', () => {
  it('roda runsPerPairing batalhas pra cada par ORDENADO de composições distintas', () => {
    const content = loadBalanceContent({ rootDir: testFixturesDir(), layout: 'valid-subdir' });
    const runsPerPairing = 3;
    const records = runTournament(content, { runsPerPairing, masterSeed: 42 });

    const n = content.comps.length;
    const expectedOrderedPairs = n * (n - 1); // A->B e B->A contam separado
    expect(records).toHaveLength(expectedOrderedPairs * runsPerPairing);

    for (const record of records) {
      expect(record.attackerCompId).not.toBe(record.defenderCompId);
      expect(['victory', 'defeat', 'ongoing']).toContain(record.outcome);
    }
  });

  it('é determinístico: o mesmo masterSeed produz exatamente o mesmo torneio duas vezes', () => {
    const content = loadBalanceContent();
    const a = runTournament(content, { runsPerPairing: 5, masterSeed: 7 });
    const b = runTournament(content, { runsPerPairing: 5, masterSeed: 7 });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('masterSeed diferente produz seeds de batalha diferentes', () => {
    // Testa a geração de seed diretamente (não o resultado do combate): com composições
    // muito desiguais, o vencedor pode ser sempre o mesmo em toda seed, mesmo com
    // rolagens de dano diferentes por baixo — comparar `outcome` seria um teste frágil.
    const content = loadBalanceContent();
    const a = runTournament(content, { runsPerPairing: 5, masterSeed: 1 });
    const b = runTournament(content, { runsPerPairing: 5, masterSeed: 2 });
    expect(a.map((r) => r.seed)).not.toEqual(b.map((r) => r.seed));
  });

  it('toda unidade que participa da batalha tem stats reais resolvidos (spd > 0)', () => {
    const content = loadBalanceContent();
    const records = runTournament(content, { runsPerPairing: 1, masterSeed: 1 });
    for (const record of records) {
      for (const spd of record.allUnitsSpd) {
        expect(spd).toBeGreaterThan(0);
      }
    }
  });
});
