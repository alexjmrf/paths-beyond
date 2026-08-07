import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { runStatSheetCommand } from '../src/statSheet.js';

function testFixturesDir(): string {
  const hereDir = fileURLToPath(new URL('.', import.meta.url)); // packages/sim-cli/tests/
  return join(hereDir, '..', '..', 'data', 'test-fixtures');
}

function heroFixturePath(): string {
  return join(testFixturesDir(), 'heroes', 'valid', 'heroi-teste.json');
}

describe('sim stat-sheet — M9 sub-sessão 4/4', () => {
  it('resolve o StatSheet de um herói real contra o catálogo de test-fixtures e imprime um hash', () => {
    const output = runStatSheetCommand({ heroFile: heroFixturePath(), catalogDir: testFixturesDir(), catalogLayout: 'valid-subdir' });
    expect(output).toContain('Herói: hero-teste (class-soldado)');
    expect(output).toMatch(/Hash: [0-9a-f]{8}/);
  });

  it('é determinístico — mesmo herói e mesmo catálogo produzem o mesmo hash duas vezes', () => {
    const a = runStatSheetCommand({ heroFile: heroFixturePath(), catalogDir: testFixturesDir(), catalogLayout: 'valid-subdir' });
    const b = runStatSheetCommand({ heroFile: heroFixturePath(), catalogDir: testFixturesDir(), catalogLayout: 'valid-subdir' });
    expect(a).toBe(b);
  });

  it('lista todos os 13 stats no output', () => {
    const output = runStatSheetCommand({ heroFile: heroFixturePath(), catalogDir: testFixturesDir(), catalogLayout: 'valid-subdir' });
    for (const stat of ['hp', 'atk', 'def', 'spd', 'chc', 'chd', 'eff', 'efr', 'pen', 'heal', 'lifesteal', 'focus', 'vigor']) {
      expect(output).toContain(`${stat}:`);
    }
  });

  it('rejeita classe desconhecida no catálogo', () => {
    const rawHero = JSON.parse(readFileSync(heroFixturePath(), 'utf8'));
    const withUnknownClass = JSON.stringify({ ...rawHero, classId: 'class-inexistente' });

    expect(() =>
      runStatSheetCommand({ heroFile: 'hero-modificado.json', catalogDir: testFixturesDir(), catalogLayout: 'valid-subdir' }, (path) => {
        if (path !== 'hero-modificado.json') throw new Error(`arquivo não simulado: ${path}`);
        return withUnknownClass;
      }),
    ).toThrow(/classe desconhecida/);
  });
});
