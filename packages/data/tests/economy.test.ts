import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import dungeonSchema from '../schemas/dungeons.schema.js';
import dungeonEncounterSchema from '../schemas/dungeon-encounters.schema.js';
import mainstatWeightsSchema from '../schemas/mainstat-weights.schema.js';
import substatWeightsSchema from '../schemas/substat-weights.schema.js';
import enhanceRatesSchema from '../schemas/enhance-rates.schema.js';
import economyRulesSchema from '../schemas/economy-rules.schema.js';
import materialSchema from '../schemas/materials.schema.js';

// M14, sub-sessão 1/N — o conteúdo da economia PvE de §10. `pnpm validate:data` já roda
// cada arquivo contra o seu schema; o que este arquivo trava é o que schema nenhum vê:
// referência cruzada entre tipos de conteúdo (masmorra → set, masmorra → material,
// fragmento → herói) e as invariantes que tornam a economia jogável em vez de só válida.

const dataRoot = fileURLToPath(new URL('..', import.meta.url));

function loadAll<T>(schema: { parse: (input: unknown) => T }, dir: string): T[] {
  const full = join(dataRoot, dir);
  return readdirSync(full)
    .filter((f) => f.endsWith('.json'))
    .map((f) => schema.parse(JSON.parse(readFileSync(join(full, f), 'utf8'))));
}

function loadJsonIds(dir: string): Set<string> {
  const full = join(dataRoot, dir);
  return new Set(
    readdirSync(full)
      .filter((f) => f.endsWith('.json'))
      .map((f) => (JSON.parse(readFileSync(join(full, f), 'utf8')) as { id: string }).id),
  );
}

const dungeons = loadAll(dungeonSchema, 'dungeons');
const materials = loadAll(materialSchema, 'materials');
const economyRules = loadAll(economyRulesSchema, 'economy-rules');
const setIds = loadJsonIds('item-sets');
const dungeonEncounters = loadAll(dungeonEncounterSchema, 'dungeon-encounters');
const encounterIds = new Set(dungeonEncounters.map((e) => e.id));
const substatWeights = loadAll(substatWeightsSchema, 'substat-weights')[0]!;
const mainstatWeights = loadAll(mainstatWeightsSchema, 'mainstat-weights')[0]!;
const enhanceRates = loadAll(enhanceRatesSchema, 'enhance-rates')[0]!;

interface MapJson {
  readonly id: string;
  readonly width: number;
  readonly height: number;
  readonly tiles: readonly { readonly terrain: string }[][];
}

const mapsById = new Map(
  readdirSync(join(dataRoot, 'maps'))
    .filter((f) => f.endsWith('.json'))
    .map((f) => {
      const map = JSON.parse(readFileSync(join(dataRoot, 'maps', f), 'utf8')) as MapJson;
      return [map.id, map] as const;
    }),
);

const impassableTerrains = new Set(
  readdirSync(join(dataRoot, 'terrains'))
    .filter((f) => f.endsWith('.json'))
    .map((f) => JSON.parse(readFileSync(join(dataRoot, 'terrains', f), 'utf8')) as { id: string; moveCost: { foot: number | string } })
    .filter((t) => t.moveCost.foot === 'impassable')
    .map((t) => t.id),
);

const heroIds = new Set(
  readdirSync(join(dataRoot, 'encounters'))
    .filter((f) => f.endsWith('.json'))
    .flatMap((f) => {
      const encounter = JSON.parse(readFileSync(join(dataRoot, 'encounters', f), 'utf8')) as {
        units: { hero: { id: string } }[];
      };
      return encounter.units.map((u) => u.hero.id);
    }),
);

describe('masmorras (§10)', () => {
  it('cada um dos 4 focos de §10 tem uma normal e uma elite', () => {
    for (const foco of ['gear', 'exp', 'gold', 'boss'] as const) {
      const doFoco = dungeons.filter((d) => d.focus === foco);
      expect(doFoco.map((d) => d.difficulty).sort(), `foco ${foco}`).toEqual(['elite', 'normal']);
    }
  });

  it('toda masmorra aponta para um encounter que existe — ela é uma batalha, não um botão', () => {
    for (const dungeon of dungeons) {
      expect(encounterIds, `${dungeon.id} aponta para encounter inexistente`).toContain(dungeon.encounterId);
    }
  });

  it('a elite é sempre manual e tem entrada travada por tempo; a normal não tem nenhum dos dois', () => {
    for (const dungeon of dungeons) {
      if (dungeon.difficulty === 'elite') {
        expect(dungeon.manualOnly, dungeon.id).toBe(true);
        expect(dungeon.entryLimit, dungeon.id).toBeDefined();
      } else {
        expect(dungeon.manualOnly ?? false, dungeon.id).toBe(false);
        expect(dungeon.entryLimit, dungeon.id).toBeUndefined();
      }
    }
  });

  it('a elite exige a normal do mesmo foco limpa, e a normal não exige nada', () => {
    const porId = new Map(dungeons.map((d) => [d.id, d]));
    for (const dungeon of dungeons) {
      if (dungeon.difficulty === 'normal') {
        expect(dungeon.requiresClearOf, dungeon.id).toBeUndefined();
        continue;
      }
      const exigida = porId.get(dungeon.requiresClearOf!);
      expect(exigida, `${dungeon.id} exige masmorra inexistente`).toBeDefined();
      expect(exigida!.focus).toBe(dungeon.focus);
      expect(exigida!.difficulty).toBe('normal');
    }
  });

  it('a elite dá mais recursos e custa mais energia que a normal do mesmo foco', () => {
    for (const elite of dungeons.filter((d) => d.difficulty === 'elite')) {
      const normal = dungeons.find((d) => d.id === elite.requiresClearOf)!;
      expect(elite.energyCost, elite.id).toBeGreaterThan(normal.energyCost);
      // "Daria mais recursos" (decisão do usuário): o que a normal entrega, a elite
      // entrega mais.
      if (normal.gold) expect(elite.gold!.min).toBeGreaterThan(normal.gold.min);
      if (normal.exp) expect(elite.exp!.min).toBeGreaterThan(normal.exp.min);
      if (normal.gearDropCount) expect(elite.gearDropCount!).toBeGreaterThanOrEqual(normal.gearDropCount);
      if (normal.materialDropCount) expect(elite.materialDropCount!).toBeGreaterThanOrEqual(normal.materialDropCount);
    }
  });

  it('toda masmorra cobra energia, e nenhuma cobra mais do que cabe no teto da conta', () => {
    const { energy } = economyRules[0]!;
    for (const dungeon of dungeons) {
      expect(dungeon.energyCost).toBeGreaterThan(0);
      // Uma masmorra mais cara que o teto seria inalcançável para sempre.
      expect(dungeon.energyCost).toBeLessThanOrEqual(energy.max);
    }
  });

  it('todo drop de equipamento aponta para um set que existe', () => {
    for (const dungeon of dungeons) {
      for (const drop of dungeon.gearDrops ?? []) {
        expect(setIds, `${dungeon.id} dropa set inexistente ${drop.setId}`).toContain(drop.setId);
      }
    }
  });

  it('todo drop de material aponta para um material que existe', () => {
    const materialIds = new Set(materials.map((m) => m.id));
    for (const dungeon of dungeons) {
      for (const drop of dungeon.materialDrops ?? []) {
        expect(materialIds, `${dungeon.id} dropa material inexistente ${drop.materialId}`).toContain(drop.materialId);
      }
    }
  });

  it('quem declara contagem de drop declara a tabela, e vice-versa', () => {
    for (const dungeon of dungeons) {
      expect(Boolean(dungeon.gearDropCount)).toBe((dungeon.gearDrops ?? []).length > 0);
      expect(Boolean(dungeon.materialDropCount)).toBe((dungeon.materialDrops ?? []).length > 0);
    }
  });

  it('o foco de cada masmorra é o que ela mais entrega — o nome não mente', () => {
    const porFoco = new Map(dungeons.filter((d) => d.difficulty === 'normal').map((d) => [d.focus, d]));
    // Equipamento é a única que dropa item; Chefe é a única que dropa material de
    // progressão (§10: "Chefe (materiais de promoção)").
    expect(porFoco.get('gear')!.gearDropCount).toBeGreaterThan(0);
    expect(porFoco.get('boss')!.materialDropCount).toBeGreaterThan(0);
    expect(porFoco.get('exp')!.exp!.min).toBeGreaterThan(porFoco.get('gold')!.exp?.min ?? 0);
    expect(porFoco.get('gold')!.gold!.min).toBeGreaterThan(porFoco.get('exp')!.gold?.min ?? 0);
  });
});

describe('encounters de masmorra', () => {
  it('toda unidade nasce DENTRO do mapa que o encounter referencia', () => {
    for (const encounter of dungeonEncounters) {
      const map = mapsById.get(encounter.mapId);
      expect(map, `${encounter.id} referencia mapa inexistente ${encounter.mapId}`).toBeDefined();
      for (const unit of encounter.units) {
        expect(unit.pos.x, `${encounter.id}/${unit.unitId}`).toBeGreaterThanOrEqual(0);
        expect(unit.pos.y, `${encounter.id}/${unit.unitId}`).toBeGreaterThanOrEqual(0);
        expect(unit.pos.x, `${encounter.id}/${unit.unitId}`).toBeLessThan(map!.width);
        expect(unit.pos.y, `${encounter.id}/${unit.unitId}`).toBeLessThan(map!.height);
      }
    }
  });

  // A primeira versão desta fatia escolheu as coordenadas à mão e caiu fora do mapa; agora
  // o gerador as deriva do layout. Este teste é o que trava a regressão.
  it('nenhuma unidade nasce em tile intransponível a pé', () => {
    for (const encounter of dungeonEncounters) {
      const map = mapsById.get(encounter.mapId)!;
      for (const unit of encounter.units) {
        const terrain = map.tiles[unit.pos.y]![unit.pos.x]!.terrain;
        expect(impassableTerrains.has(terrain), `${encounter.id}/${unit.unitId} em ${terrain}`).toBe(false);
      }
    }
  });

  it('todo encounter de masmorra tem vaga do jogador E inimigo — é batalha, não passeio', () => {
    for (const encounter of dungeonEncounters) {
      expect(encounter.units.some((u) => u.side === 'player'), encounter.id).toBe(true);
      expect(encounter.units.some((u) => u.side === 'enemy'), encounter.id).toBe(true);
    }
  });

  it('todo inimigo de masmorra tem arquétipo de IA — senão a masmorra é um alvo parado', () => {
    for (const encounter of dungeonEncounters) {
      for (const unit of encounter.units.filter((u) => u.side === 'enemy')) {
        expect(unit.aiArchetype, `${encounter.id}/${unit.unitId}`).toBeDefined();
      }
    }
  });

  it('masmorra é sempre `casual`: farmar não pode custar herói', () => {
    for (const encounter of dungeonEncounters) {
      expect(encounter.permadeath, encounter.id).toBe('casual');
    }
  });

  it('a elite tem elenco mais forte que a normal do mesmo foco', () => {
    const porId = new Map(dungeonEncounters.map((e) => [e.id, e]));
    for (const elite of dungeons.filter((d) => d.difficulty === 'elite')) {
      const normal = dungeons.find((d) => d.id === elite.requiresClearOf)!;
      const inimigosElite = porId.get(elite.encounterId)!.units.filter((u) => u.side === 'enemy');
      const inimigosNormal = porId.get(normal.encounterId)!.units.filter((u) => u.side === 'enemy');
      const nivelElite = Math.max(...inimigosElite.map((u) => u.hero.level));
      const nivelNormal = Math.max(...inimigosNormal.map((u) => u.hero.level));
      expect(nivelElite, elite.id).toBeGreaterThan(nivelNormal);
    }
  });
});

describe('materiais', () => {
  it('todo fragmento de herói aponta para um herói que existe na campanha', () => {
    const fragmentos = materials.filter((m) => m.kind === 'heroFragment');
    expect(fragmentos.length).toBeGreaterThan(0);
    for (const fragmento of fragmentos) {
      expect(heroIds, `${fragmento.id} aponta para herói inexistente`).toContain(fragmento.forHeroId!);
    }
  });

  it('só fragmento de herói declara `forHeroId`', () => {
    for (const material of materials) {
      if (material.kind !== 'heroFragment') expect(material.forHeroId).toBeUndefined();
    }
  });
});

describe('regras de economia', () => {
  it('há exatamente uma tabela de regras', () => {
    expect(economyRules).toHaveLength(1);
  });

  it('a energia tem teto e intervalo positivos', () => {
    const { energy } = economyRules[0]!;
    expect(energy.max).toBeGreaterThan(0);
    expect(energy.refillIntervalMs).toBeGreaterThan(0);
  });

  it('encher a conta do zero leva menos de um dia — energia limita o farm, não o mata', () => {
    const { energy } = economyRules[0]!;
    expect(energy.max * energy.refillIntervalMs).toBeLessThanOrEqual(24 * 60 * 60 * 1000);
  });

  it('awakening tem os 6 passos de 0→6 que §10 pede', () => {
    expect(economyRules[0]!.awakening).toHaveLength(6);
  });

  it('imprint tem os 5 passos de 0→5 (o tamanho de `imprintFlat` desde M1)', () => {
    expect(economyRules[0]!.imprint).toHaveLength(5);
  });

  it('o custo de awakening nunca fica mais barato conforme sobe', () => {
    const passos = economyRules[0]!.awakening;
    for (let i = 1; i < passos.length; i++) {
      expect(passos[i]!.gold).toBeGreaterThanOrEqual(passos[i - 1]!.gold);
      const antes = Object.values(passos[i - 1]!.materials).reduce((s, n) => s + n, 0);
      const agora = Object.values(passos[i]!.materials).reduce((s, n) => s + n, 0);
      expect(agora).toBeGreaterThanOrEqual(antes);
    }
  });

  it('o enhance tem um custo por marco de §7.3, e nenhum fica mais barato', () => {
    const passos = economyRules[0]!.enhance;
    expect(passos).toHaveLength(5);
    for (let i = 1; i < passos.length; i++) {
      expect(passos[i]!.gold).toBeGreaterThanOrEqual(passos[i - 1]!.gold);
      expect(passos[i]!.stones).toBeGreaterThanOrEqual(passos[i - 1]!.stones);
    }
  });

  it('o enhance cobra pedras — é o sumidouro que faltava à moeda que só dropava', () => {
    expect(economyRules[0]!.enhance.some((passo) => passo.stones > 0)).toBe(true);
    expect(dungeons.some((d) => (d.stones?.max ?? 0) > 0)).toBe(true);
  });

  it('o custo de imprint nunca fica mais barato conforme sobe', () => {
    const passos = economyRules[0]!.imprint;
    for (let i = 1; i < passos.length; i++) {
      expect(passos[i]!.fragments).toBeGreaterThanOrEqual(passos[i - 1]!.fragments);
    }
  });

  it('todo material cobrado por awakening existe e dropa em alguma masmorra', () => {
    const materialIds = new Set(materials.map((m) => m.id));
    const dropados = new Set(dungeons.flatMap((d) => (d.materialDrops ?? []).map((drop) => drop.materialId)));
    for (const passo of economyRules[0]!.awakening) {
      for (const materialId of Object.keys(passo.materials)) {
        expect(materialIds).toContain(materialId);
        // Cobrar um material que nenhuma masmorra dropa travaria a progressão.
        expect(dropados, `${materialId} é cobrado mas não dropa em lugar nenhum`).toContain(materialId);
      }
    }
  });

  it('o fragmento de imprint também tem de dropar em alguma masmorra', () => {
    const dropados = new Set(dungeons.flatMap((d) => (d.materialDrops ?? []).map((drop) => drop.materialId)));
    for (const fragmento of materials.filter((m) => m.kind === 'heroFragment')) {
      expect(dropados, `${fragmento.id} não dropa em lugar nenhum`).toContain(fragmento.id);
    }
  });
});

// As três tabelas de M4 que nunca existiram como conteúdo real: só havia fixture em
// `test-fixtures/`, então nada fora de teste conseguia GERAR um item — e o drop de
// masmorra depende exatamente delas.
describe('tabelas de item (§7.1-§7.3)', () => {
  it('todo slot de equipamento tem ao menos um mainstat declarado', () => {
    for (const slot of ['weapon', 'helmet', 'armor', 'necklace', 'ring', 'boots']) {
      expect(mainstatWeights.some((e) => e.slot === slot), slot).toBe(true);
    }
  });

  it('os três slots de mainstat fixo (§7.1) declaram exatamente o stat da regra', () => {
    const fixos = { weapon: 'atk', helmet: 'hp', armor: 'def' } as const;
    for (const [slot, stat] of Object.entries(fixos)) {
      const entradas = mainstatWeights.filter((e) => e.slot === slot);
      expect(entradas).toHaveLength(1);
      expect(entradas[0]!.stat).toBe(stat);
    }
  });

  it('todo slot que sorteia mainstat tem mais de uma opção — senão o sorteio é decoração', () => {
    for (const slot of ['necklace', 'ring', 'boots']) {
      expect(mainstatWeights.filter((e) => e.slot === slot).length, slot).toBeGreaterThan(1);
    }
  });

  it('a pool de substat tem opções suficientes para um item épico (4 substats distintos)', () => {
    expect(new Set(substatWeights.map((e) => e.stat)).size).toBeGreaterThanOrEqual(5);
  });

  it('toda faixa de valor é positiva e bem ordenada', () => {
    for (const entrada of [...substatWeights, ...mainstatWeights]) {
      expect(entrada.valueRange.min).toBeGreaterThan(0);
      expect(entrada.valueRange.max).toBeGreaterThanOrEqual(entrada.valueRange.min);
    }
  });

  it('as chances de enhance decrescem, como §7.3 exige, e batem nos 3 números que a spec dá', () => {
    expect(enhanceRates.toThree).toBe(1000); // §7.3: +0→+3 = 100%
    expect(enhanceRates.toTwelve).toBe(650); // §7.3: +9→+12 = 65%
    expect(enhanceRates.toFifteen).toBe(400); // §7.3: +12→+15 = 40%
    const ordem = [
      enhanceRates.toThree,
      enhanceRates.toSix,
      enhanceRates.toNine,
      enhanceRates.toTwelve,
      enhanceRates.toFifteen,
    ];
    for (let i = 1; i < ordem.length; i++) expect(ordem[i]!).toBeLessThanOrEqual(ordem[i - 1]!);
  });
});
