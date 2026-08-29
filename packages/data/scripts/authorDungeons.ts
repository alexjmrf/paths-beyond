import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import dungeonEncounterSchema from '../schemas/dungeon-encounters.schema.js';
import dungeonSchema from '../schemas/dungeons.schema.js';
import { buildHero, packageRoot, writeJson, type UnitSpec } from './authorCampaign.js';

// M14, sub-sessão 2/N — as masmorras de farm de §10, autoradas por gerador pelo mesmo
// motivo que os mapas de campanha (M12, 3/N): um encounter é centenas de linhas de JSON, e
// um `pos` errado à mão passa despercebido.
//
// Decisão do usuário: **a masmorra é uma batalha de verdade**. Cada dificuldade é um
// confronto (mapa + elenco), como um capítulo — e reusa os LAYOUTS que já existem em
// `maps/`: o split layout/elenco de M12 1/N existe exatamente para um mesmo mapa servir a
// confrontos diferentes sem duplicar a matriz de tiles.
//
// Duas dificuldades por masmorra:
//   - `normal`: precisa ser limpa à mão uma vez; depois aceita time automático.
//   - `elite`:  mais recursos, sempre manual, entrada limitada com reset em dias
//               declarados (semana ou mês, conforme o conteúdo).
//
// **As coordenadas NÃO são escolhidas à mão.** A primeira versão desta fatia as chutou e
// caiu fora do mapa em três masmorras — os testes de conteúdo acusaram. Agora as vagas do
// jogador e os inimigos são derivados do próprio layout: os tiles passáveis mais próximos
// de cada canto oposto, em ordem determinística.

interface EnemySpec {
  readonly unitId: string;
  readonly classId: string;
  readonly level: number;
}

interface DungeonSpec {
  readonly id: string;
  readonly name: string;
  readonly focus: 'gear' | 'exp' | 'gold' | 'boss';
  readonly difficulty: 'normal' | 'elite';
  readonly mapId: string;
  readonly energyCost: number;
  readonly playerSlotCount: number;
  // O nível do time de REFERÊNCIA — o que a masmorra foi ajustada para receber. Não é o
  // time do jogador (em produção as vagas são preenchidas pelo roster dele); é o que
  // torna a dificuldade uma afirmação verificável em teste em vez de uma intenção.
  readonly referenceLevel: number;
  readonly enemies: readonly EnemySpec[];
  readonly rewards: Record<string, unknown>;
  readonly manualOnly?: boolean;
  readonly requiresClearOf?: string;
  readonly entryLimit?: unknown;
}

// O elenco do jogador é VAGA, não herói: quem entra é o time que o jogador escolher (o
// servidor monta o `BattleSetup` a partir do roster dele em 3/N). O encounter declara onde
// as vagas ficam, e um herói de referência ocupa cada uma para o confronto ser jogável por
// si só — é o que permite testar a masmorra sem servidor, como o piloto testa a campanha.
const REFERENCE_PLAYER_CLASSES = ['class-espadachim', 'class-clerigo', 'class-arqueiro', 'class-couracado'];

function enemy(unitId: string, classId: string, level: number): EnemySpec {
  return { unitId, classId, level };
}

const DUNGEONS: readonly DungeonSpec[] = [
  {
    id: 'dungeon-forja-abandonada',
    name: 'Forja Abandonada',
    focus: 'gear',
    difficulty: 'normal',
    mapId: 'map-campanha-5',
    energyCost: 12,
    playerSlotCount: 3,
    referenceLevel: 14,
    enemies: [
      enemy('forja-guarda-1', 'class-couracado', 10),
      enemy('forja-guarda-2', 'class-espadachim', 10),
      enemy('forja-arqueiro', 'class-arqueiro', 9),
    ],
    rewards: {
      gold: { min: 20, max: 40 },
      gearDropCount: 2,
      gearDrops: [
        { weight: 4, setId: 'set-forca', slot: 'weapon', rarity: 'rare', ilvl: 70 },
        { weight: 4, setId: 'set-guardiao', slot: 'armor', rarity: 'rare', ilvl: 70 },
        { weight: 2, setId: 'set-duelista', slot: 'boots', rarity: 'heroic', ilvl: 80 },
        { weight: 1, setId: 'set-imunidade', slot: 'necklace', rarity: 'epic', ilvl: 85 },
      ],
    },
  },
  {
    id: 'dungeon-forja-abandonada-elite',
    name: 'Forja Abandonada (Elite)',
    focus: 'gear',
    difficulty: 'elite',
    mapId: 'map-campanha-5',
    energyCost: 20,
    manualOnly: true,
    requiresClearOf: 'dungeon-forja-abandonada',
    // Reseta às terças e sábados (0 = domingo).
    entryLimit: { maxEntries: 3, resetOn: { kind: 'weekdays', days: [2, 6] } },
    playerSlotCount: 3,
    referenceLevel: 17,
    enemies: [
      enemy('forja-elite-guarda-1', 'class-couracado', 16),
      enemy('forja-elite-guarda-2', 'class-espadachim', 16),
      enemy('forja-elite-arqueiro', 'class-arqueiro', 15),
      enemy('forja-elite-arcanista', 'class-arcanista', 15),
    ],
    rewards: {
      gold: { min: 60, max: 100 },
      gearDropCount: 3,
      gearDrops: [
        { weight: 3, setId: 'set-forca', slot: 'weapon', rarity: 'heroic', ilvl: 85 },
        { weight: 3, setId: 'set-guardiao', slot: 'armor', rarity: 'heroic', ilvl: 85 },
        { weight: 2, setId: 'set-duelista', slot: 'boots', rarity: 'epic', ilvl: 90 },
        { weight: 2, setId: 'set-imunidade', slot: 'necklace', rarity: 'epic', ilvl: 90 },
      ],
    },
  },
  {
    id: 'dungeon-campo-de-treino',
    name: 'Campo de Treino',
    focus: 'exp',
    difficulty: 'normal',
    mapId: 'map-campanha-1',
    energyCost: 10,
    playerSlotCount: 2,
    referenceLevel: 12,
    // Passe do HANDOFF, 2026-08-28 — o alvo 2 era `class-arqueiro`, e passou a ser corpo a
    // corpo quando `bow` voltou a valer 2 (§6.1). Não é fuga do problema: é o padrão que o
    // resto do conteúdo já seguia e que só o campo de treino violava. Time de jogador de DUAS
    // vagas enfrenta só corpo a corpo (`veio-de-prata`); o arqueiro inimigo aparece a partir de
    // `forja-abandonada`, onde a party tem três vagas e uma delas é um arqueiro. Com alcance 1
    // a violação era inofensiva; com 2, o piso da dificuldade deixou de ser vencível na seed 2.
    enemies: [enemy('treino-alvo-1', 'class-espadachim', 8), enemy('treino-alvo-2', 'class-guerreiro', 8)],
    rewards: { exp: { min: 400, max: 600 }, gold: { min: 5, max: 10 } },
  },
  {
    id: 'dungeon-campo-de-treino-elite',
    name: 'Campo de Treino (Elite)',
    focus: 'exp',
    difficulty: 'elite',
    mapId: 'map-campanha-1',
    energyCost: 18,
    manualOnly: true,
    requiresClearOf: 'dungeon-campo-de-treino',
    entryLimit: { maxEntries: 2, resetOn: { kind: 'weekdays', days: [0, 3] } },
    playerSlotCount: 2,
    referenceLevel: 19,
    enemies: [
      enemy('treino-elite-1', 'class-espadachim', 18),
      enemy('treino-elite-2', 'class-arqueiro', 18),
      enemy('treino-elite-3', 'class-clerigo', 17),
    ],
    rewards: { exp: { min: 1400, max: 1800 }, gold: { min: 20, max: 40 } },
  },
  {
    id: 'dungeon-veio-de-prata',
    name: 'Veio de Prata',
    focus: 'gold',
    difficulty: 'normal',
    mapId: 'map-campanha-3',
    energyCost: 10,
    playerSlotCount: 2,
    referenceLevel: 15,
    enemies: [enemy('veio-saqueador-1', 'class-espadachim', 11), enemy('veio-saqueador-2', 'class-couracado', 11)],
    rewards: { gold: { min: 300, max: 500 } },
  },
  {
    id: 'dungeon-veio-de-prata-elite',
    name: 'Veio de Prata (Elite)',
    focus: 'gold',
    difficulty: 'elite',
    mapId: 'map-campanha-3',
    energyCost: 18,
    manualOnly: true,
    requiresClearOf: 'dungeon-veio-de-prata',
    entryLimit: { maxEntries: 2, resetOn: { kind: 'weekdays', days: [1, 5] } },
    playerSlotCount: 2,
    referenceLevel: 20,
    enemies: [
      enemy('veio-elite-1', 'class-espadachim', 19),
      enemy('veio-elite-2', 'class-couracado', 19),
      enemy('veio-elite-3', 'class-grifeiro', 18),
    ],
    rewards: { gold: { min: 1200, max: 1800 }, stones: { min: 2, max: 4 } },
  },
  {
    id: 'dungeon-covil-do-tirano',
    name: 'Covil do Tirano',
    focus: 'boss',
    difficulty: 'normal',
    mapId: 'map-campanha-4',
    energyCost: 20,
    playerSlotCount: 3,
    referenceLevel: 20,
    enemies: [
      // Um nível abaixo do que eram (14/14/16). A party de referência desta masmorra tem três
      // vagas e DUAS delas são de alcance (clérigo e arqueiro), então a redução de 33% no `atk`
      // dessas classes pesou mais no jogador do que nos guardas, todos corpo a corpo.
      enemy('tirano-guarda-1', 'class-couracado', 13),
      enemy('tirano-guarda-2', 'class-couracado', 13),
      enemy('tirano', 'class-mestre-espadachim', 15),
    ],
    rewards: {
      gold: { min: 60, max: 120 },
      stones: { min: 4, max: 8 },
      materialDropCount: 2,
      materialDrops: [
        { weight: 4, materialId: 'material-nucleo-de-despertar', amount: { min: 1, max: 3 } },
        { weight: 1, materialId: 'material-fragmento-hero-jogador', amount: { min: 1, max: 1 } },
      ],
    },
  },
  {
    id: 'dungeon-covil-do-tirano-elite',
    name: 'Covil do Tirano (Elite)',
    focus: 'boss',
    difficulty: 'elite',
    mapId: 'map-campanha-4',
    energyCost: 30,
    manualOnly: true,
    requiresClearOf: 'dungeon-covil-do-tirano',
    // Material de despertar é o recurso mais caro da economia: reset mensal, nos dias 1 e
    // 15 — a leitura de "dias X do mês" da decisão do usuário.
    entryLimit: { maxEntries: 2, resetOn: { kind: 'monthDays', days: [1, 15] } },
    playerSlotCount: 3,
    referenceLevel: 26,
    enemies: [
      enemy('tirano-elite-guarda-1', 'class-couracado', 22),
      enemy('tirano-elite-guarda-2', 'class-couracado', 22),
      enemy('tirano-elite-clerigo', 'class-clerigo', 20),
      enemy('tirano-elite', 'class-mestre-espadachim', 25),
    ],
    rewards: {
      gold: { min: 200, max: 320 },
      stones: { min: 10, max: 16 },
      materialDropCount: 3,
      materialDrops: [
        { weight: 3, materialId: 'material-nucleo-de-despertar', amount: { min: 3, max: 6 } },
        { weight: 2, materialId: 'material-fragmento-hero-jogador', amount: { min: 1, max: 2 } },
      ],
    },
  },
];

function encounterIdOf(dungeonId: string): string {
  return `encounter-${dungeonId.replace(/^dungeon-/, '')}`;
}

interface MapJson {
  readonly width: number;
  readonly height: number;
  readonly tiles: readonly { readonly terrain: string; readonly height: 0 | 1 | 2 | 3 }[][];
}

// O terreno é tipo de conteúdo próprio (`terrains/*.json`) e o mapa só guarda o id em cada
// tile — quem junta os dois é o `ContentCatalog`. Aqui a junção é feita à mão porque o
// gerador roda antes de qualquer catálogo existir.
type TerrainTable = Readonly<Record<string, { readonly moveCost: Readonly<Record<string, number | 'impassable'>> }>>;

function loadTerrains(root: string): TerrainTable {
  const dir = join(root, 'terrains');
  const table: Record<string, { moveCost: Record<string, number | 'impassable'> }> = {};
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.json'))) {
    const terrain = JSON.parse(readFileSync(join(dir, file), 'utf8')) as {
      id: string;
      moveCost: Record<string, number | 'impassable'>;
    };
    table[terrain.id] = { moveCost: terrain.moveCost };
  }
  return table;
}

function loadMap(root: string, mapId: string): MapJson {
  return JSON.parse(readFileSync(join(root, 'maps', `${mapId}.json`), 'utf8')) as MapJson;
}

function isPassable(map: MapJson, terrains: TerrainTable, x: number, y: number): boolean {
  const tile = map.tiles[y]?.[x];
  if (!tile) return false;
  const terrain = terrains[tile.terrain];
  if (!terrain) throw new Error(`tile referencia terreno desconhecido: ${tile.terrain}`);
  return terrain.moveCost.foot !== 'impassable';
}

// De onde saem as posições: do CAPÍTULO que usa o mesmo layout.
//
// A primeira versão desta fatia escolheu cantos opostos e três masmorras nunca terminavam
// (800 comandos, centenas de rounds, nenhum desfecho). A segunda ancorou as duas equipes no
// maior bolsão contíguo e ainda assim duas ficaram paradas a dois tiles uma da outra, em
// lados opostos de uma crista de montanha: a IA de mapa de §9.1 escolhe o tile por distância
// de Manhattan e trava em mínimo local contra parede — limitação conhecida de M7, e a regra
// 6 ("nada de IA esperta") diz para não resolvê-la tornando a IA mais inteligente.
//
// A saída é conteúdo, não motor: os capítulos de M12 já têm posições provadas jogáveis
// nesses mesmos layouts (o piloto automático vence os 6). A masmorra herda essas posições.
interface CampaignEncounterJson {
  readonly mapId: string;
  readonly units: readonly { readonly side: 'player' | 'enemy'; readonly pos: { x: number; y: number } }[];
}

function loadCampaignPositions(root: string, mapId: string): { players: { x: number; y: number }[]; enemies: { x: number; y: number }[] } {
  const dir = join(root, 'encounters');
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.json'))) {
    const encounter = JSON.parse(readFileSync(join(dir, file), 'utf8')) as CampaignEncounterJson;
    if (encounter.mapId !== mapId) continue;
    return {
      players: encounter.units.filter((u) => u.side === 'player').map((u) => u.pos),
      enemies: encounter.units.filter((u) => u.side === 'enemy').map((u) => u.pos),
    };
  }
  throw new Error(`nenhum capítulo usa o layout ${mapId}: a masmorra não tem posição de onde herdar`);
}

// Quando a masmorra tem mais unidades que o capítulo, as extras entram nos vizinhos
// passáveis do último tile conhecido — adjacentes a uma posição já provada alcançável.
function expandPositions(
  map: MapJson,
  terrains: TerrainTable,
  base: readonly { x: number; y: number }[],
  count: number,
  taken: Set<string>,
): { x: number; y: number }[] {
  const chosen: { x: number; y: number }[] = [];

  const claim = (tile: { x: number; y: number }): boolean => {
    const key = `${tile.x},${tile.y}`;
    if (taken.has(key)) return false;
    if (!isPassable(map, terrains, tile.x, tile.y)) return false;
    taken.add(key);
    chosen.push(tile);
    return true;
  };

  for (const tile of base) {
    if (chosen.length >= count) break;
    claim(tile);
  }

  // Anel a anel em volta das posições herdadas, em ordem determinística.
  for (let radius = 1; chosen.length < count && radius <= 6; radius++) {
    for (const anchor of base) {
      for (let dy = -radius; dy <= radius; dy++) {
        for (let dx = -radius; dx <= radius; dx++) {
          if (Math.abs(dx) + Math.abs(dy) !== radius) continue;
          if (chosen.length >= count) break;
          claim({ x: anchor.x + dx, y: anchor.y + dy });
        }
      }
    }
  }

  if (chosen.length < count) throw new Error(`não há tiles suficientes perto das posições herdadas de ${map.width}x${map.height}`);
  return chosen;
}

function heightAt(map: MapJson, x: number, y: number): 0 | 1 | 2 | 3 {
  return map.tiles[y]?.[x]?.height ?? 0;
}

function buildEncounter(spec: DungeonSpec, map: MapJson, terrains: TerrainTable): unknown {
  const taken = new Set<string>();
  const herdadas = loadCampaignPositions(packageRoot(), spec.mapId);
  const playerTiles = expandPositions(map, terrains, herdadas.players, spec.playerSlotCount, taken);
  const enemyTiles = expandPositions(map, terrains, herdadas.enemies, spec.enemies.length, taken);

  const players: UnitSpec[] = playerTiles.map((pos, index) => ({
    unitId: `${spec.id}-vaga-${index + 1}`,
    classId: REFERENCE_PLAYER_CLASSES[index % REFERENCE_PLAYER_CLASSES.length]!,
    side: 'player',
    pos: [pos.x, pos.y],
    level: spec.referenceLevel,
  }));

  const enemies: UnitSpec[] = spec.enemies.map((e, index) => ({
    unitId: e.unitId,
    classId: e.classId,
    side: 'enemy',
    pos: [enemyTiles[index]!.x, enemyTiles[index]!.y],
    ai: 'aggressive',
    level: e.level,
  }));

  return {
    id: encounterIdOf(spec.id),
    name: spec.name,
    mapId: spec.mapId,
    // Farmar não pode custar herói: masmorra é sempre `casual`. Um mapa repetível com
    // morte permanente seria uma armadilha.
    permadeath: 'casual',
    winCondition: { t: 'rout' },
    units: [...players, ...enemies].map((unit) => ({
      unitId: unit.unitId,
      side: unit.side,
      hero: buildHero(unit),
      pos: { x: unit.pos[0], y: unit.pos[1] },
      height: heightAt(map, unit.pos[0], unit.pos[1]),
      ...(unit.ai ? { aiArchetype: unit.ai } : {}),
    })),
  };
}

function buildDungeon(spec: DungeonSpec): unknown {
  return {
    id: spec.id,
    name: spec.name,
    focus: spec.focus,
    difficulty: spec.difficulty,
    encounterId: encounterIdOf(spec.id),
    energyCost: spec.energyCost,
    ...(spec.manualOnly ? { manualOnly: true } : {}),
    ...(spec.requiresClearOf ? { requiresClearOf: spec.requiresClearOf } : {}),
    ...(spec.entryLimit ? { entryLimit: spec.entryLimit } : {}),
    ...spec.rewards,
  };
}

function main(): void {
  const root = packageRoot();
  const terrains = loadTerrains(root);
  const dungeonsDir = join(root, 'dungeons');
  const encountersDir = join(root, 'dungeon-encounters');

  for (const spec of DUNGEONS) {
    const map = loadMap(root, spec.mapId);

    const encounter = buildEncounter(spec, map, terrains);
    dungeonEncounterSchema.parse(encounter);
    writeJson(encountersDir, encounterIdOf(spec.id), encounter);

    const dungeon = buildDungeon(spec);
    dungeonSchema.parse(dungeon);
    writeJson(dungeonsDir, spec.id, dungeon);
  }

  console.log(`Gerado: ${DUNGEONS.length} masmorras e ${DUNGEONS.length} encounters de masmorra.`);
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  main();
}
