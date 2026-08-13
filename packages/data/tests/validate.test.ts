import { readFileSync } from 'node:fs';
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
import encounterSchema from '../schemas/encounters.schema.js';
import { findJsonFiles, validateDataset, validateFiles } from '../validate.js';

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

describe('validateDataset() against real packages/data content', () => {
  it('finds the 18 schemas (5 de M1 + 2 de M2 + 3 de M3 + 3 de M4 + 1 de M5: builds + 1 de M7: weapon-duel-ranges + 1 de M8: comps + 1 de M8: arena-shop + 1 de M12: encounters) e valida o conteúdo real de M8+M9+M10+M11+M12 (10 classes [9 base + 1 promovida] + 28 skills [26 + as 2 skills de mapa em área de M12 sub-sessão 3] + 12 efeitos + 1 tabela de alcance + 9 comps + 7 mapas [1 arena + os 6 da campanha real de M12 sub-sessão 3, que aposentaram os 3 provisórios de M9] + 3 terrenos + 11 itens + 6 sets + 4 ofertas de loja + 3 valor-skills + 6 encounters [os 6 capítulos de M12 sub-sessão 3] = 100 arquivos)', async () => {
    const report = await validateDataset(packageRoot);
    expect(report).toMatchObject({ ok: true, schemasFound: 18, filesChecked: 100 });
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
  ['encounters', encounterSchema],
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

// §5.7 (M11, sub-sessão 1/N) — as 5 condições de vitória passaram a ter resolução no
// motor. O schema já aceitava as 5 formas desde M3; o que mudou aqui é `defend`, que
// ganhou `target` — sem ele seria um sinônimo de `surviveRounds` (decisão do usuário,
// ver DECISIONS.md). Este bloco trava a forma de cada uma: um mapa com condição malformada
// entraria como conteúdo válido e só falharia como partida sem desfecho possível.
describe('maps.schema.ts — condições de vitória (§5.7)', () => {
  const winConditionOf = (map: unknown): unknown => (mapSchema.parse(map) as { winCondition: unknown }).winCondition;

  function mapWith(winCondition: unknown): unknown {
    const tiles = Array.from({ length: 15 }, () =>
      Array.from({ length: 15 }, () => ({ terrain: 'plain', height: 0 })),
    );
    return {
      id: 'map-fixture-condicoes',
      name: 'Fixture',
      width: 15,
      height: 15,
      tiles,
      terrains: {
        plain: {
          id: 'plain',
          moveCost: { foot: 1, cavalry: 1, flying: 1, heavy: 1, aquatic: 2 },
          defBonus: 0,
          evaBonus: 0,
          blocksSight: false,
        },
      },
      zocEnabled: true,
      winCondition,
      initialValor: 5,
    };
  }

  it('aceita as 5 formas de §5.7', () => {
    expect(winConditionOf(mapWith({ t: 'rout' }))).toEqual({ t: 'rout' });
    expect(winConditionOf(mapWith({ t: 'seize', target: { x: 7, y: 7 } }))).toMatchObject({ t: 'seize' });
    expect(winConditionOf(mapWith({ t: 'surviveRounds', n: 5 }))).toMatchObject({ t: 'surviveRounds', n: 5 });
    expect(winConditionOf(mapWith({ t: 'escort', unitId: 'unit-vip', target: { x: 7, y: 7 } }))).toMatchObject({ t: 'escort' });
    expect(winConditionOf(mapWith({ t: 'defend', rounds: 5, target: { x: 7, y: 7 } }))).toMatchObject({ t: 'defend', rounds: 5 });
  });

  it('rejeita `defend` sem `target` — seria um sinônimo de surviveRounds', () => {
    expect(() => mapSchema.parse(mapWith({ t: 'defend', rounds: 5 }))).toThrow();
  });

  it('rejeita as demais condições sem os campos que a resolução exige', () => {
    expect(() => mapSchema.parse(mapWith({ t: 'seize' }))).toThrow();
    expect(() => mapSchema.parse(mapWith({ t: 'surviveRounds' }))).toThrow();
    expect(() => mapSchema.parse(mapWith({ t: 'escort', target: { x: 7, y: 7 } }))).toThrow();
    expect(() => mapSchema.parse(mapWith({ t: 'defend', target: { x: 7, y: 7 } }))).toThrow();
  });

  // M12, sub-sessão 3/N — o gap fechou: até M11 os 4 mapas reais eram todos `rout` e as
  // outras 4 condições existiam só no schema. A campanha real usa as 5 (a de `escort` é
  // declarada no encounter, que sobrepõe o `seize` do layout).
  it('os mapas reais do catálogo usam mais de uma condição de vitória', () => {
    const files = findJsonFiles(join(packageRoot, 'maps'));
    expect(files.length).toBeGreaterThan(0);

    const byId = new Map<string, string>();
    for (const file of files) {
      const parsed = mapSchema.parse(JSON.parse(readFileSync(file, 'utf8'))) as {
        id: string;
        winCondition: { t: string };
      };
      byId.set(parsed.id, parsed.winCondition.t);
    }

    expect(byId.get('map-arena-coliseu')).toBe('rout'); // §9.2 — arena de PvP é sempre rout
    expect([...byId.entries()].filter(([id]) => id.startsWith('map-campanha-')).map(([, t]) => t)).toEqual([
      'rout',
      'seize',
      'defend',
      'surviveRounds',
      'seize', // capítulo 5: o encounter sobrepõe com `escort`
      'rout',
    ]);
  });
});

// §5.6 (M11, sub-sessão 3/N) — o `payload` das valor-skills era um record solto desde M3,
// quando nenhum `kind` tinha resolução no motor. Com três resolvidos, um payload sem forma
// passou a ser a mesma classe de bug do `defend` sem `target`: valida e não faz nada.
describe('valor-skills.schema.ts — payload tipado por kind (§5.6)', () => {
  const base = { id: 'valor-fixture', name: 'Fixture', cost: 2 };

  it('aceita os payloads dos três kinds resolvidos', () => {
    expect(() => valorSkillSchema.parse({ ...base, kind: 'restoreApPp', payload: { ap: 2, pp: 1 } })).not.toThrow();
    expect(() => valorSkillSchema.parse({ ...base, kind: 'artillery', payload: { damage: 400, radius: 1 } })).not.toThrow();
    expect(() => valorSkillSchema.parse({ ...base, kind: 'globalBuff', payload: { effectId: 'effect-x' } })).not.toThrow();
  });

  it('rejeita payload que não bate com o kind', () => {
    expect(() => valorSkillSchema.parse({ ...base, kind: 'restoreApPp', payload: { damage: 400, radius: 1 } })).toThrow();
    expect(() => valorSkillSchema.parse({ ...base, kind: 'artillery', payload: { ap: 2, pp: 1 } })).toThrow();
    expect(() => valorSkillSchema.parse({ ...base, kind: 'globalBuff', payload: {} })).toThrow();
  });

  it('rejeita artilharia sem dano e com raio negativo', () => {
    expect(() => valorSkillSchema.parse({ ...base, kind: 'artillery', payload: { damage: 0, radius: 1 } })).toThrow();
    expect(() => valorSkillSchema.parse({ ...base, kind: 'artillery', payload: { damage: 400, radius: -1 } })).toThrow();
  });

  it('`summonReinforcement` continua com payload solto — não tem resolução para dar forma', () => {
    expect(() => valorSkillSchema.parse({ ...base, kind: 'summonReinforcement', payload: {} })).not.toThrow();
  });

  it('rejeita custo zero ou negativo — uma skill de Valor grátis não é um recurso', () => {
    expect(() => valorSkillSchema.parse({ ...base, cost: 0, kind: 'restoreApPp', payload: { ap: 1, pp: 1 } })).toThrow();
  });

  // O catálogo real: o roadmap de M11 pede "catálogo real de valor-skills resolvido de
  // verdade por useValor", então autorar aqui é escopo (ao contrário das skills de área).
  it('o catálogo real cobre os três kinds resolvidos e nenhum sem resolução', () => {
    const files = findJsonFiles(join(packageRoot, 'valor-skills'));
    const parsed = files.map((file) => valorSkillSchema.parse(JSON.parse(readFileSync(file, 'utf8'))));
    expect(parsed.map((s) => s.kind).sort()).toEqual(['artillery', 'globalBuff', 'restoreApPp']);
  });

  it('todo effectId referenciado por valor-skill existe no catálogo de efeitos', () => {
    const valorFiles = findJsonFiles(join(packageRoot, 'valor-skills'));
    const effectIds = new Set(
      findJsonFiles(join(packageRoot, 'effects')).map(
        (file) => (JSON.parse(readFileSync(file, 'utf8')) as { id: string }).id,
      ),
    );
    for (const file of valorFiles) {
      const skill = valorSkillSchema.parse(JSON.parse(readFileSync(file, 'utf8')));
      if (skill.kind !== 'globalBuff') continue;
      expect(effectIds.has(skill.payload.effectId)).toBe(true);
    }
  });
});
