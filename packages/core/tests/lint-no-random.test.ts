import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const SCRIPT_PATH = join(here, '..', '..', '..', 'scripts', 'check-no-random.mjs');

function runCheck(...targetDirs: readonly string[]): { status: number; stdout: string; stderr: string } {
  try {
    const stdout = execFileSync('node', [SCRIPT_PATH, ...targetDirs], { encoding: 'utf8' });
    return { status: 0, stdout, stderr: '' };
  } catch (error) {
    const e = error as { status: number; stdout: string; stderr: string };
    return { status: e.status, stdout: e.stdout, stderr: e.stderr };
  }
}

describe('scripts/check-no-random.mjs', () => {
  it('passes (exit 0) when no forbidden call is present', () => {
    const dir = mkdtempSync(join(tmpdir(), 'check-no-random-clean-'));
    try {
      writeFileSync(join(dir, 'clean.ts'), 'export const answer = 42;\n');
      const result = runCheck(dir);
      expect(result.status).toBe(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('fails (exit 1) when the forbidden non-deterministic call is present', () => {
    const dir = mkdtempSync(join(tmpdir(), 'check-no-random-dirty-'));
    try {
      const forbiddenCall = ['Math', 'random'].join('.') + '()';
      writeFileSync(join(dir, 'dirty.ts'), `export const roll = ${forbiddenCall};\n`);
      const result = runCheck(dir);
      expect(result.status).toBe(1);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  // D15 (M18) — `packages/gacha` está sob as mesmas regras do core, e a trava tem de
  // alcançá-lo. Sem esta asserção, alguém apagaria o alvo do padrão e o pacote de regra
  // ficaria sem guarda, sem nada ficar vermelho.
  it('varre packages/core E packages/gacha quando roda sem argumento', () => {
    const result = runCheck();

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('packages/core/src');
    expect(result.stdout).toContain('packages/gacha/src');
  });

  it('recusa mais de um diretório sujo de uma vez', () => {
    const limpo = mkdtempSync(join(tmpdir(), 'check-no-random-multi-clean-'));
    const sujo = mkdtempSync(join(tmpdir(), 'check-no-random-multi-dirty-'));
    try {
      writeFileSync(join(limpo, 'clean.ts'), 'export const answer = 42;\n');
      const forbiddenCall = ['Math', 'random'].join('.') + '()';
      writeFileSync(join(sujo, 'dirty.ts'), `export const roll = ${forbiddenCall};\n`);

      expect(runCheck(limpo, sujo).status).toBe(1);
    } finally {
      rmSync(limpo, { recursive: true, force: true });
      rmSync(sujo, { recursive: true, force: true });
    }
  });
});
