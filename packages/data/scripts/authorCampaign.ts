import { mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import encounterSchema from '../schemas/encounters.schema.js';
import { enemyIdOrThrow } from './authorEnemies.js';
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
// - `terrain-montanha`  `impassable` para tudo que não voa.
//
// M15 (D3) mudou o parágrafo que estava aqui. Até M14, `Tile.object` ('wall' | 'gate' | ...)
// existia no schema e NINGUÉM lia, então autorar um muro seria cenário decorativo se fazendo
// passar por regra, e todo chokepoint desta campanha virou montanha. Agora `wall` e `gate`
// bloqueiam de verdade (`grid/pathfinding.ts`), e a diferença entre os dois tipos de parede
// passou a importar: **montanha custa 1 para quem voa** (§5.1), alvenaria não deixa passar
// ninguém. Muralha de fortaleza é alvenaria — ver `map-campanha-6`.
//
// A altura é do TILE e vale por si: `move` copia a altura do destino para a unidade
// (`commands.ts`) e `positional.ts` converte diferença de altura em dano e acerto. Tile com
// objeto que bloqueia não é pisável, então a altura dele não é lida por ninguém.
const GLYPHS = {
  '.': { terrain: 'terrain-planicie', height: 0 },
  ':': { terrain: 'terrain-planicie', height: 1 },
  '+': { terrain: 'terrain-planicie', height: 2 },
  f: { terrain: 'terrain-floresta', height: 0 },
  F: { terrain: 'terrain-floresta', height: 1 },
  '^': { terrain: 'terrain-montanha', height: 2 },
  M: { terrain: 'terrain-montanha', height: 3 },
  // §5.1 (M15 D3) — alvenaria. Intransponível para TODO `moveType`, inclusive `flying`.
  W: { terrain: 'terrain-planicie', height: 0, object: 'wall' },
  // Portão TRANCADO: a guarnição barrou a porta, ninguém tem a chave, e os dois lados só
  // passam arrombando — 3 turnos-unidade de pancada.
  //
  // Foi medido, não escolhido no gosto: com o portão abrindo para a guarnição, a IA de mapa
  // caminhava até ele e o `wait` do mesmo turno o destrancava, então a fortaleza amanhecia
  // aberta no round 1 e a durabilidade era decoração (M15 2/N, ver DECISIONS.md).
  G: {
    terrain: 'terrain-planicie',
    height: 0,
    object: 'gate',
    gate: { opensFor: 'none', durability: 3 },
  },
} as const satisfies Record<
  string,
  {
    terrain: string;
    height: 0 | 1 | 2 | 3;
    object?: string;
    gate?: { opensFor: string; durability: number };
  }
>;

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
    // matar todo mundo é o ponto. O Mestre-Espadachim espera no planalto de altura 2 lá
    // dentro, e quem sobe pela frente luta de baixo.
    //
    // M15 (D3, decisão do usuário na sub-sessão 2/N): a muralha era montanha e o portão era
    // um VÃO — os dois só de nome. Agora é **alvenaria** (`W`) com um **portão** (`G`) em
    // (9,8), e as duas coisas mudaram o mapa de verdade:
    //   - a muralha barra a Sentinela Alada, que até M14 sobrevoava a fortaleza porque
    //     montanha custa 1 para `flying`. Isto SUBSTITUI a leitura de M12 3/N ("este é o
    //     mapa onde o voo significa alguma coisa"): o voo dela agora significa mobilidade
    //     dentro do campo, não atravessar a fortaleza;
    //   - o portão está TRANCADO (`opensFor: 'none'`): a guarnição barrou a porta sob
    //     assalto e nem ela tem a chave. Quem quiser passar arromba — 3 turnos-unidade de
    //     pancada, valendo para os dois lados. Foi assim depois de MEDIR: com o portão
    //     abrindo para a guarnição, a IA de mapa andava até ele e o `wait` do mesmo turno o
    //     destrancava, então a fortaleza amanhecia aberta no round 1 e a durabilidade era
    //     decoração (ver DECISIONS.md, M15 2/N).
    id: 'map-campanha-6',
    name: 'Fortaleza do Mestre',
    rows: [
      '..................',
      '.f..............f.',
      '......WWWWWWW.....',
      '......W:::::W.....',
      '......W:+++:W.....',
      '......W:+++:W.....',
      '......W:::::W.....',
      '......W:::::W.....',
      '......WWWGWWW.....',
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

export function slugOf(classId: string): string {
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

type MapAi = 'aggressive' | 'hold-position' | 'guard-tile' | 'flank' | 'support-nearest';

// §8.1 (M17, 3/N) — a unidade do jogador continua sendo uma FICHA (classe, nível, colar,
// talentos: as coisas que existem porque um personagem progride), e o inimigo passou a ser
// uma REFERÊNCIA ao catálogo de `enemies/`.
//
// A assimetria é o milestone inteiro num tipo só. Antes destes dois tipos serem separados,
// autorar o capítulo 4 era escrever "um arqueiro nível 9" e torcer para que a curva
// produzisse a dificuldade pretendida; agora é escolher `enemy-cerco-arqueiro`, cuja força
// está escrita por extenso e é editável sem passar por classe nenhuma.
export interface UnitSpec {
  readonly unitId: string;
  // §8.1/§8.2 (M17, 4/N) — QUEM esta unidade é. Obrigatório na campanha, onde o lado do
  // jogador é o ELENCO (`encounters.schema.ts` recusa o herói sem ele), e ausente na VAGA
  // de referência da masmorra, que é slot e não pessoa — `authorDungeons.ts` reusa este
  // spec e não preenche o campo.
  //
  // Declarado em vez de derivado de `unitId`: a árvore de talentos é do personagem (D6), e
  // uma coincidência de nomes não é lugar de guardar isso.
  readonly characterId?: string;
  readonly classId: string;
  // §10/D16 (M18, 5/N) — `ally` é o ALIADO DE CENÁRIO: uma unidade que luta do lado do
  // jogador e NÃO é do elenco. Existe porque o capítulo 5 escolta a Mensageira, e ela virou
  // adquirível: quem não a puxou não teria a unidade nomeada por `escort`, e o capítulo
  // nasceria sem desfecho possível. Um aliado nunca declara `characterId`.
  readonly side: 'player' | 'ally';
  readonly pos: readonly [number, number];
  // §9.1 — IA de mapa declarativa POR HERÓI. Ausente = controlada por humano: é o que
  // separa a party do jogador dos inimigos, e é a razão de o campo ser opcional no schema.
  readonly ai?: MapAi;
  readonly level?: number;
  readonly necklace?: string;
  readonly talents?: Readonly<Record<string, number>>;
  readonly extraDuelSkills?: readonly string[];
  readonly mapSkills?: readonly string[];
  readonly tactics?: readonly TacticsLine[];
}

export interface EnemyUnitSpec {
  readonly unitId: string;
  // Checado contra `ENEMIES` na geração (`enemyIdOrThrow`): id errado aqui viraria um
  // encontro que só falha um pacote adiante, na validação cruzada de `packages/content`.
  readonly enemyId: string;
  readonly side: 'enemy';
  readonly pos: readonly [number, number];
  readonly ai?: MapAi;
}

type EncounterUnitSpec = UnitSpec | EnemyUnitSpec;

interface EncounterSpec {
  readonly id: string;
  readonly name: string;
  readonly mapId: string;
  readonly chapter: number;
  readonly permadeath: 'casual' | 'classic' | 'ironman';
  readonly winCondition?: unknown;
  readonly units: readonly EncounterUnitSpec[];
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
  characterId: 'ally-clerigo',
  classId: 'class-clerigo',
  side: 'player',
  pos: [0, 0], // sobrescrito por capítulo
  necklace: 'item-colar-guardiao',
  // §8.2 (M17, 4/N) — era `talent-clerigo-foco-em-equipe`, um nó da árvore de CLASSE que
  // deixou de existir. O equivalente na árvore de Miron é `mao-que-alcanca` (a mesma
  // `grantReaction skill-assistir`), e ele mora na linha 3: a árvore nova é um CAMINHO, então
  // chegar até ele custa descer a coluna A desde a linha 1.
  talents: {
    'talent-miron-imposicao-de-maos': 1,
    'talent-miron-oracao-constante': 1,
    'talent-miron-mao-que-alcanca': 1,
  },
  extraDuelSkills: ['skill-cura-clerigo'],
  tactics: CLERIGO_TACTICS,
};

const PLAYER_ARQUEIRO: UnitSpec = {
  unitId: 'ally-arqueiro',
  characterId: 'ally-arqueiro',
  classId: 'class-arqueiro',
  side: 'player',
  pos: [0, 0],
  necklace: 'item-colar-forca',
  // O talento que CONCEDE a reação `onDamaged` (M12, sub-sessão 2/N): sem ele
  // `skill-folego-de-combate` não está nas reações conhecidas da unidade. Era
  // `talent-arqueiro-reacao-propria` na árvore de classe; na árvore de Sylla é
  // `folego-de-combate`, linha 2 da coluna B, e a linha 1 dela é o preço do caminho.
  talents: {
    'talent-sylla-pes-leves': 1,
    'talent-sylla-folego-de-combate': 1,
  },
};

const PLAYER_ARCANISTA: UnitSpec = {
  unitId: 'ally-arcanista',
  characterId: 'ally-arcanista',
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
      { unitId: HERO_ID, characterId: HERO_ID, classId: 'class-espadachim', side: 'player', pos: [1, 7], necklace: 'item-colar-forca' },
      // UM bandido, não dois. Não é escolha estética: AP e PP são pools da BATALHA
      // (§6.3) e o lado em menor número gasta o dobro pra defender o mesmo turno — um
      // herói sozinho contra dois perde por exaustão de recurso mesmo contra inimigos
      // muito abaixo do nível dele (medido: nível 5 contra o herói de 10, derrota).
      // Enquanto a party tem uma unidade só, o capítulo tem um inimigo só; a partir do
      // capítulo 2, com aliado, a campanha pode superar o jogador em número.
      { unitId: 'unit-bandido-1', enemyId: 'enemy-bandido', side: 'enemy', pos: [12, 7], ai: 'aggressive' },
    ],
  },
  {
    id: 'encounter-campanha-2',
    name: 'Capítulo 2 — O Acampamento da Serra',
    mapId: 'map-campanha-2',
    chapter: 2,
    permadeath: 'casual',
    units: [
      { unitId: HERO_ID, characterId: HERO_ID, classId: 'class-espadachim', side: 'player', pos: [1, 7], necklace: 'item-colar-forca' },
      { ...at(PLAYER_CLERIGO, 1, 8), mapSkills: ['skill-luz-do-alvorecer'] },
      // Guarda o acampamento com trela curta (`guard-tile` anda no máximo 2 tiles por
      // vez): sair caçando o jogador seria abrir o objetivo.
      { unitId: 'unit-patrulheiro-1', enemyId: 'enemy-patrulheiro-lanceiro', side: 'enemy', pos: [11, 7], ai: 'guard-tile' },
      { unitId: 'unit-patrulheiro-2', enemyId: 'enemy-patrulheiro-guerreiro', side: 'enemy', pos: [9, 3], ai: 'aggressive' },
      // (12,6) -> (12,4). O objetivo de `seize` é (12,7), e este arqueiro é `hold-position`: ele
      // NUNCA se move, então o alcance dele é um disco permanente. Com `bow` valendo 1 o disco
      // não alcançava o objetivo; com 2 ele passou a cobrir o objetivo E a aproximação, sem
      // poder ser revidado — a party inteira morria entrando (medido: os dois heróis a 0 de HP
      // no round 6, o herói caído em (12,5)). A três tiles ele ainda pune quem vem pelo norte e
      // deixa de sentar em cima do objetivo. Mesmo defeito do capítulo 4, mesma correção:
      // posicionamento, não número.
      { unitId: 'unit-patrulheiro-3', enemyId: 'enemy-patrulheiro-arqueiro', side: 'enemy', pos: [12, 4], ai: 'hold-position' },
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
      { unitId: HERO_ID, characterId: HERO_ID, classId: 'class-espadachim', side: 'player', pos: [6, 7], necklace: 'item-colar-forca' },
      at(PLAYER_CLERIGO, 5, 7),
      at(PLAYER_ARQUEIRO, 6, 6),
      { unitId: 'unit-invasor-1', enemyId: 'enemy-invasor-guerreiro', side: 'enemy', pos: [12, 7], ai: 'aggressive' },
      { unitId: 'unit-invasor-2', enemyId: 'enemy-invasor-lanceiro', side: 'enemy', pos: [12, 5], ai: 'aggressive' },
      { unitId: 'unit-invasor-3', enemyId: 'enemy-invasor-arqueiro', side: 'enemy', pos: [13, 9], ai: 'flank' },
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
      { unitId: HERO_ID, characterId: HERO_ID, classId: 'class-espadachim', side: 'player', pos: [6, 7], necklace: 'item-colar-forca' },
      at(PLAYER_CLERIGO, 6, 8),
      at(PLAYER_ARQUEIRO, 9, 7),
      at(PLAYER_ARCANISTA, 9, 8),
      // Nas quatro bordas, fora do alcance de qualquer um deles no round 1: um cerco que
      // já começa em cima da party tira o turno do jogador antes do primeiro comando dele.
      //
      // "Fora de alcance" é `moveRange + duelRange < distância`, e o passe do HANDOFF de
      // 2026-08-28 mudou o lado direito dessa conta: com `bow` valendo 2 em vez de 1, o
      // arqueiro passou a somar 6 (4 de movimento + 2 de alcance) e (15,8) ficava a exatamente
      // 6 do arcanista em (9,8) — ele abria duelo ANTES do primeiro comando do jogador, e o
      // arcanista chegava ao turno 1 com 167 de 640 de HP. Foi (15,8) -> (15,10): 8 de
      // distância do herói mais próximo, dois de folga. Erro de posicionamento no encounter,
      // não do motor, como `packages/content/tests/encounters.test.ts` já dizia.
      { unitId: 'unit-cerco-1', enemyId: 'enemy-cerco-guerreiro', side: 'enemy', pos: [7, 0], ai: 'aggressive' },
      { unitId: 'unit-cerco-2', enemyId: 'enemy-cerco-lanceiro', side: 'enemy', pos: [0, 7], ai: 'aggressive' },
      { unitId: 'unit-cerco-3', enemyId: 'enemy-cerco-arqueiro', side: 'enemy', pos: [15, 10], ai: 'flank' },
      { unitId: 'unit-cerco-4', enemyId: 'enemy-cerco-grifeiro', side: 'enemy', pos: [8, 15], ai: 'flank' },
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
      { unitId: HERO_ID, characterId: HERO_ID, classId: 'class-espadachim', side: 'player', pos: [1, 7], necklace: 'item-colar-forca' },
      at(PLAYER_CLERIGO, 1, 8),
      at(PLAYER_ARQUEIRO, 1, 6),
      at(PLAYER_ARCANISTA, 0, 7),
      // A escoltada: nível abaixo do resto e sem colar. Perdê-la é derrota imediata
      // (§5.7, leitura de M11), então ela é a peça que o jogador tem que cobrir — e o
      // motivo de a party inteira existir.
      //
      // §10/D16 (M18, 5/N) — ela é um ALIADO DE CENÁRIO e não uma personagem do jogador.
      // Wren é adquirível (D14): enquanto ela ocupava uma vaga da party, quem não a tinha
      // não tinha a unidade que `escort` nomeia, e o capítulo era injogável — medido, não
      // suposto. Como NPC ela está sempre lá, e a aquisição ganha o sentido que a narrativa
      // já dava: "A Mensageira" é quem você encontra e escolta.
      {
        unitId: 'ally-mensageira',
        classId: 'class-druida',
        side: 'ally',
        pos: [2, 7],
        level: 8,
      },
      { unitId: 'unit-emboscada-1', enemyId: 'enemy-emboscada-lanceiro', side: 'enemy', pos: [10, 2], ai: 'flank' },
      { unitId: 'unit-emboscada-2', enemyId: 'enemy-emboscada-guerreiro', side: 'enemy', pos: [10, 12], ai: 'flank' },
      { unitId: 'unit-emboscada-3', enemyId: 'enemy-emboscada-arqueiro', side: 'enemy', pos: [16, 5], ai: 'hold-position' },
      { unitId: 'unit-emboscada-4', enemyId: 'enemy-emboscada-couracado', side: 'enemy', pos: [17, 7], ai: 'guard-tile' },
    ],
  },
  {
    id: 'encounter-campanha-6',
    name: 'Capítulo 6 — A Fortaleza do Mestre',
    mapId: 'map-campanha-6',
    chapter: 6,
    permadeath: 'casual',
    units: [
      { unitId: HERO_ID, characterId: HERO_ID, classId: 'class-espadachim', side: 'player', pos: [9, 12], necklace: 'item-colar-forca' },
      at(PLAYER_CLERIGO, 8, 12),
      at(PLAYER_ARQUEIRO, 10, 12),
      at(PLAYER_ARCANISTA, 9, 13),
      // A quinta unidade do tabuleiro, e só no capítulo final: `armored`,
      // `moveType:'heavy'`, é quem aguenta o portão enquanto o resto entra.
      //
      // §10/D16 (M18, 5/N) — ALIADO DE CENÁRIO, pela mesma razão da Mensageira no capítulo
      // 5 e por decisão do usuário. Bardan é adquirível (D14), e enquanto ele ocupava uma
      // VAGA o capítulo nomeava alguém que o jogador talvez não possua — a vaga é preenchida
      // em produção por quem ele levar, então nomear um adquirível ali é escrever uma party
      // que não é a dele. Como NPC ele está sempre lá, a dificuldade fica idêntica, e o
      // capítulo final continua com cinco unidades do lado do jogador.
      {
        unitId: 'ally-couracado',
        classId: 'class-couracado',
        side: 'ally',
        pos: [8, 13],
        necklace: 'item-colar-guardiao',
      },
      // O portão (9,8) é a única brecha da muralha. Até M14 o Couraçado o TAMPAVA, nascendo
      // em cima dele; com o vão virando portão de verdade (M15 D3) o tile deixou de ser
      // pisável, e o guarda espera DENTRO, em (9,6).
      //
      // Um tile atrás do portão, e não colado nele, de propósito: `guard-tile` cai em `wait`
      // quando não alcança ninguém (§9.1), e `wait` ao lado do portão o ABRE para o lado da
      // guarnição — colado, ele destrancaria a fortaleza no round 1 e a durabilidade nunca
      // seria exercida. De (9,6) ele só avança para (9,7) quando a party chega perto, e é
      // então que a decisão aparece: arrombar (3 turnos-unidade) antes de a guarnição abrir,
      // ou esperar e lutar em campo aberto. Mantém a trela curta e o gatilho de morte de M10
      // (`skill-ultimo-suspiro`, `perBattle`).
      { unitId: 'unit-guarda-portao', enemyId: 'enemy-guarda-portao', side: 'enemy', pos: [9, 6], ai: 'guard-tile' },
      // Nasce DENTRO da fortaleza. Até M14 saía voando por cima da muralha (montanha custa 1
      // para `flying`); com a muralha virando alvenaria ela sai pelo portão como todo mundo,
      // e o voo dela passa a valer pelo terreno do campo aberto lá fora.
      { unitId: 'unit-sentinela-alada', enemyId: 'enemy-sentinela-alada', side: 'enemy', pos: [11, 3], ai: 'flank' },
      // Fica na retaguarda, dentro do alcance de assistência de quem está apanhando.
      { unitId: 'unit-capelao', enemyId: 'enemy-capelao', side: 'enemy', pos: [8, 3], ai: 'support-nearest' },
      // Espera no planalto de altura 2: quem o engaja de baixo entrega vantagem de altura
      // (§6.6). `hold-position` nunca sai de lá — o jogador escolhe a hora.
      { unitId: 'unit-chefe', enemyId: 'enemy-chefe', side: 'enemy', pos: [9, 4], ai: 'hold-position' },
    ],
  },
];

// ---------------------------------------------------------------------------
// Geração
// ---------------------------------------------------------------------------

export const DEFAULT_LEVEL = 10;

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
      // `object`/`gate` (M15 D3) só existem em alguns glifos; escrever as chaves como
      // `undefined` deixaria `"object": null` no JSON e o schema recusaria.
      return {
        terrain: tile.terrain,
        height: tile.height,
        ...('object' in tile ? { object: tile.object } : {}),
        ...('gate' in tile ? { gate: tile.gate } : {}),
      };
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

export function buildHero(spec: UnitSpec): unknown {
  const kit = CLASS_KITS[spec.classId];
  if (!kit) throw new Error(`classe sem kit declarado: ${spec.classId}`);
  const slug = slugOf(spec.classId);

  return {
    id: spec.unitId,
    ...(spec.characterId ? { characterId: spec.characterId } : {}),
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
      // §8.1 — os dois lados do tabuleiro deixaram de ser o mesmo objeto. O jogador leva
      // uma ficha; o inimigo é uma referência ao que já está autorado.
      // §8.1 — o inimigo é uma referência ao que já está autorado; o jogador e o aliado de
      // cenário levam ficha. A diferença entre estes dois é o `characterId`, que `buildHero`
      // só emite quando o spec o declara — e o aliado, por D16, nunca declara.
      ...(unit.side === 'enemy' ? { enemyId: enemyIdOrThrow(unit.enemyId) } : { hero: buildHero(unit) }),
      pos: { x: unit.pos[0], y: unit.pos[1] },
      height: heightAt(mapSpec, unit.pos[0], unit.pos[1]),
      ...(unit.ai ? { aiArchetype: unit.ai } : {}),
    })),
  };
}

export function packageRoot(): string {
  return join(dirname(fileURLToPath(import.meta.url)), '..');
}

export function writeJson(dir: string, id: string, content: unknown): void {
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
