import { RULES_VERSION } from '@paths-beyond/core';
import type { ClassDef, GridMap, Hero, SkillDef, StatSheet, Terrain } from '@paths-beyond/core';
import type { ArenaMap, ContentCatalog } from '@paths-beyond/content';
import { describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { createDevIdentityValidator } from '../src/identity/devIdentity.js';
import { createInMemoryRateLimiter, type RateLimiter } from '../src/battle/rateLimit.js';
import {
  createMemoryArenaDefenseRepository,
  createMemoryPartyPresetRepository,
  createMemoryHeroRepository,
  createMemoryPlayerRepository,
  createMemoryMatchRepository,
  createMemoryReplayRepository,
  createMemoryRewardsRepository,
  createMemorySeasonRepository,
  createMemoryCharacterOwnershipRepository,
  createMemoryEconomyRepository,
} from '../src/repository/memoryRepository.js';
import type { ArenaDefense, StoredHero } from '../src/repository/types.js';
import { DEFAULT_PVE_ACCOUNT } from '../src/repository/types.js';

// Segredo fixo do HMAC que deriva a seed do nonce (M13, sub-sessão 2/N): teste precisa
// de seed reprodutível.
const TICKET_SECRET = 'segredo-de-teste';

const plain: Terrain = { id: 'plain', moveCost: { foot: 1, cavalry: 1, flying: 1, heavy: 1, aquatic: 2 }, defBonus: 0, evaBonus: 0, blocksSight: false };

function buildGrid(): GridMap {
  const tiles = Array.from({ length: 5 }, () => Array.from({ length: 5 }, () => ({ terrain: 'plain', height: 0 as const })));
  return { width: 5, height: 5, tiles, terrains: { plain }, zocEnabled: false };
}

function statSheet(overrides: Partial<StatSheet> = {}): Partial<StatSheet> {
  return { hp: 1000, atk: 200, def: 100, spd: 90, ...overrides };
}

const classDef: ClassDef = {
  id: 'classe-teste',
  name: 'Classe Teste',
  tier: 'base',
  unitType: 'infantry',
  moveType: 'foot',
  moveRange: 4,
  allowedWeapons: ['sword'],
  basePools: { ap: 2, pp: 2 },
  statCurve: Array.from({ length: 60 }, () => statSheet()),
  awakeningMultipliers: [1000, 1000, 1000, 1000, 1000, 1000, 1000],
  promotionFlat: [],
  imprintFlat: [[], [], [], [], [], []],
};

const strongClassDef: ClassDef = { ...classDef, id: 'classe-forte', statCurve: Array.from({ length: 60 }, () => statSheet({ hp: 5000, atk: 2000, def: 100 })) };
const weakClassDef: ClassDef = { ...classDef, id: 'classe-fraca', statCurve: Array.from({ length: 60 }, () => statSheet({ hp: 1, atk: 10, def: 0 })) };

const basico: SkillDef = {
  id: 'skill-basico', name: 'Golpe Básico', kind: 'duel', apCost: 1, cooldown: 0,
  multiplier: 1000, flat: 0, scalesWith: 'atk', effects: [], tags: ['physical'],
};

function buildHero(overrides: Partial<Hero> = {}): Hero {
  return {
    id: 'heroi-x',
    classId: classDef.id,
    level: 1,
    exp: 0,
    awakening: 0,
    imprint: 0,
    talents: {},
    equipment: { weapon: null, helmet: null, armor: null, necklace: null, ring: null, boots: null },
    weaponType: 'sword',
    duelSkills: ['skill-basico'],
    mapSkills: [],
    tacticsScript: [{ enabled: true, skillId: 'skill-basico', conditions: [] }],
    ...overrides,
  };
}

const arenaMap: ArenaMap = { grid: buildGrid(), winCondition: { t: 'rout' }, initialValor: 5 };

const catalog: ContentCatalog = {
  classes: { [classDef.id]: classDef, [strongClassDef.id]: strongClassDef, [weakClassDef.id]: weakClassDef },
  // §8.1 (M17, 2/N) — o elenco entrou no catálogo. Vazio aqui de propósito: os heróis
  // destes fixtures não declaram `characterId`, e árvore vazia é o que o servidor
  // resolve para eles.
  characters: {},
  characterTalentTrees: {},
  // §8.1 (M17, 3/N) — vazio: nenhum destes fixtures monta encontro de campanha ou masmorra.
  enemies: {},
  skills: { [basico.id]: basico },
  items: {},
  itemSets: {},
  effects: {},
  valorSkills: {},
  summonBlueprints: {},
  weaponDuelRanges: { sword: 1, axe: 1, spear: 1, bow: 2, arcane: 2, nature: 2, holy: 2 },
  maps: { 'mapa-teste': arenaMap },
  comps: [],
  chapters: [],
  encounters: [],
  dungeons: {},
  dungeonEncounters: {},
  materials: {},
  artifacts: {},
  characterSouls: {},
  economyRules: { energy: { max: 0, refillIntervalMs: 1 }, awakening: [], imprint: [], enhance: [] },
  substatWeights: [],
  mainstatWeights: [],
  enhanceRates: { toThree: 0, toSix: 0, toNine: 0, toTwelve: 0, toFifteen: 0 },
  // M18 2/N — vazio de propósito: nenhuma destas suítes exercita aquisição, e declarar
  // aqui é o que o tipo obrigatório de `ContentCatalog` cobra (esquecer vira erro de tipo).
  banners: {},
  premiumRules: {
    summon: { premiumCost: 500, pityThresholds: { adventurer: 10, hero: 90 } },
    energyPurchase: { premiumCost: 100, energy: 60 },
    premiumRewards: { missionFirstClear: 60, chapterFirstClear: 600, dungeonFirstClear: 200 },
  },
  achievements: {},
  events: {},
  baselineReactionSkillIds: [],
};

const ATTACKER_TOKEN = 'token-atacante';
const DEFENDER_TOKEN = 'token-defensor';

// §9.4 (M18, 3/N) — o herói do atacante que REPRESENTA um personagem. O `heroi-atacante`
// não declara `characterId` (é ficha sintética, como todo herói deste arquivo desde M7), e
// por isso a checagem de posse não o alcança — o que é correto e é justamente por que este
// segundo existe: sem um herói com personagem, a checagem nova ficaria verde sem nunca ter
// sido executada.
const PERSONAGEM_ADQUIRIVEL = 'personagem-que-eu-nao-tenho';

function buildTestApp(
  rateLimiter: RateLimiter = createInMemoryRateLimiter({ maxRequests: 1000, windowMs: 60_000 }),
  ownershipRepository = createMemoryCharacterOwnershipRepository(),
) {
  const repository = createMemoryPlayerRepository([
    { id: 'player-atacante', platformProvider: 'dev' as const, platformId: ATTACKER_TOKEN, displayName: 'Atacante', elo: 1200, arenaMarks: 0, ...DEFAULT_PVE_ACCOUNT },
    { id: 'player-defensor', platformProvider: 'dev' as const, platformId: DEFENDER_TOKEN, displayName: 'Defensor', elo: 1200, arenaMarks: 0, ...DEFAULT_PVE_ACCOUNT },
  ]);

  const attackerHero: StoredHero = {
    ownerPlayerId: 'player-atacante',
    hero: buildHero({ id: 'heroi-atacante', classId: strongClassDef.id }),
    equippedItems: [],
  };
  const defenderHero: StoredHero = {
    ownerPlayerId: 'player-defensor',
    // M26 3/N — o defensor DECLARA personagem, e é o único herói deste arquivo do lado de lá
    // que declara. Sem isso não haveria como afirmar o caso que a milestone existe para
    // fechar: em PvP o time do defensor são instâncias de OUTRA conta, e o atacante não tem
    // como saber quem elas são — o mapa de arte do ticket é a única resposta possível.
    hero: { ...buildHero({ id: 'heroi-defensor', classId: weakClassDef.id }), characterId: 'enemy-tirano' },
    equippedItems: [],
  };
  const heroPersonagem: StoredHero = {
    ownerPlayerId: 'player-atacante',
    hero: {
      ...buildHero({ id: 'heroi-personagem', classId: strongClassDef.id }),
      characterId: PERSONAGEM_ADQUIRIVEL,
    },
    equippedItems: [],
  };
  const heroRepository = createMemoryHeroRepository([attackerHero, defenderHero, heroPersonagem]);

  const defense: ArenaDefense = {
    ownerPlayerId: 'player-defensor',
    mapId: 'mapa-teste',
    // A DOIS tiles do atacante (pos {x:0,y:0}, duelRange=1), e não adjacente (M36 2/N).
    //
    // Adjacente, `hold-position` engajava no turno de IA que precede o primeiro comando e a
    // batalha nascia decidida — o que era invisível enquanto `POST /battles` resolvia tudo em
    // lote, porque `simulate` ignora comando com a batalha terminada e devolvia `victory` do
    // mesmo jeito. A asserção "roda a batalha" ficava verde sem o comando do jogador ter sido
    // aplicado UMA vez. Com a batalha viva isso apareceu na primeira execução.
    //
    // A dois tiles, o atacante anda e engaja: são os comandos DELE que decidem. O caso da
    // batalha decidida na abertura continua coberto, com defesa própria, mais abaixo.
    units: [{ heroId: 'heroi-defensor', pos: { x: 2, y: 0 }, height: 0, aiArchetype: 'hold-position' }],
  };
  const arenaDefenseRepository = createMemoryArenaDefenseRepository([defense]);

  return buildApp({
    economyRepository: createMemoryEconomyRepository(),
    ownershipRepository,
    rewardsRepository: createMemoryRewardsRepository(),
    repository,
    heroRepository,
    arenaDefenseRepository,
    partyPresetRepository: createMemoryPartyPresetRepository(),
    replayRepository: createMemoryReplayRepository(),
    matchRepository: createMemoryMatchRepository(),
    seasonRepository: createMemorySeasonRepository(),
    catalog,
    shopCatalog: {},
    rateLimiter,
    ticketSecret: TICKET_SECRET,
    identityValidator: createDevIdentityValidator(),
  });
}

describe('PUT /me/defense', () => {
  it('rejeita sem autenticação', async () => {
    const app = buildTestApp();
    const response = await app.inject({ method: 'PUT', url: '/me/defense', payload: { mapId: 'mapa-teste', units: [] } });
    expect(response.statusCode).toBe(401);
  });

  it('rejeita herói que não pertence ao chamador', async () => {
    const app = buildTestApp();
    const response = await app.inject({
      method: 'PUT',
      url: '/me/defense',
      headers: { 'x-platform-ticket': `dev:${DEFENDER_TOKEN}`},
      payload: { mapId: 'mapa-teste', units: [{ heroId: 'heroi-atacante', pos: { x: 0, y: 0 }, height: 0, aiArchetype: 'hold-position' }] },
    });
    expect(response.statusCode).toBe(403);
  });

  it('salva a defesa com heróis próprios', async () => {
    const app = buildTestApp();
    const response = await app.inject({
      method: 'PUT',
      url: '/me/defense',
      headers: { 'x-platform-ticket': `dev:${DEFENDER_TOKEN}`},
      payload: { mapId: 'mapa-teste', units: [{ heroId: 'heroi-defensor', pos: { x: 3, y: 3 }, height: 0, aiArchetype: 'aggressive' }] },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ ownerPlayerId: 'player-defensor', mapId: 'mapa-teste' });
  });
});

// §9.1 (M15, sub-sessão 3/N) — o lado de LEITURA da defesa, que `PUT` nunca teve. Sem ele
// a tela do cliente sabe o que acabou de enviar e nada mais, e "a defesa persiste" — metade
// do critério de aceite de M15 — não seria verificável sem `curl` no banco.
describe('GET /me/defense', () => {
  it('rejeita sem autenticação', async () => {
    const app = buildTestApp();
    expect((await app.inject({ method: 'GET', url: '/me/defense' })).statusCode).toBe(401);
  });

  // A fixture semeia defesa só para o defensor; o atacante é quem nunca montou uma.
  it('404 para quem ainda não montou — estado normal, não erro de servidor', async () => {
    const app = buildTestApp();
    const response = await app.inject({
      method: 'GET',
      url: '/me/defense',
      headers: { 'x-platform-ticket': `dev:${ATTACKER_TOKEN}`},
    });
    expect(response.statusCode).toBe(404);
  });

  it('devolve exatamente o que o PUT salvou, inclusive posição e arquétipo', async () => {
    const app = buildTestApp();
    const units = [{ heroId: 'heroi-defensor', pos: { x: 3, y: 3 }, height: 0, aiArchetype: 'guard-tile' }];
    await app.inject({
      method: 'PUT',
      url: '/me/defense',
      headers: { 'x-platform-ticket': `dev:${DEFENDER_TOKEN}`},
      payload: { mapId: 'mapa-teste', units },
    });

    const response = await app.inject({
      method: 'GET',
      url: '/me/defense',
      headers: { 'x-platform-ticket': `dev:${DEFENDER_TOKEN}`},
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ ownerPlayerId: 'player-defensor', mapId: 'mapa-teste', units });
  });

  it('cada jogador lê a PRÓPRIA defesa: salvar a minha não faz a do vizinho existir', async () => {
    const app = buildTestApp();
    await app.inject({
      method: 'PUT',
      url: '/me/defense',
      headers: { 'x-platform-ticket': `dev:${DEFENDER_TOKEN}`},
      payload: {
        mapId: 'mapa-teste',
        units: [{ heroId: 'heroi-defensor', pos: { x: 3, y: 3 }, height: 0, aiArchetype: 'aggressive' }],
      },
    });

    const doAtacante = await app.inject({
      method: 'GET',
      url: '/me/defense',
      headers: { 'x-platform-ticket': `dev:${ATTACKER_TOKEN}`},
    });
    expect(doAtacante.statusCode).toBe(404);
  });
});

// M36 2/N (D47) — `POST /battles/ticket` e `POST /battles` saíram; a arena passa pela BATALHA
// VIVA. Cada asserção abaixo é a mesma de antes, contra o caminho novo: o que se validava ao
// emitir o ticket agora se valida ao ABRIR a partida, e o que se afirmava sobre o resultado da
// submissão agora se afirma sobre o comando que FECHA a batalha.

const COMO_ATACANTE = { 'x-platform-ticket': `dev:${ATTACKER_TOKEN}` };
const COMO_DEFENSOR = { 'x-platform-ticket': `dev:${DEFENDER_TOKEN}` };
// `rulesVersion` é OBRIGATÓRIA ao abrir (M36 2/N): a versão é conferida antes de o jogador
// investir uma batalha inteira, e não depois. No modelo antigo o ticket não a pedia e a
// submissão pedia — o cliente desatualizado jogava tudo para ser recusado no fim.
const CONFRONTO = {
  attackerHeroIds: ['heroi-atacante'],
  defenderPlayerId: 'player-defensor',
  rulesVersion: RULES_VERSION,
};

type TestApp = ReturnType<typeof buildTestApp>;

async function abrirArena(app: TestApp, payload: Record<string, unknown> = CONFRONTO) {
  return app.inject({ method: 'POST', url: '/arena/matches', headers: COMO_ATACANTE, payload });
}

describe('POST /arena/matches — abrir a partida contra uma defesa', () => {
  it('rejeita sem autenticação', async () => {
    const app = buildTestApp();
    const res = await app.inject({ method: 'POST', url: '/arena/matches', payload: CONFRONTO });
    expect(res.statusCode).toBe(401);
  });

  it('rejeita rulesVersion diferente da do servidor', async () => {
    const app = buildTestApp();
    const res = await abrirArena(app, { ...CONFRONTO, rulesVersion: 'versao-errada' });
    expect(res.statusCode).toBe(409);
  });

  it('rejeita cliente da RULES_VERSION ANTERIOR com 409 (critério 4 do M17)', async () => {
    // §9.4 — "recusar replays de versão diferente". O teste acima usa uma string que nunca foi
    // versão de nada, e prova que o campo é comparado; este prova a coisa que o critério pede,
    // que é diferente: uma versão **anterior de verdade**, bem formada, que já foi a corrente.
    // Um cliente parado nela jogaria sobre outra regra, e aceitá-lo seria §9.1 acontecendo.
    const app = buildTestApp();
    const res = await abrirArena(app, { ...CONFRONTO, rulesVersion: '0.17.0' });

    expect(res.statusCode).toBe(409);
    expect(res.json().error).toContain(RULES_VERSION);
    expect(RULES_VERSION).not.toBe('0.17.0');
  });

  it('rejeita herói atacante que não pertence ao chamador', async () => {
    const app = buildTestApp();
    const res = await abrirArena(app, { ...CONFRONTO, attackerHeroIds: ['heroi-defensor'] });
    expect(res.statusCode).toBe(403);
  });

  // §9.4 (M18, 3/N) — a checagem de POSSE, diferente da de dono da instância acima. As duas
  // fazem falta: aquela diz que a instância é sua, esta diz que você adquiriu quem ela
  // representa. Sem esta, um cliente adulterado que conseguisse criar uma instância jogaria
  // com um personagem que nunca puxou.
  it('rejeita herói cujo PERSONAGEM o jogador não possui, ainda que a instância seja dele', async () => {
    const app = buildTestApp();
    const res = await abrirArena(app, { ...CONFRONTO, attackerHeroIds: ['heroi-personagem'] });

    expect(res.statusCode).toBe(403);
    expect(res.json().error).toContain(PERSONAGEM_ADQUIRIVEL);
  });

  it('com o personagem adquirido, o mesmo herói passa — a recusa era da posse e de nada mais', async () => {
    const ownership = createMemoryCharacterOwnershipRepository();
    await ownership.grant('player-atacante', PERSONAGEM_ADQUIRIVEL);
    const app = buildTestApp(undefined, ownership);

    const res = await abrirArena(app, { ...CONFRONTO, attackerHeroIds: ['heroi-personagem'] });
    expect(res.statusCode).toBe(201);
  });

  it('rejeita quando o defensor não tem uma defesa configurada', async () => {
    const app = buildTestApp();
    const res = await abrirArena(app, { ...CONFRONTO, defenderPlayerId: 'ninguem' });
    expect(res.statusCode).toBe(404);
  });

  it('devolve o estado VISÍVEL e o mapa de arte — e nenhuma seed', async () => {
    const app = buildTestApp();
    const res = await abrirArena(app);

    expect(res.statusCode).toBe(201);
    const corpo = res.json();
    expect(typeof corpo.nonce).toBe('string');
    expect(corpo.rulesVersion).toBe(RULES_VERSION);
    expect(corpo.kind).toBe('arena');
    expect(corpo.refId).toBe('player-defensor');
    // As duas peças estão no tabuleiro...
    expect(corpo.visivel.units.map((u: { unitId: string }) => u.unitId).sort()).toEqual([
      'heroi-atacante',
      'heroi-defensor',
    ]);
    // ...mas só a minha vem inteira. É o milestone numa linha.
    const minha = corpo.visivel.units.find((u: { unitId: string }) => u.unitId === 'heroi-atacante');
    const dele = corpo.visivel.units.find((u: { unitId: string }) => u.unitId === 'heroi-defensor');
    expect(minha.side).toBe('player');
    expect(minha.stats).toBeDefined();
    expect(dele.stats).toBeUndefined();
    // E a seed não sai: quem resolve é o servidor (D47).
    expect(corpo.seed).toBeUndefined();
    expect(corpo.visivel.seed).toBeUndefined();
  });

  // M26 3/N — a arte. A função que monta o mapa é pura e tem teste próprio
  // (`arteDoSetup.test.ts`); o que se afirma AQUI é que a rota a chamou e pôs o resultado na
  // resposta — sem isto, o mapa poderia estar perfeito e não sair do servidor.
  it('devolve o mapa de arte, e é ele que dá peça ao time do defensor', async () => {
    const ownership = createMemoryCharacterOwnershipRepository();
    await ownership.grant('player-atacante', PERSONAGEM_ADQUIRIVEL);
    const app = buildTestApp(undefined, ownership);

    const res = await abrirArena(app, { ...CONFRONTO, attackerHeroIds: ['heroi-personagem'] });

    expect(res.statusCode).toBe(201);
    expect(res.json().characterIdByUnitId).toEqual({
      'heroi-personagem': PERSONAGEM_ADQUIRIVEL,
      // Esta linha é a decisão de D48: identidade não é build. 'heroi-defensor' é uma instância
      // da conta do defensor, e o roster do atacante não a contém nem em princípio — sem este
      // mapa a peça dele seria um glifo anônimo.
      'heroi-defensor': 'enemy-tirano',
    });
  });

  it('omite quem não declara personagem em vez de mandar a instância de herói', async () => {
    // `heroi-atacante` é ficha sintética sem `characterId`. Mandar 'heroi-atacante' como id de
    // arte faria o cliente procurar no manifesto uma entrada que nunca vai existir — e a
    // diferença entre isso e o glifo do M16 só apareceria na tela.
    const app = buildTestApp();
    const res = await abrirArena(app);
    expect(res.json().characterIdByUnitId).toEqual({ 'heroi-defensor': 'enemy-tirano' });
  });

  it('abrir consome a cota do rate limiter (§9.4)', async () => {
    // Abrir partida em série é o que um grinder de seed faria; a contenção é o rate limiter —
    // e desde D48 há uma segunda, que é o custo cobrado ao entrar.
    const app = buildTestApp(createInMemoryRateLimiter({ maxRequests: 1, windowMs: 60_000 }));
    expect((await abrirArena(app)).statusCode).toBe(201);
    expect((await abrirArena(app)).statusCode).toBe(429);
  });

  it('uma partida em andamento por jogador: a segunda abertura devolve o nonce da primeira', async () => {
    const app = buildTestApp();
    const primeira = await abrirArena(app);
    expect(primeira.statusCode).toBe(201);

    const segunda = await abrirArena(app);
    expect(segunda.statusCode).toBe(409);
    expect(segunda.json().nonce).toBe(primeira.json().nonce);

    // Depois de desistir dá para abrir outra, e ela é OUTRA — abrir não é um carimbo fixo.
    await app.inject({ method: 'POST', url: `/matches/${primeira.json().nonce}/forfeit`, headers: COMO_ATACANTE });
    const terceira = await abrirArena(app);
    expect(terceira.statusCode).toBe(201);
    expect(terceira.json().nonce).not.toBe(primeira.json().nonce);
  });
});

// Atacante forte contra defensor de 1 de HP, a dois tiles: andar um passo e engajar mata e fecha
// a batalha. É o mesmo confronto que `POST /battles` resolvia em lote, agora comando a comando.
const APROXIMAR = {
  command: { t: 'move', unitId: 'heroi-atacante', path: [{ x: 0, y: 0 }, { x: 1, y: 0 }] },
};
const ENGAJAR = { command: { t: 'engage', unitId: 'heroi-atacante', targetId: 'heroi-defensor' } };

async function abrirEEngajar(app: TestApp) {
  const abertura = await abrirArena(app);
  expect(abertura.statusCode, abertura.body).toBe(201);
  const nonce = abertura.json().nonce as string;

  const andou = await app.inject({
    method: 'POST',
    url: `/matches/${nonce}/commands`,
    headers: COMO_ATACANTE,
    payload: APROXIMAR,
  });
  expect(andou.statusCode, andou.body).toBe(200);

  const jogada = await app.inject({
    method: 'POST',
    url: `/matches/${nonce}/commands`,
    headers: COMO_ATACANTE,
    payload: ENGAJAR,
  });
  return { nonce, jogada, corpo: jogada.json() };
}

describe('POST /matches/:nonce/commands — a arena resolvida no servidor', () => {
  it('o desfecho é do SERVIDOR e chega no comando que o produziu', async () => {
    const app = buildTestApp();
    const { jogada, corpo } = await abrirEEngajar(app);

    expect(jogada.statusCode, jogada.body).toBe(200);
    expect(corpo.outcome).toBe('victory');
    // E o duelo vem junto: revelar o que ACONTECEU é a única forma de o jogador aprender o que
    // enfrentou (D47).
    expect(corpo.duelResult.attackerId).toBe('heroi-atacante');
    expect(corpo.duelResult.trocas.length).toBeGreaterThan(0);
  });

  it('atualiza o ELO dos dois jogadores quando a batalha chega a uma conclusão', async () => {
    const app = buildTestApp();
    const { corpo } = await abrirEEngajar(app);

    // atacante venceu -> ganha ELO, defensor perdeu -> perde ELO (ambos começam em 1200).
    expect(corpo.liquidacao.elo.attacker).toBeGreaterThan(1200);
    expect(corpo.liquidacao.elo.defender).toBeLessThan(1200);

    const me = await app.inject({ method: 'GET', url: '/me', headers: COMO_ATACANTE });
    expect(me.json().elo).toBe(corpo.liquidacao.elo.attacker);
  });

  it('credita marcas de arena nos dois jogadores — mais pro vencedor, nunca zero pro perdedor', async () => {
    const app = buildTestApp();
    const { corpo } = await abrirEEngajar(app);

    expect(corpo.liquidacao.arenaMarks.attacker).toBeGreaterThan(0);
    expect(corpo.liquidacao.arenaMarks.defender).toBeGreaterThan(0);
    expect(corpo.liquidacao.arenaMarks.attacker).toBeGreaterThan(corpo.liquidacao.arenaMarks.defender);

    const me = await app.inject({ method: 'GET', url: '/me', headers: COMO_ATACANTE });
    expect(me.json().arenaMarks).toBe(corpo.liquidacao.arenaMarks.attacker);
  });

  it('o cliente nunca envia stats — só um comando por unitId — e o servidor resolve tudo sozinho', async () => {
    // A prova é a forma do que se manda: um `BattleCommand`, e nada mais. Nenhum campo de stat,
    // HP ou dano atravessa a rede na direção do servidor — e desde D47, quase nada atravessa na
    // direção contrária.
    expect(Object.keys(ENGAJAR)).toEqual(['command']);
    expect(Object.keys(ENGAJAR.command).sort()).toEqual(['t', 'targetId', 'unitId'].sort());

    const app = buildTestApp();
    const { jogada } = await abrirEEngajar(app);
    expect(jogada.statusCode).toBe(200);
    expect(jogada.json().outcome).toBe('victory');
  });

  it('a batalha já fechada não aceita comando de novo (anti-reenvio, §9.4)', async () => {
    // O nonce continua sendo a identidade da tentativa, e o que ele protege continua sendo o
    // mesmo: uma batalha só mexe no ELO uma vez. O que mudou é que a trava não é mais "este
    // nonce já foi usado" e sim "esta partida já terminou".
    const app = buildTestApp();
    const { nonce } = await abrirEEngajar(app);

    const denovo = await app.inject({
      method: 'POST',
      url: `/matches/${nonce}/commands`,
      headers: COMO_ATACANTE,
      payload: ENGAJAR,
    });
    expect(denovo.statusCode).toBe(409);
  });
});

describe('a batalha que nasce decidida', () => {
  it('o turno de IA da abertura pode fechar a partida — e ela liquida ali mesmo', async () => {
    // Este caso só existe porque a batalha viva o revelou. O turno de IA que precede o primeiro
    // comando é uma jogada de verdade: com a defesa ADJACENTE, `hold-position` engaja, morre no
    // contra-ataque e `rout` fecha a partida antes de o jogador tocar em nada.
    //
    // No modelo antigo isso passava despercebido — `simulate` ignorava os comandos e devolvia o
    // desfecho do mesmo jeito. Na batalha viva, sem tratar este caso, a partida ficaria para
    // sempre `ongoing` no banco: nada a pagar, nada a cobrar, e o jogador travado, porque é uma
    // partida por vez.
    const app = buildTestApp();
    await app.inject({
      method: 'PUT',
      url: '/me/defense',
      headers: COMO_DEFENSOR,
      payload: {
        mapId: 'mapa-teste',
        units: [{ heroId: 'heroi-defensor', pos: { x: 1, y: 0 }, height: 0, aiArchetype: 'hold-position' }],
      },
    });

    const abertura = await abrirArena(app);
    expect(abertura.statusCode, abertura.body).toBe(201);
    const corpo = abertura.json();

    expect(corpo.outcome).toBe('victory');
    expect(corpo.liquidacao.elo.attacker).toBeGreaterThan(1200);
    // E o jogador não fica preso: a partida fechada libera a próxima.
    expect((await abrirArena(app)).statusCode).toBe(201);
  });
});

describe('GET /battles/:nonce — o replay, agora construído do log do servidor', () => {
  it('o replay guardado devolve o mesmo mapa de arte, derivado na leitura', async () => {
    // Derivado e não gravado: é o que dá arte também aos replays que já estavam no banco antes
    // desta milestone. Ver `characterIdsForReplayUnits`.
    const app = buildTestApp();
    const { nonce } = await abrirEEngajar(app);

    const res = await app.inject({ method: 'GET', url: `/battles/${nonce}`, headers: COMO_ATACANTE });

    expect(res.statusCode).toBe(200);
    expect(res.json().characterIdByUnitId).toEqual({ 'heroi-defensor': 'enemy-tirano' });
  });

  it('404 pra nonce desconhecido', async () => {
    const app = buildTestApp();
    const res = await app.inject({ method: 'GET', url: '/battles/nao-existe', headers: COMO_ATACANTE });
    expect(res.statusCode).toBe(404);
  });

  it('o atacante e o defensor conseguem ler o replay depois da batalha; ninguém mais pode', async () => {
    const app = buildTestApp();
    const { nonce } = await abrirEEngajar(app);

    const comoAtaca = await app.inject({ method: 'GET', url: `/battles/${nonce}`, headers: COMO_ATACANTE });
    expect(comoAtaca.statusCode).toBe(200);
    expect(comoAtaca.json()).toMatchObject({
      nonce,
      attackerPlayerId: 'player-atacante',
      defenderPlayerId: 'player-defensor',
    });

    const comoDefende = await app.inject({ method: 'GET', url: `/battles/${nonce}`, headers: COMO_DEFENSOR });
    expect(comoDefende.statusCode).toBe(200);
  });

  it('o replay guarda a receita inteira: setup completo, seed e os comandos que o jogador mandou', async () => {
    // O `initialState` do replay é o setup COM os dois lados inteiros — e está certo que
    // esteja. O replay é resposta de uma rota que só o atacante e o defensor abrem, depois de a
    // batalha ter acabado; esconder o que já aconteceu não protegeria nada, e tiraria do jogador
    // a única chance de estudar o que enfrentou.
    const app = buildTestApp();
    const { nonce } = await abrirEEngajar(app);

    const replay = (await app.inject({ method: 'GET', url: `/battles/${nonce}`, headers: COMO_ATACANTE })).json();

    expect(Number.isInteger(replay.seed)).toBe(true);
    expect(replay.initialState.units.map((u: { unitId: string }) => u.unitId).sort()).toEqual([
      'heroi-atacante',
      'heroi-defensor',
    ]);
    expect(replay.commands).toEqual([APROXIMAR.command, ENGAJAR.command]);
    expect(replay.result.outcome).toBe('victory');
  });
});

describe('GET /me/heroes', () => {
  it('rejeita sem autenticação', async () => {
    const app = buildTestApp();
    expect((await app.inject({ method: 'GET', url: '/me/heroes' })).statusCode).toBe(401);
  });

  it('lista só os heróis do próprio jogador', async () => {
    const app = buildTestApp();
    const meus = await app.inject({ method: 'GET', url: '/me/heroes', headers: { 'x-platform-ticket': `dev:${ATTACKER_TOKEN}`} });
    expect(meus.statusCode).toBe(200);
    // M18 3/N acrescentou `heroi-personagem` ao atacante (o herói com `characterId`, sem o
    // qual a checagem de posse ficaria verde sem nunca rodar). A propriedade medida aqui é
    // a mesma: só os DELE, e nenhum do defensor.
    expect(meus.json().map((h: { hero: { id: string } }) => h.hero.id).sort()).toEqual([
      'heroi-atacante',
      'heroi-personagem',
    ]);

    const dele = await app.inject({ method: 'GET', url: '/me/heroes', headers: { 'x-platform-ticket': `dev:${DEFENDER_TOKEN}`} });
    expect(dele.json().map((h: { hero: { id: string } }) => h.hero.id)).toEqual(['heroi-defensor']);
  });
});
