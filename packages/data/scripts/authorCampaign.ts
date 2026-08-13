import { mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import encounterSchema from '../schemas/encounters.schema.js';
import mapSchema from '../schemas/maps.schema.js';
import skillSchema from '../schemas/skills.schema.js';

// M12, sub-sessão 3/N — a campanha real. §10: "campanha em capítulos (6-10 mapas)";
// aceite de M12: "campanha de 6+ mapas jogável ponta a ponta com pelo menos 3 condições
// de vitória distintas".
//
// Até aqui a campanha eram 3 layouts 15×15 de planície pura (`map-campanha-*-provisorio`,
// portados byte a byte de M6 pela sub-sessão 3/4 de M9), todos `rout`, com inimigos SEM
// `aiArchetype` — isto é, parados. Este gerador substitui os três por 6 layouts com
// terreno de verdade e emite o elenco de cada capítulo com a IA ligada.
//
// Por que gerador e não JSON à mão: um layout 15×15 são 225 tiles ≈ 940 linhas de JSON, e
// 6 mapas ≈ 6 mil linhas onde um `terrain` trocado passa despercebido. O mapa é escrito
// aqui como ASCII — que se lê de relance e mostra o chokepoint — e o JSON é derivado.
// Mesmo papel de `authorContent.ts`: ferramenta de autoria, não parte do motor.

// ---------------------------------------------------------------------------
// Legenda do ASCII
// ---------------------------------------------------------------------------

// Só existem 3 terrenos no catálogo (§5.1, autorados em M9). O que o motor lê de cada um:
// - `terrain-planicie`  custo 1, sem bônus — o chão de sempre;
// - `terrain-floresta`  custo 2 (foot) / 3 (cavalry, heavy), +100 def e +50 eva a quem
//                       DEFENDE nela (`commands.ts`, `defenderTerrainDefBonus`);
// - `terrain-montanha`  `impassable` para tudo que não voa. É a única parede que o motor
//                       de fato respeita: `Tile.object` ('wall' | 'fort' | 'gate' | ...)
//                       existe no schema desde M3 e NINGUÉM lê — nem o core, nem o
//                       cliente. Autorar um 'wall' aqui seria cenário decorativo se
//                       fazendo passar por regra, então os chokepoints são montanha
//                       (ver DECISIONS.md).
// A altura é do TILE e vale por si: `move` copia a altura do destino para a unidade
// (`commands.ts`) e `positional.ts` converte diferença de altura em dano e acerto.
const GLYPHS = {
  '.': { terrain: 'terrain-planicie', height: 0 },
  ':': { terrain: 'terrain-planicie', height: 1 },
  '+': { terrain: 'terrain-planicie', height: 2 },
  f: { terrain: 'terrain-floresta', height: 0 },
  F: { terrain: 'terrain-floresta', height: 1 },
  '^': { terrain: 'terrain-montanha', height: 2 },
  M: { terrain: 'terrain-montanha', height: 3 },
} as const satisfies Record<string, { terrain: string; height: 0 | 1 | 2 | 3 }>;

type Glyph = keyof typeof GLYPHS;

interface MapSpec {
  readonly id: string;
  readonly name: string;
  readonly rows: readonly string[];
  readonly winCondition: unknown;
}

// ---------------------------------------------------------------------------
// Os 6 layouts
// ---------------------------------------------------------------------------

// §5.7 — a condição de vitória é do MAPA; o encounter só a sobrepõe quando precisa
// nomear uma unidade do elenco (o caso de `escort`, capítulo 5).
const MAPS: readonly MapSpec[] = [
  {
    // Capítulo 1 — o mesmo confronto de M6 (a estrada, o herói sozinho contra dois
    // bandidos), agora com a colina no meio: quem chegar primeiro ao anel de altura 1
    // luta de cima. `rout` porque é o tutorial — a condição que não precisa ser explicada.
    id: 'map-campanha-1',
    name: 'Estrada de Vale Claro',
    rows: [
      'ffff.......ffff',
      'fff..f...f..fff',
      'ff...........ff',
      'f....:::.....ff',
      'f...::^::....ff',
      '....::^::......',
      '......:::......',
      '...............',
      '......:::......',
      '....::^::......',
      'f...::^::....ff',
      'f....:::.....ff',
      'ff...........ff',
      'fff..f...f..fff',
      'ffff.......ffff',
    ],
    winCondition: { t: 'rout' },
  },
  {
    // Capítulo 2 — `seize`. A serra corta o mapa em dois e só tem duas passagens (y=3 e
    // y=11); o acampamento fica no planalto a leste. Tomar o tile encerra a batalha, então
    // matar a patrulha inteira deixa de ser obrigatório: é a diferença entre `seize` e
    // `rout` ficando visível no traçado do mapa, não só no JSON.
    id: 'map-campanha-2',
    name: 'Acampamento da Serra',
    rows: [
      'ff.....M.....ff',
      'f......M......f',
      '.......M.......',
      '......:.:......',
      '.......M.......',
      'f......M......f',
      '.......M..:::..',
      '.......M..:::..',
      '.......M..:::..',
      'f......M......f',
      '.......M.......',
      '......:.:......',
      '.......M.......',
      'f......M......f',
      'ff.....M.....ff',
    ],
    winCondition: { t: 'seize', target: { x: 12, y: 7 } },
  },
  {
    // Capítulo 3 — `defend`. Uma passagem única (7,7) na muralha de montanha, com dois
    // patamares de altura 1 ao lado. Segurar 5 rounds E não deixar inimigo pisar no tile:
    // a leitura de §5.7 decidida em M11 (a derrota por tile tomado decide ANTES da
    // contagem). Os inimigos nascem a 5+ tiles do desfiladeiro — mais que o `moveRange` de
    // qualquer classe — pra que o jogador SEMPRE chegue primeiro; um mapa onde o round 1
    // já é derrota não seria uma decisão, seria um erro de autoria.
    id: 'map-campanha-3',
    name: 'Desfiladeiro de Pedra Alta',
    rows: [
      'fff....M....fff',
      'ff.....M.....ff',
      'f......M......f',
      '.......M.......',
      '.......M.......',
      '.......M.......',
      '......:M:......',
      '......:.:......',
      '......:M:......',
      '.......M.......',
      '.......M.......',
      'f......M......f',
      'ff.....M.....ff',
      'fff....M....fff',
      'ffff...M...ffff',
    ],
    winCondition: { t: 'defend', rounds: 5, target: { x: 7, y: 7 } },
  },
  {
    // Capítulo 4 — `surviveRounds`. Nenhuma parede: a party se planta no bosque alto do
    // centro (floresta dá +100 def e +50 eva a quem defende nela, e o anel de altura 1 dá
    // vantagem posicional) enquanto os inimigos convergem das quatro bordas. Aguentar 5
    // rounds vence mesmo com inimigo vivo em campo — é a condição que premia não morrer,
    // não a que premia matar.
    id: 'map-campanha-4',
    name: 'Bosque de Corvos',
    rows: [
      '................',
      '.^..........^...',
      '................',
      '....ff....ff....',
      '....fF:..:Ff....',
      '......:..:......',
      '......::::......',
      '.....::..::.....',
      '.....::..::.....',
      '......::::......',
      '......:..:......',
      '....fF:..:Ff....',
      '....ff....ff....',
      '................',
      '...^........^...',
      '................',
    ],
    winCondition: { t: 'surviveRounds', n: 5 },
  },
  {
    // Capítulo 5 — `escort` (declarado no ENCOUNTER: a condição nomeia a mensageira, que
    // só existe no elenco). O layout declara `seize` no mesmo tile, que é o objetivo
    // coerente de quem olhar só o mapa — e é exatamente o caso que a sobreposição de
    // `winCondition` do encounter existe pra resolver (M12, sub-sessão 1/N).
    // Duas rotas: a estrada do meio, curta e exposta, e o desvio pelo bosque ao sul.
    id: 'map-campanha-5',
    name: 'Estrada da Mensageira',
    rows: [
      'ffff...^^^....ffff..',
      'fff.....^......fff..',
      'ff..............ff..',
      'f...:::....:::...f..',
      '....:^:....:^:......',
      '.....:......:.......',
      '....................',
      '....................',
      '....................',
      '.....:......:.......',
      'f...:F:....:F:...f..',
      'ff..ff......ff..ff..',
      'fff.f..........fff..',
      'ffff...^^^....ffff..',
      'fffff..^^^...fffff..',
    ],
    winCondition: { t: 'seize', target: { x: 18, y: 7 } },
  },
  {
    // Capítulo 6 — `rout` outra vez, e de propósito: o capítulo final é o único em que
    // matar todo mundo é o ponto. A muralha só tem o portão (9,8); o Mestre-Espadachim
    // espera no planalto de altura 2 lá dentro, e quem sobe pela frente luta de baixo.
    id: 'map-campanha-6',
    name: 'Fortaleza do Mestre',
    rows: [
      '..................',
      '.f..............f.',
      '......MMMMMMM.....',
      '......M:::::M.....',
      '......M:+++:M.....',
      '......M:+++:M.....',
      '......M:::::M.....',
      '......M:::::M.....',
      '......MMM.MMM.....',
      '..................',
      '..f............f..',
      '..ff..........ff..',
      '..................',
      '...:::......:::...',
      '...:^:......:^:...',
      '....:........:....',
      '.f..............f.',
      '..................',
    ],
    winCondition: { t: 'rout' },
  },
];

// ---------------------------------------------------------------------------
// Kits de classe (a convenção de autoria de M8/M9, num lugar só)
// ---------------------------------------------------------------------------

interface ClassKit {
  readonly weapon: string;
  readonly weaponType: string;
}

const CLASS_KITS: Readonly<Record<string, ClassKit>> = {
  'class-espadachim': { weapon: 'item-arma-espadachim', weaponType: 'sword' },
  'class-guerreiro': { weapon: 'item-arma-guerreiro', weaponType: 'axe' },
  'class-lanceiro': { weapon: 'item-arma-lanceiro', weaponType: 'spear' },
  'class-arqueiro': { weapon: 'item-arma-arqueiro', weaponType: 'bow' },
  'class-clerigo': { weapon: 'item-arma-clerigo', weaponType: 'holy' },
  'class-arcanista': { weapon: 'item-arma-arcanista', weaponType: 'arcane' },
  'class-druida': { weapon: 'item-arma-druida', weaponType: 'nature' },
  'class-couracado': { weapon: 'item-arma-couracado', weaponType: 'axe' },
  'class-grifeiro': { weapon: 'item-arma-grifeiro', weaponType: 'spear' },
  // A classe promovida não tem arma própria no catálogo (M8, sub-sessão 4/N): usa a do
  // espadachim, que é a arma que `allowedWeapons` permite.
  'class-mestre-espadachim': { weapon: 'item-arma-espadachim', weaponType: 'sword' },
};

function slugOf(classId: string): string {
  return classId.replace(/^class-/, '');
}

// ---------------------------------------------------------------------------
// Skills de mapa em área (§5.4) — o consumidor que faltava para `areaRadius`
// ---------------------------------------------------------------------------

// M11 (sub-sessão 2/N) implementou `mapSkill` com alvo em área e deixou registrado que
// `areaRadius` seguia sem conteúdo real: "a skill de mapa em área é conteúdo da fatia
// 3/N, junto dos mapas que a justificam". São estes dois. Nenhum dos dois é só um número
// de dano (critério de aceite de M12): cada um carrega um `EffectDef` que muda o round
// seguinte, e a duração é em ROUNDS DE MAPA — `duration:'duel'` é a unidade de dentro da
// troca, e uma skill lançada no mapa não está em duelo nenhum.
const MAP_SKILLS = [
  {
    id: 'skill-salva-arcana',
    name: 'Salva Arcana',
    kind: 'map',
    apCost: 1,
    cooldown: 2,
    // Abaixo do multiplicador de uma especial de duelo (1450 no Arcanista) de propósito:
    // acerta a área inteira, sem rolagem de acerto e sem crítico (§5.4).
    multiplier: 900,
    flat: 0,
    scalesWith: 'atk',
    duelRange: 4, // alcance de LANÇAMENTO (§5.4), não alcance de duelo
    areaRadius: 1,
    effects: [{ effectId: 'effect-lentidao', target: 'target', chance: 1000, duration: 2 }],
    tags: ['magic'],
  },
  {
    id: 'skill-luz-do-alvorecer',
    name: 'Luz do Alvorecer',
    kind: 'map',
    apCost: 1,
    cooldown: 3,
    multiplier: 800,
    flat: 0,
    scalesWith: 'atk',
    duelRange: 3,
    areaRadius: 1,
    // A tag `heal` é o discriminador desde M10 (sub-sessão 7/N): com ela a área mira
    // ALIADOS e o valor é cura determinística, sem variância.
    effects: [{ effectId: 'effect-regeneracao', target: 'target', chance: 1000, duration: 2 }],
    tags: ['holy', 'heal'],
  },
] as const;

// ---------------------------------------------------------------------------
// O elenco de cada capítulo
// ---------------------------------------------------------------------------

interface TacticsLine {
  readonly enabled: boolean;
  readonly skillId: string;
  readonly conditions: readonly unknown[];
}

interface UnitSpec {
  readonly unitId: string;
  readonly classId: string;
  readonly side: 'player' | 'enemy';
  readonly pos: readonly [number, number];
  // §9.1 — IA de mapa declarativa POR HERÓI. Ausente = controlada por humano: é o que
  // separa a party do jogador dos inimigos, e é a razão de o campo ser opcional no schema.
  readonly ai?: 'aggressive' | 'hold-position' | 'guard-tile' | 'flank' | 'support-nearest';
  readonly level?: number;
  readonly necklace?: string;
  readonly talents?: Readonly<Record<string, number>>;
  readonly extraDuelSkills?: readonly string[];
  readonly mapSkills?: readonly string[];
  readonly tactics?: readonly TacticsLine[];
}

interface EncounterSpec {
  readonly id: string;
  readonly name: string;
  readonly mapId: string;
  readonly chapter: number;
  readonly permadeath: 'casual' | 'classic' | 'ironman';
  readonly winCondition?: unknown;
  readonly units: readonly UnitSpec[];
}

// Linha de script que só dispara com HP baixo, na frente da linha ofensiva: o script
// tático é LITERAL e de cima pra baixo (§6.5), então esta ordem é o que transforma
// "curar ou bater" numa decisão em vez de uma troca fixa (M12, sub-sessão 2/N).
const CLERIGO_TACTICS: readonly TacticsLine[] = [
  { enabled: true, skillId: 'skill-cura-clerigo', conditions: [{ t: 'selfHpBelow', pct: 250 }] },
  { enabled: true, skillId: 'skill-especial-clerigo', conditions: [] },
];

const HERO_ID = 'hero-jogador';

// A party cresce por capítulo: o herói sozinho no tutorial, quatro no cerco. É o que dá
// sujeito às mecânicas de M10 que a campanha nunca exercitou — assistência
// (`onAllyEngagedNearby`), cura de assistência, e o `escort` de alguém que não é o próprio
// herói. Decisão do usuário (ver DECISIONS.md).
const PLAYER_CLERIGO: UnitSpec = {
  unitId: 'ally-clerigo',
  classId: 'class-clerigo',
  side: 'player',
  pos: [0, 0], // sobrescrito por capítulo
  necklace: 'item-colar-guardiao',
  talents: { 'talent-clerigo-foco-em-equipe': 1 },
  extraDuelSkills: ['skill-cura-clerigo'],
  tactics: CLERIGO_TACTICS,
};

const PLAYER_ARQUEIRO: UnitSpec = {
  unitId: 'ally-arqueiro',
  classId: 'class-arqueiro',
  side: 'player',
  pos: [0, 0],
  necklace: 'item-colar-forca',
  // O talento que CONCEDE a reação `onDamaged` (M12, sub-sessão 2/N): sem ele
  // `skill-folego-de-combate` não está nas reações conhecidas da unidade.
  talents: { 'talent-arqueiro-reacao-propria': 1 },
};

const PLAYER_ARCANISTA: UnitSpec = {
  unitId: 'ally-arcanista',
  classId: 'class-arcanista',
  side: 'player',
  pos: [0, 0],
  necklace: 'item-colar-forca',
  mapSkills: ['skill-salva-arcana'],
};

function at(spec: UnitSpec, x: number, y: number): UnitSpec {
  return { ...spec, pos: [x, y] };
}

const ENCOUNTERS: readonly EncounterSpec[] = [
  {
    id: 'encounter-campanha-1',
    name: 'Capítulo 1 — O Bloqueio na Estrada',
    mapId: 'map-campanha-1',
    chapter: 1,
    permadeath: 'casual',
    units: [
      { unitId: HERO_ID, classId: 'class-espadachim', side: 'player', pos: [1, 7], necklace: 'item-colar-forca' },
      // UM bandido, não dois. Não é escolha estética: AP e PP são pools da BATALHA
      // (§6.3) e o lado em menor número gasta o dobro pra defender o mesmo turno — um
      // herói sozinho contra dois perde por exaustão de recurso mesmo contra inimigos
      // muito abaixo do nível dele (medido: nível 5 contra o herói de 10, derrota).
      // Enquanto a party tem uma unidade só, o capítulo tem um inimigo só; a partir do
      // capítulo 2, com aliado, a campanha pode superar o jogador em número.
      { unitId: 'unit-bandido-1', classId: 'class-guerreiro', side: 'enemy', pos: [12, 7], ai: 'aggressive', level: 8 },
    ],
  },
  {
    id: 'encounter-campanha-2',
    name: 'Capítulo 2 — O Acampamento da Serra',
    mapId: 'map-campanha-2',
    chapter: 2,
    permadeath: 'casual',
    units: [
      { unitId: HERO_ID, classId: 'class-espadachim', side: 'player', pos: [1, 7], necklace: 'item-colar-forca' },
      { ...at(PLAYER_CLERIGO, 1, 8), mapSkills: ['skill-luz-do-alvorecer'] },
      // Guarda o acampamento com trela curta (`guard-tile` anda no máximo 2 tiles por
      // vez): sair caçando o jogador seria abrir o objetivo.
      { unitId: 'unit-patrulheiro-1', classId: 'class-lanceiro', side: 'enemy', pos: [11, 7], ai: 'guard-tile', level: 8 },
      { unitId: 'unit-patrulheiro-2', classId: 'class-guerreiro', side: 'enemy', pos: [9, 3], ai: 'aggressive', level: 8 },
      { unitId: 'unit-patrulheiro-3', classId: 'class-arqueiro', side: 'enemy', pos: [12, 6], ai: 'hold-position', level: 8 },
    ],
  },
  {
    id: 'encounter-campanha-3',
    name: 'Capítulo 3 — O Desfiladeiro',
    mapId: 'map-campanha-3',
    chapter: 3,
    permadeath: 'casual',
    units: [
      // A party nasce colada no desfiladeiro (distância 1) e os invasores a 5+ tiles: o
      // tile é do jogador no round 1 se ele quiser, e perdê-lo é decisão dele.
      { unitId: HERO_ID, classId: 'class-espadachim', side: 'player', pos: [6, 7], necklace: 'item-colar-forca' },
      at(PLAYER_CLERIGO, 5, 7),
      at(PLAYER_ARQUEIRO, 6, 6),
      { unitId: 'unit-invasor-1', classId: 'class-guerreiro', side: 'enemy', pos: [12, 7], ai: 'aggressive', level: 9 },
      { unitId: 'unit-invasor-2', classId: 'class-lanceiro', side: 'enemy', pos: [12, 5], ai: 'aggressive', level: 9 },
      { unitId: 'unit-invasor-3', classId: 'class-arqueiro', side: 'enemy', pos: [13, 9], ai: 'flank', level: 9 },
    ],
  },
  {
    id: 'encounter-campanha-4',
    name: 'Capítulo 4 — Cerco no Bosque',
    mapId: 'map-campanha-4',
    chapter: 4,
    permadeath: 'casual',
    units: [
      // Os quatro patamares de altura 1 em volta da clareira central: a party sobe, os
      // inimigos atacam de baixo.
      { unitId: HERO_ID, classId: 'class-espadachim', side: 'player', pos: [6, 7], necklace: 'item-colar-forca' },
      at(PLAYER_CLERIGO, 6, 8),
      at(PLAYER_ARQUEIRO, 9, 7),
      at(PLAYER_ARCANISTA, 9, 8),
      // Nas quatro bordas, fora do alcance de qualquer um deles no round 1: um cerco que
      // já começa em cima da party tira o turno do jogador antes do primeiro comando dele.
      { unitId: 'unit-cerco-1', classId: 'class-guerreiro', side: 'enemy', pos: [7, 0], ai: 'aggressive', level: 9 },
      { unitId: 'unit-cerco-2', classId: 'class-lanceiro', side: 'enemy', pos: [0, 7], ai: 'aggressive', level: 9 },
      { unitId: 'unit-cerco-3', classId: 'class-arqueiro', side: 'enemy', pos: [15, 8], ai: 'flank', level: 9 },
      { unitId: 'unit-cerco-4', classId: 'class-grifeiro', side: 'enemy', pos: [8, 15], ai: 'flank', level: 9 },
    ],
  },
  {
    id: 'encounter-campanha-5',
    name: 'Capítulo 5 — A Mensageira',
    mapId: 'map-campanha-5',
    chapter: 5,
    permadeath: 'casual',
    // Sobrepõe o `seize` do layout: a condição nomeia uma unidade que só existe aqui.
    winCondition: { t: 'escort', unitId: 'ally-mensageira', target: { x: 18, y: 7 } },
    units: [
      { unitId: HERO_ID, classId: 'class-espadachim', side: 'player', pos: [1, 7], necklace: 'item-colar-forca' },
      at(PLAYER_CLERIGO, 1, 8),
      at(PLAYER_ARQUEIRO, 1, 6),
      at(PLAYER_ARCANISTA, 0, 7),
      // A escoltada: nível abaixo do resto e sem colar. Perdê-la é derrota imediata
      // (§5.7, leitura de M11), então ela é a peça que o jogador tem que cobrir — e o
      // motivo de a party inteira existir.
      {
        unitId: 'ally-mensageira',
        classId: 'class-druida',
        side: 'player',
        pos: [2, 7],
        level: 8,
      },
      { unitId: 'unit-emboscada-1', classId: 'class-lanceiro', side: 'enemy', pos: [10, 2], ai: 'flank', level: 9 },
      { unitId: 'unit-emboscada-2', classId: 'class-guerreiro', side: 'enemy', pos: [10, 12], ai: 'flank', level: 9 },
      { unitId: 'unit-emboscada-3', classId: 'class-arqueiro', side: 'enemy', pos: [16, 5], ai: 'hold-position', level: 9 },
      { unitId: 'unit-emboscada-4', classId: 'class-couracado', side: 'enemy', pos: [17, 7], ai: 'guard-tile', level: 9 },
    ],
  },
  {
    id: 'encounter-campanha-6',
    name: 'Capítulo 6 — A Fortaleza do Mestre',
    mapId: 'map-campanha-6',
    chapter: 6,
    permadeath: 'casual',
    units: [
      { unitId: HERO_ID, classId: 'class-espadachim', side: 'player', pos: [9, 12], necklace: 'item-colar-forca' },
      at(PLAYER_CLERIGO, 8, 12),
      at(PLAYER_ARQUEIRO, 10, 12),
      at(PLAYER_ARCANISTA, 9, 13),
      // O quinto da party, e só no capítulo final: `armored`, `moveType:'heavy'`, é quem
      // aguenta o portão enquanto o resto entra.
      {
        unitId: 'ally-couracado',
        classId: 'class-couracado',
        side: 'player',
        pos: [8, 13],
        necklace: 'item-colar-guardiao',
      },
      // O portão (9,8) é a única brecha da muralha; o Couraçado o TAMPA (começa em cima
      // dele) com trela curta, e carrega o gatilho de morte de M10
      // (`skill-ultimo-suspiro`, `perBattle`).
      {
        unitId: 'unit-guarda-portao',
        classId: 'class-couracado',
        side: 'enemy',
        pos: [9, 8],
        ai: 'guard-tile',
        extraDuelSkills: ['skill-ultimo-suspiro'],
      },
      // Nasce DENTRO da fortaleza e sai voando por cima da muralha: é o único
      // `moveType:'flying'` do roster, e este é o mapa onde isso significa alguma coisa —
      // a party não pode tratar a muralha como segurança.
      { unitId: 'unit-sentinela-alada', classId: 'class-grifeiro', side: 'enemy', pos: [11, 3], ai: 'flank' },
      // Fica na retaguarda, dentro do alcance de assistência de quem está apanhando.
      {
        unitId: 'unit-capelao',
        classId: 'class-clerigo',
        side: 'enemy',
        pos: [8, 3],
        ai: 'support-nearest',
        talents: { 'talent-clerigo-foco-em-equipe': 1 },
        extraDuelSkills: ['skill-cura-clerigo'],
        tactics: CLERIGO_TACTICS,
      },
      // Espera no planalto de altura 2: quem o engaja de baixo entrega vantagem de altura
      // (§6.6). `hold-position` nunca sai de lá — o jogador escolhe a hora.
      {
        unitId: 'unit-chefe',
        classId: 'class-mestre-espadachim',
        side: 'enemy',
        pos: [9, 4],
        ai: 'hold-position',
        necklace: 'item-colar-forca',
        level: 11,
      },
    ],
  },
];

// ---------------------------------------------------------------------------
// Geração
// ---------------------------------------------------------------------------

const DEFAULT_LEVEL = 10;

function buildMap(spec: MapSpec): unknown {
  const height = spec.rows.length;
  const width = spec.rows[0]?.length ?? 0;

  const tiles = spec.rows.map((row, y) => {
    if (row.length !== width) {
      throw new Error(`${spec.id}: linha y=${y} tem ${row.length} colunas, esperado ${width}`);
    }
    return [...row].map((glyph, x) => {
      const tile = GLYPHS[glyph as Glyph];
      if (!tile) throw new Error(`${spec.id}: glifo desconhecido '${glyph}' em (${x},${y})`);
      return { terrain: tile.terrain, height: tile.height };
    });
  });

  return {
    id: spec.id,
    name: spec.name,
    width,
    height,
    tiles,
    zocEnabled: true,
    initialValor: 5, // §5.6 — "Começa em 5"
    winCondition: spec.winCondition,
  };
}

// A altura da unidade NÃO é autorada: sai do tile em que ela começa. `move` já copia a
// altura do destino (`commands.ts`), então autorar um número à mão só criaria a chance de
// a unidade nascer com altura que o mapa não tem — e a vantagem posicional de §6.6 sairia
// de um número inventado em vez do terreno.
function heightAt(mapSpec: MapSpec, x: number, y: number): 0 | 1 | 2 | 3 {
  const row = mapSpec.rows[y];
  const glyph = row?.[x];
  if (!glyph) throw new Error(`${mapSpec.id}: posição (${x},${y}) fora do grid`);
  const tile = GLYPHS[glyph as Glyph];
  if (!tile) throw new Error(`${mapSpec.id}: glifo desconhecido '${glyph}' em (${x},${y})`);
  return tile.height;
}

function buildHero(spec: UnitSpec): unknown {
  const kit = CLASS_KITS[spec.classId];
  if (!kit) throw new Error(`classe sem kit declarado: ${spec.classId}`);
  const slug = slugOf(spec.classId);

  return {
    id: spec.unitId,
    classId: spec.classId,
    level: spec.level ?? DEFAULT_LEVEL,
    exp: 0,
    awakening: 0,
    imprint: 0,
    talents: spec.talents ?? {},
    equipment: {
      weapon: kit.weapon,
      helmet: null,
      armor: null,
      necklace: spec.necklace ?? null,
      ring: null,
      boots: null,
    },
    weaponType: kit.weaponType,
    duelSkills: [`skill-ataque-${slug}`, `skill-especial-${slug}`, ...(spec.extraDuelSkills ?? [])],
    mapSkills: [...(spec.mapSkills ?? [])],
    tacticsScript: spec.tactics ?? [{ enabled: true, skillId: `skill-especial-${slug}`, conditions: [] }],
  };
}

function buildEncounter(spec: EncounterSpec, mapSpec: MapSpec): unknown {
  return {
    id: spec.id,
    name: spec.name,
    mapId: spec.mapId,
    chapter: spec.chapter,
    permadeath: spec.permadeath,
    ...(spec.winCondition ? { winCondition: spec.winCondition } : {}),
    units: spec.units.map((unit) => ({
      unitId: unit.unitId,
      side: unit.side,
      hero: buildHero(unit),
      pos: { x: unit.pos[0], y: unit.pos[1] },
      height: heightAt(mapSpec, unit.pos[0], unit.pos[1]),
      ...(unit.ai ? { aiArchetype: unit.ai } : {}),
    })),
  };
}

function packageRoot(): string {
  return join(dirname(fileURLToPath(import.meta.url)), '..');
}

function writeJson(dir: string, id: string, content: unknown): void {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `${id}.json`), `${JSON.stringify(content, null, 2)}\n`, 'utf8');
}

// Os 3 layouts provisórios de M9 (planície pura, portados de M6) e os encounters que
// apontavam pra eles saem: um mapa órfão no catálogo continuaria sendo carregado por
// `loadCatalogFromDisk` e apareceria como conteúdo válido do jogo.
function removeRetired(dir: string, predicate: (file: string) => boolean): string[] {
  const removed: string[] = [];
  for (const file of readdirSync(dir)) {
    if (!file.endsWith('.json') || !predicate(file)) continue;
    rmSync(join(dir, file));
    removed.push(file);
  }
  return removed;
}

function main(): void {
  const root = packageRoot();
  const mapsDir = join(root, 'maps');
  const encountersDir = join(root, 'encounters');
  const skillsDir = join(root, 'skills');

  const retired = [
    ...removeRetired(mapsDir, (file) => file.includes('provisorio')),
    ...removeRetired(encountersDir, () => true),
  ];

  for (const skill of MAP_SKILLS) {
    skillSchema.parse(skill); // falha cedo se o gerador produzir algo inválido
    writeJson(skillsDir, skill.id, skill);
  }

  const mapById = new Map(MAPS.map((spec) => [spec.id, spec]));
  for (const spec of MAPS) {
    const map = buildMap(spec);
    mapSchema.parse(map);
    writeJson(mapsDir, spec.id, map);
  }

  for (const spec of ENCOUNTERS) {
    const mapSpec = mapById.get(spec.mapId);
    if (!mapSpec) throw new Error(`${spec.id}: mapId inexistente entre os layouts: ${spec.mapId}`);
    const encounter = buildEncounter(spec, mapSpec);
    encounterSchema.parse(encounter);
    writeJson(encountersDir, spec.id, encounter);
  }

  console.log(
    `Gerado: ${MAPS.length} mapas de campanha, ${ENCOUNTERS.length} encounters, ${MAP_SKILLS.length} skills de mapa. Aposentados: ${retired.join(', ')}.`,
  );
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  main();
}
