import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import sampleSchema from '../test-fixtures/sample.schema.js';
import classSchema from '../schemas/classes.schema.js';
import skillSchema from '../schemas/skills.schema.js';
import itemSchema from '../schemas/items.schema.js';
import itemSetSchema from '../schemas/item-sets.schema.js';
import heroSchema from '../schemas/heroes.schema.js';
import effectSchema from '../schemas/effects.schema.js';
import duelParticipantSchema from '../schemas/duel-participants.schema.js';
import mapSchema from '../schemas/maps.schema.js';
import terrainSchema from '../schemas/terrains.schema.js';
import valorSkillSchema from '../schemas/valor-skills.schema.js';
import substatWeightsSchema from '../schemas/substat-weights.schema.js';
import mainstatWeightsSchema from '../schemas/mainstat-weights.schema.js';
import enhanceRatesSchema from '../schemas/enhance-rates.schema.js';
import buildSchema from '../schemas/builds.schema.js';
import weaponDuelRangesSchema from '../schemas/weapon-duel-ranges.schema.js';
import compSchema from '../schemas/comps.schema.js';
import { findJsonFiles, validateDataset, validateFiles } from '../validate.js';

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

describe('validateDataset() against real packages/data content', () => {
  it('finds the 17 schemas (5 de M1 + 2 de M2 + 3 de M3 + 3 de M4 + 1 de M5: builds + 1 de M7: weapon-duel-ranges + 1 de M8: comps + 1 de M8: arena-shop) e valida o conteúdo real de M8+M9+M10 (10 classes [9 base + 1 promovida] + 23 skills [22 + skill-assistir, M10 sub-sessão 4] + 1 efeito + 1 tabela de alcance + 9 comps + 4 mapas [1 real + 3 provisórios de campanha, M9 sub-sessão 3] + 3 terrenos [1 real + 2 portados de campanha, M9] + 11 itens + 2 sets + 4 ofertas de loja = 68 arquivos)', async () => {
    const report = await validateDataset(packageRoot);
    expect(report).toMatchObject({ ok: true, schemasFound: 17, filesChecked: 68 });
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

describe.each([
  ['classes', classSchema],
  ['skills', skillSchema],
  ['items', itemSchema],
  ['item-sets', itemSetSchema],
  ['heroes', heroSchema],
  ['effects', effectSchema],
  ['duel-participants', duelParticipantSchema],
  ['maps', mapSchema],
  ['terrains', terrainSchema],
  ['valor-skills', valorSkillSchema],
  ['substat-weights', substatWeightsSchema],
  ['mainstat-weights', mainstatWeightsSchema],
  ['enhance-rates', enhanceRatesSchema],
  ['builds', buildSchema],
  ['weapon-duel-ranges', weaponDuelRangesSchema],
  ['comps', compSchema],
] as const)('%s.schema.ts against packages/data/test-fixtures/%s', (type, schema) => {
  it('accepts the valid fixture(s)', () => {
    const files = findJsonFiles(join(packageRoot, 'test-fixtures', type, 'valid'));
    expect(files.length).toBeGreaterThan(0);
    const report = validateFiles(schema, files);
    expect(report.ok).toBe(true);
  });

  it('rejects the invalid fixture(s), reporting Zod issues', () => {
    const files = findJsonFiles(join(packageRoot, 'test-fixtures', type, 'invalid'));
    expect(files.length).toBeGreaterThan(0);
    const report = validateFiles(schema, files);
    expect(report.ok).toBe(false);
    expect(report.errors.length).toBeGreaterThan(0);
    expect(report.errors[0]?.issues.length).toBeGreaterThan(0);
  });
});
