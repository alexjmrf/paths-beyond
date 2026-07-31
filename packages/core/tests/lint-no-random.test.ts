import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const SCRIPT_PATH = join(here, '..', '..', '..', 'scripts', 'check-no-random.mjs');

function runCheck(targetDir: string): { status: number; stdout: string; stderr: string } {
  try {
    const stdout = execFileSync('node', [SCRIPT_PATH, targetDir], { encoding: 'utf8' });
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
});
