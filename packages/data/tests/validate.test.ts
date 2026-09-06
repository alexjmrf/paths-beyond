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
import characterSchema from '../schemas/characters.schema.js';
import { findJsonFiles, validateDataset, validateFiles } from '../validate.js';

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

describe('validateDataset() against real packages/data content', () => {
  it('finds the 30 schemas (5 de M1 + 2 de M2 + 3 de M3 + 3 de M4 + 1 de M5: builds + 1 de M7: weapon-duel-ranges + 1 de M8: comps + 1 de M8: arena-shop + 1 de M12: encounters + 4 de M14: dungeons, dungeon-encounters, materials, economy-rules + 1 de M15: summon-blueprints + 3 de M17: character-talent-trees [o motor da árvore de duas colunas entrou na 1/N, sem dado] e characters [o elenco fechado que a 2/N autorou] e enemies [o inimigo de fase autorado direto, 3/N] + 3 de M18: banners [o banner de invocação, 2/N] e achievements e events [as duas fontes novas da moeda premium, 4/N]) e valida o conteúdo real de M8+M9+M10+M11+M12+M14+M15+M17 (10 classes [9 base + 1 promovida] + 28 skills [26 + as 2 skills de mapa em área de M12 sub-sessão 3] + 12 efeitos + 1 tabela de alcance + 9 comps + 7 mapas [1 arena + os 6 da campanha real de M12 sub-sessão 3, que aposentaram os 3 provisórios de M9] + 3 terrenos + 11 itens + 6 sets + 4 ofertas de loja + 4 valor-skills [3 + a invocação de M15 2/N] + 6 encounters [os 6 capítulos de M12 sub-sessão 3] + 8 masmorras + 8 encounters de masmorra + 10 materiais [2 de M14 + 8 fragmentos de personagem de M18 2/N: existia UM fragmento para nove personagens, então o imprint de oito deles não tinha como ser pago] + 1 tabela de economia + 3 tabelas de item [M14 sub-sessões 1 e 2] + 1 blueprint de invocação [M15 2/N] + 9 personagens + 9 árvores de talento, uma por personagem [M17 2/N] + 41 inimigos autorados [M17 3/N] + 1 banner de invocação [M18 2/N] + 10 conquistas e 2 eventos [M18 4/N] + 1 de M26: unit-art [a declaracao de arte por unidade, 1/N] com 50 arquivos [uma por personagem e por inimigo: 2 com sprite e 48 caindo EXPLICITAMENTE no glifo do M16 — a segunda forma existe para "sem arte" nao ser o mesmo estado de "esqueci de gerar"] = 254 arquivos)', async () => {
    const report = await validateDataset(packageRoot);
    expect(report).toMatchObject({ ok: true, schemasFound: 30, filesChecked: 254 });
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
  // M18 6/N — as fixtures de personagem existiam desde M17 2/N e NUNCA foram exercitadas:
  // o `describe.each` não as listava, e uma pasta `invalid` sequer existia. A ficha
  // inicial entrou como campo obrigatório nesta fatia, e um schema que ninguém testa é
  // um schema que aceita o que ele não deveria sem nada ficar vermelho.
  ['characters', characterSchema],
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

// §5.1 (M15 D3) — `Tile.object` declarava 5 valores desde M3 com leitor para 2. O motor
// agora lê 4 e `chest` saiu (loot em mapa é sistema que não existe). O schema tem de andar
// junto: se ele continuasse aceitando `chest`, `packages/data` poderia autorar conteúdo que
// o tipo do core rejeita — que é exatamente o desalinhamento que a regra 4 existe para
// impedir. `gate` ganhou descrição opcional, porque o portão abre por um lado e quebra pelo
// outro (requisito do usuário, M15 1/N).
describe('maps.schema.ts — Tile.object depois de D3 (§5.1)', () => {
  function mapWithTile(tile: unknown): unknown {
    const tiles = Array.from({ length: 15 }, (_unused, y) =>
      Array.from({ length: 15 }, (_unused2, x) => (x === 7 && y === 7 ? tile : { terrain: 'plain', height: 0 })),
    );
    return {
      id: 'map-fixture-objetos',
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
      winCondition: { t: 'rout' },
      initialValor: 5,
    };
  }

  it('aceita os quatro objetos que o motor lê', () => {
    for (const object of ['wall', 'fort', 'gate', 'camp']) {
      expect(() => mapSchema.parse(mapWithTile({ terrain: 'plain', height: 0, object }))).not.toThrow();
    }
  });

  it('rejeita `chest`: o valor saiu do tipo do core', () => {
    expect(() => mapSchema.parse(mapWithTile({ terrain: 'plain', height: 0, object: 'chest' }))).toThrow();
  });

  it('aceita portão com lado e durabilidade declarados', () => {
    expect(() =>
      mapSchema.parse(
        mapWithTile({ terrain: 'plain', height: 0, object: 'gate', gate: { opensFor: 'player', durability: 3 } }),
      ),
    ).not.toThrow();
  });

  it('rejeita durabilidade não-positiva — um portão que cai em zero golpes não é portão', () => {
    expect(() =>
      mapSchema.parse(
        mapWithTile({ terrain: 'plain', height: 0, object: 'gate', gate: { opensFor: 'any', durability: 0 } }),
      ),
    ).toThrow();
  });

  it('rejeita `gate` declarado num tile que não é portão', () => {
    expect(() =>
      mapSchema.parse(
        mapWithTile({ terrain: 'plain', height: 0, object: 'fort', gate: { opensFor: 'any', durability: 1 } }),
      ),
    ).toThrow();
  });

  it('nenhum mapa do catálogo real usa `chest`', () => {
    const files = findJsonFiles(join(packageRoot, 'maps'));
    for (const file of files) {
      expect(readFileSync(file, 'utf8')).not.toContain('"chest"');
    }
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

  // M15 D2 — o payload deixou de ser solto: o kind ganhou resolução e nomeia um blueprint.
  // A forma nova e as referências cruzadas são medidas em `m15Content.test.ts`.
  it('`summonReinforcement` exige `blueprintId` desde que ganhou resolução', () => {
    expect(() => valorSkillSchema.parse({ ...base, kind: 'summonReinforcement', payload: {} })).toThrow();
  });

  it('rejeita custo zero ou negativo — uma skill de Valor grátis não é um recurso', () => {
    expect(() => valorSkillSchema.parse({ ...base, cost: 0, kind: 'restoreApPp', payload: { ap: 1, pp: 1 } })).toThrow();
  });

  // O catálogo real: o roadmap de M11 pede "catálogo real de valor-skills resolvido de
  // verdade por useValor", então autorar aqui é escopo (ao contrário das skills de área).
  // M15 D2 fechou o quarto kind, e o catálogo passou a cobrir os QUATRO — que é o critério
  // de aceite 3 do milestone ("nenhum kind rejeita por falta de implementação") medido pelo
  // lado do dado: não basta o motor resolver, tem de existir conteúdo exercendo cada um.
  it('o catálogo real cobre os quatro kinds de §5.6, todos com resolução', () => {
    const files = findJsonFiles(join(packageRoot, 'valor-skills'));
    const parsed = files.map((file) => valorSkillSchema.parse(JSON.parse(readFileSync(file, 'utf8'))));
    expect(parsed.map((s) => s.kind).sort()).toEqual([
      'artillery',
      'globalBuff',
      'restoreApPp',
      'summonReinforcement',
    ]);
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
