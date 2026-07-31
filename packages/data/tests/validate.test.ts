import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import sampleSchema from '../test-fixtures/sample.schema.js';
import { findJsonFiles, validateDataset, validateFiles } from '../validate.js';

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

describe('validateDataset() against real packages/data content', () => {
  it('passes trivially — no schemas/content exist yet (M1+ populates them)', async () => {
    const report = await validateDataset(packageRoot);
    expect(report).toMatchObject({ ok: true, schemasFound: 0, filesChecked: 0 });
  });
});

describe('validateFiles() against generic fixtures (proves the Zod pipeline works)', () => {
  it('accepts JSON that matches the fixture schema', () => {
    const files = findJsonFiles(join(packageRoot, 'test-fixtures', 'valid'));
    const report = validateFiles(sampleSchema, files);
    expect(report.filesChecked).toBeGreaterThan(0);
    expect(report.ok).toBe(true);
  });

  it('rejects JSON that violates the fixture schema, reporting Zod issues', () => {
    const files = findJsonFiles(join(packageRoot, 'test-fixtures', 'invalid'));
    const report = validateFiles(sampleSchema, files);
    expect(report.ok).toBe(false);
    expect(report.errors.length).toBeGreaterThan(0);
    expect(report.errors[0]?.issues.length).toBeGreaterThan(0);
  });
});
