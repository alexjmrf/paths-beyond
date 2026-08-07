import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadCatalogFromDisk } from '@paths-beyond/content';
import { describe, expect, it } from 'vitest';
import { runTournament } from '../src/runTournament.js';

// M9, sub-sessão 1/N: `loadBalanceContent()` (tools/balance) virou `loadCatalogFromDisk()`
// (@paths-beyond/content) — mesmo comportamento, carregando por padrão o conteúdo REAL de
// `packages/data/`. Os testes de carregamento em si (incluindo a regressão contra
// `test-fixtures/`) moraram pra `packages/content/tests/`; o que resta aqui é
// especificamente `runTournament`, que só precisa de UM catálogo carregado pra rodar.
function testFixturesDir(): string {
  const hereDir = fileURLToPath(new URL('.', import.meta.url)); // tools/balance/tests/
  return join(hereDir, '..', '..', '..', 'packages', 'data', 'test-fixtures');
}

describe('runTournament', () => {
  it('roda runsPerPairing batalhas pra cada par ORDENADO de composições distintas', () => {
    const content = loadCatalogFromDisk({ rootDir: testFixturesDir(), layout: 'valid-subdir' });
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
    const content = loadCatalogFromDisk();
    const a = runTournament(content, { runsPerPairing: 5, masterSeed: 7 });
    const b = runTournament(content, { runsPerPairing: 5, masterSeed: 7 });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('masterSeed diferente produz seeds de batalha diferentes', () => {
    // Testa a geração de seed diretamente (não o resultado do combate): com composições
    // muito desiguais, o vencedor pode ser sempre o mesmo em toda seed, mesmo com
    // rolagens de dano diferentes por baixo — comparar `outcome` seria um teste frágil.
    const content = loadCatalogFromDisk();
    const a = runTournament(content, { runsPerPairing: 5, masterSeed: 1 });
    const b = runTournament(content, { runsPerPairing: 5, masterSeed: 2 });
    expect(a.map((r) => r.seed)).not.toEqual(b.map((r) => r.seed));
  });

  it('toda unidade que participa da batalha tem stats reais resolvidos (spd > 0)', () => {
    const content = loadCatalogFromDisk();
    const records = runTournament(content, { runsPerPairing: 1, masterSeed: 1 });
    for (const record of records) {
      for (const spd of record.allUnitsSpd) {
        expect(spd).toBeGreaterThan(0);
      }
    }
  });
});
