import { RULES_VERSION } from '@paths-beyond/core';
import type { ClassDef, GridMap, Hero, SkillDef, StatSheet, Terrain } from '@paths-beyond/core';
import type { ArenaMap, ContentCatalog } from '@paths-beyond/content';
import { describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { createDevIdentityValidator } from '../src/identity/devIdentity.js';
import { createInMemoryRateLimiter, type RateLimiter } from '../src/battle/rateLimit.js';
import {
  createMemoryArenaDefenseRepository,
  createMemoryHeroRepository,
  createMemoryPlayerRepository,
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
  economyRules: { energy: { max: 0, refillIntervalMs: 1 }, awakening: [], imprint: [], enhance: [] },
  substatWeights: [],
  mainstatWeights: [],
  enhanceRates: { toThree: 0, toSix: 0, toNine: 0, toTwelve: 0, toFifteen: 0 },
  // M18 2/N — vazio de propósito: nenhuma destas suítes exercita aquisição, e declarar
  // aqui é o que o tipo obrigatório de `ContentCatalog` cobra (esquecer vira erro de tipo).
  banners: {},
  premiumRules: {
    summon: { premiumCost: 500, pityThreshold: 10 },
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
    // adjacente ao atacante (pos {x:0,y:0}, duelRange=1) — precisa estar em alcance pro
    // comando `engage` do teste de "roda a batalha" funcionar.
    units: [{ heroId: 'heroi-defensor', pos: { x: 1, y: 0 }, height: 0, aiArchetype: 'hold-position' }],
  };
  const arenaDefenseRepository = createMemoryArenaDefenseRepository([defense]);

  return buildApp({
    economyRepository: createMemoryEconomyRepository(),
    ownershipRepository,
    rewardsRepository: createMemoryRewardsRepository(),
    repository,
    heroRepository,
    arenaDefenseRepository,
    replayRepository: createMemoryReplayRepository(),
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

describe('POST /battles', () => {
  const validBody = {
    attackerHeroIds: ['heroi-atacante'],
    defenderPlayerId: 'player-defensor',
    // convenção do endpoint: unitId de cada unidade É o próprio heroId (previsível pro
    // cliente montar o BattleCommand sem precisar perguntar ao servidor "qual é meu
    // unitId" antes de agir).
    commands: [{ t: 'engage', unitId: 'heroi-atacante', targetId: 'heroi-defensor' }],
    rulesVersion: RULES_VERSION,
    nonce: 'nonce-teste-1',
  };

  it('rejeita sem autenticação', async () => {
    const app = buildTestApp();
    const response = await app.inject({ method: 'POST', url: '/battles', payload: validBody });
    expect(response.statusCode).toBe(401);
  });

  it('rejeita rulesVersion diferente da do servidor', async () => {
    const app = buildTestApp();
    const response = await app.inject({
      method: 'POST',
      url: '/battles',
      headers: { 'x-platform-ticket': `dev:${ATTACKER_TOKEN}`},
      payload: { ...validBody, rulesVersion: 'versao-errada' },
    });
    expect(response.statusCode).toBe(409);
  });

  it('rejeita replay da RULES_VERSION ANTERIOR com 409 (critério 4 do M17)', async () => {
    // §9.4 — "recusar replays de versão diferente". O teste acima usa uma string que nunca
    // foi versão de nada, e prova que o campo é comparado; este prova a coisa que o
    // critério de aceite pede, que é diferente: uma versão **anterior de verdade**, bem
    // formada, que era a corrente até este milestone.
    //
    // A distinção importa porque M17 foi o primeiro bump em que a incompatibilidade é REAL
    // e não disciplina de processo (ver `packages/core/src/rulesVersion.ts`), e M18 2/N é o
    // segundo: a chave do fragmento de imprint saiu da instância de herói e foi para o
    // personagem, sem caminho de migração. Um cliente que ainda estivesse em 0.17.0
    // mandaria comandos jogados sobre outra regra, e aceitar isso seria §9.1 — divergência
    // entre o que o cliente jogou e o que o servidor reexecuta.
    const app = buildTestApp();
    const response = await app.inject({
      method: 'POST',
      url: '/battles',
      headers: { 'x-platform-ticket': `dev:${ATTACKER_TOKEN}`},
      payload: { ...validBody, rulesVersion: '0.17.0' },
    });

    expect(response.statusCode).toBe(409);
    expect(response.json().error).toContain(RULES_VERSION);
    // E a versão anterior tem de ser mesmo anterior: se alguém reverter o bump sem reverter
    // o resto do milestone, este teste passa a medir nada e precisa reprovar.
    expect(RULES_VERSION).not.toBe('0.17.0');
  });

  it('rejeita herói atacante que não pertence ao chamador', async () => {
    const app = buildTestApp();
    const response = await app.inject({
      method: 'POST',
      url: '/battles',
      headers: { 'x-platform-ticket': `dev:${ATTACKER_TOKEN}`},
      payload: { ...validBody, attackerHeroIds: ['heroi-defensor'] },
    });
    expect(response.statusCode).toBe(403);
  });

  // §9.4 (M18, 3/N) — a checagem de POSSE, que é diferente da de dono da instância acima.
  // As duas fazem falta: aquela diz que a instância é sua, esta diz que você adquiriu quem
  // ela representa. Sem esta, um cliente adulterado que conseguisse criar uma instância
  // jogaria com um personagem que nunca puxou.
  it('rejeita herói cujo PERSONAGEM o jogador não possui, ainda que a instância seja dele', async () => {
    const app = buildTestApp();
    const response = await app.inject({
      method: 'POST',
      url: '/battles',
      headers: { 'x-platform-ticket': `dev:${ATTACKER_TOKEN}`},
      payload: { ...validBody, attackerHeroIds: ['heroi-personagem'] },
    });

    expect(response.statusCode).toBe(403);
    expect(response.json().error).toContain(PERSONAGEM_ADQUIRIVEL);
  });

  it('com o personagem adquirido, o mesmo herói passa — a recusa era da posse e de nada mais', async () => {
    // O recíproco. Sem ele, a asserção acima ficaria verde mesmo se a rota estivesse
    // recusando por outro motivo qualquer.
    const ownership = createMemoryCharacterOwnershipRepository();
    await ownership.grant('player-atacante', PERSONAGEM_ADQUIRIVEL);
    const app = buildTestApp(undefined, ownership);

    const response = await app.inject({
      method: 'POST',
      url: '/battles',
      headers: { 'x-platform-ticket': `dev:${ATTACKER_TOKEN}`},
      payload: { ...validBody, attackerHeroIds: ['heroi-personagem'] },
    });

    expect(response.statusCode).toBe(200);
  });

  it('rejeita quando o defensor não tem uma defesa configurada', async () => {
    const app = buildTestApp();
    const response = await app.inject({
      method: 'POST',
      url: '/battles',
      headers: { 'x-platform-ticket': `dev:${ATTACKER_TOKEN}`},
      payload: { ...validBody, defenderPlayerId: 'ninguem' },
    });
    expect(response.statusCode).toBe(404);
  });

  it('roda a batalha no servidor e devolve um resultado autoritativo, com seed gerado pelo servidor', async () => {
    const app = buildTestApp();
    const response = await app.inject({
      method: 'POST',
      url: '/battles',
      headers: { 'x-platform-ticket': `dev:${ATTACKER_TOKEN}`},
      payload: validBody,
    });
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(typeof body.seed).toBe('number');
    // atacante forte vs defensor fraco (hp=1) — engajar já devia matar o defensor.
    expect(body.result.outcome).toBe('victory');
  });

  it('atualiza o ELO dos dois jogadores quando a batalha chega a uma conclusão', async () => {
    const app = buildTestApp();
    const response = await app.inject({
      method: 'POST',
      url: '/battles',
      headers: { 'x-platform-ticket': `dev:${ATTACKER_TOKEN}`},
      payload: validBody,
    });
    const body = response.json();
    // atacante venceu -> ganha ELO, defensor perdeu -> perde ELO (ambos começam em 1200).
    expect(body.elo.attacker).toBeGreaterThan(1200);
    expect(body.elo.defender).toBeLessThan(1200);

    const meResponse = await app.inject({ method: 'GET', url: '/me', headers: { 'x-platform-ticket': `dev:${ATTACKER_TOKEN}`} });
    expect(meResponse.json().elo).toBe(body.elo.attacker);
  });

  it('credita marcas de arena nos dois jogadores quando a batalha chega a uma conclusão — mais pro vencedor', async () => {
    const app = buildTestApp();
    const response = await app.inject({
      method: 'POST',
      url: '/battles',
      headers: { 'x-platform-ticket': `dev:${ATTACKER_TOKEN}`},
      payload: validBody,
    });
    const body = response.json();
    // atacante venceu -> ganha mais marcas; defensor perdeu -> ganha menos, nunca zero
    // (ambos começam em 0).
    expect(body.arenaMarks.attacker).toBeGreaterThan(0);
    expect(body.arenaMarks.defender).toBeGreaterThan(0);
    expect(body.arenaMarks.attacker).toBeGreaterThan(body.arenaMarks.defender);

    const meResponse = await app.inject({ method: 'GET', url: '/me', headers: { 'x-platform-ticket': `dev:${ATTACKER_TOKEN}`} });
    expect(meResponse.json().arenaMarks).toBe(body.arenaMarks.attacker);
  });

  it('o cliente nunca envia stats — só ids e comandos — e o servidor resolve tudo sozinho', async () => {
    // Prova indireta: o body de requisição válido (`validBody`) não tem NENHUM campo de
    // stat/HP/dano — só heroIds e comandos por unitId — e mesmo assim a batalha roda
    // corretamente (teste anterior), porque o servidor resolveu os stats reais a partir
    // do HeroRepository + catálogo, nunca do que o cliente mandou.
    expect(Object.keys(validBody)).toEqual(['attackerHeroIds', 'defenderPlayerId', 'commands', 'rulesVersion', 'nonce']);
  });

  it('rejeita sem nonce', async () => {
    const app = buildTestApp();
    const { nonce: _nonce, ...withoutNonce } = validBody;
    const response = await app.inject({
      method: 'POST',
      url: '/battles',
      headers: { 'x-platform-ticket': `dev:${ATTACKER_TOKEN}`},
      payload: withoutNonce,
    });
    expect(response.statusCode).toBe(400);
  });

  it('rejeita reenvio do mesmo nonce (anti-replay, §9.4)', async () => {
    const app = buildTestApp();
    const first = await app.inject({
      method: 'POST',
      url: '/battles',
      headers: { 'x-platform-ticket': `dev:${ATTACKER_TOKEN}`},
      payload: validBody,
    });
    expect(first.statusCode).toBe(200);

    const second = await app.inject({
      method: 'POST',
      url: '/battles',
      headers: { 'x-platform-ticket': `dev:${ATTACKER_TOKEN}`},
      payload: validBody,
    });
    expect(second.statusCode).toBe(409);
  });

  it('rejeita quando o limite de tentativas por minuto é excedido (rate limiting, §9.4)', async () => {
    const app = buildTestApp(createInMemoryRateLimiter({ maxRequests: 1, windowMs: 60_000 }));

    const first = await app.inject({
      method: 'POST',
      url: '/battles',
      headers: { 'x-platform-ticket': `dev:${ATTACKER_TOKEN}`},
      payload: validBody,
    });
    expect(first.statusCode).toBe(200);

    const second = await app.inject({
      method: 'POST',
      url: '/battles',
      headers: { 'x-platform-ticket': `dev:${ATTACKER_TOKEN}`},
      payload: { ...validBody, nonce: 'nonce-teste-2' },
    });
    expect(second.statusCode).toBe(429);
  });
});

describe('GET /battles/:nonce', () => {
  const validBody = {
    attackerHeroIds: ['heroi-atacante'],
    defenderPlayerId: 'player-defensor',
    commands: [{ t: 'engage', unitId: 'heroi-atacante', targetId: 'heroi-defensor' }],
    rulesVersion: RULES_VERSION,
    nonce: 'nonce-replay-1',
  };

  it('o replay guardado devolve o mesmo mapa, derivado na leitura', async () => {
    // Derivado e não gravado: é o que dá arte também aos replays que já estavam no banco
    // antes desta milestone. Ver `characterIdsForReplayUnits`.
    const app = buildTestApp();
    const nonce = 'nonce-do-replay-com-arte';
    const jogar = await app.inject({
      method: 'POST',
      url: '/battles',
      headers: { 'x-platform-ticket': `dev:${ATTACKER_TOKEN}`},
      payload: { ...validBody, nonce },
    });
    expect(jogar.statusCode).toBe(200);

    const res = await app.inject({
      method: 'GET',
      url: `/battles/${nonce}`,
      headers: { 'x-platform-ticket': `dev:${ATTACKER_TOKEN}`},
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().characterIdByUnitId).toEqual({ 'heroi-defensor': 'enemy-tirano' });
  });

  it('404 pra nonce desconhecido', async () => {
    const app = buildTestApp();
    const response = await app.inject({
      method: 'GET',
      url: '/battles/nao-existe',
      headers: { 'x-platform-ticket': `dev:${ATTACKER_TOKEN}`},
    });
    expect(response.statusCode).toBe(404);
  });

  it('o atacante e o defensor conseguem ler o replay depois da batalha; ninguém mais pode', async () => {
    const app = buildTestApp();
    await app.inject({
      method: 'POST',
      url: '/battles',
      headers: { 'x-platform-ticket': `dev:${ATTACKER_TOKEN}`},
      payload: validBody,
    });

    const asAttacker = await app.inject({
      method: 'GET',
      url: `/battles/${validBody.nonce}`,
      headers: { 'x-platform-ticket': `dev:${ATTACKER_TOKEN}`},
    });
    expect(asAttacker.statusCode).toBe(200);
    expect(asAttacker.json()).toMatchObject({ nonce: validBody.nonce, attackerPlayerId: 'player-atacante', defenderPlayerId: 'player-defensor' });

    const asDefender = await app.inject({
      method: 'GET',
      url: `/battles/${validBody.nonce}`,
      headers: { 'x-platform-ticket': `dev:${DEFENDER_TOKEN}`},
    });
    expect(asDefender.statusCode).toBe(200);
  });
});

// M13, sub-sessão 2/N — o "ticket de batalha". §9.1 diz que "o atacante joga a camada de
// grid manualmente contra essa defesa"; sem o setup montado e a seed ANTES da partida, o
// cliente só conseguiria submeter comandos às cegas. Ver `battle/ticket.ts` e DECISIONS.md.
describe('POST /battles/ticket', () => {
  const ticketBody = { attackerHeroIds: ['heroi-atacante'], defenderPlayerId: 'player-defensor' };

  it('rejeita sem autenticação', async () => {
    const app = buildTestApp();
    const res = await app.inject({ method: 'POST', url: '/battles/ticket', payload: ticketBody });
    expect(res.statusCode).toBe(401);
  });

  it('devolve nonce, seed, rulesVersion e o setup montado do confronto', async () => {
    const app = buildTestApp();
    const res = await app.inject({
      method: 'POST',
      url: '/battles/ticket',
      headers: { 'x-platform-ticket': `dev:${ATTACKER_TOKEN}`},
      payload: ticketBody,
    });

    expect(res.statusCode).toBe(200);
    const ticket = res.json();
    expect(typeof ticket.nonce).toBe('string');
    expect(Number.isInteger(ticket.seed)).toBe(true);
    expect(ticket.rulesVersion).toBe(RULES_VERSION);
    expect(ticket.defenderPlayerId).toBe('player-defensor');
    // O setup vem inteiro: é com ele que o cliente monta a batalha localmente.
    expect(ticket.setup.units.map((u: { unitId: string }) => u.unitId).sort()).toEqual([
      'heroi-atacante',
      'heroi-defensor',
    ]);
    expect(ticket.setup.units.find((u: { unitId: string }) => u.unitId === 'heroi-atacante').side).toBe('player');
  });

  // M26 3/N — a arte. A função que monta o mapa é pura e tem teste próprio
  // (`arteDoSetup.test.ts`); o que se afirma AQUI é que a rota a chamou e pôs o resultado na
  // resposta — sem isto, o mapa poderia estar perfeito e não sair do servidor.
  it('devolve o mapa de arte, e é ele que dá peça ao time do defensor', async () => {
    const ownership = createMemoryCharacterOwnershipRepository();
    await ownership.grant('player-atacante', PERSONAGEM_ADQUIRIVEL);
    const app = buildTestApp(undefined, ownership);

    const res = await app.inject({
      method: 'POST',
      url: '/battles/ticket',
      headers: { 'x-platform-ticket': `dev:${ATTACKER_TOKEN}`},
      payload: { attackerHeroIds: ['heroi-personagem'], defenderPlayerId: 'player-defensor' },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().characterIdByUnitId).toEqual({
      'heroi-personagem': PERSONAGEM_ADQUIRIVEL,
      // Esta linha é a milestone inteira: 'heroi-defensor' é uma instância da conta do
      // defensor, e o roster do atacante não a contém nem em princípio.
      'heroi-defensor': 'enemy-tirano',
    });
  });

  it('omite quem não declara personagem em vez de mandar a instância de herói', async () => {
    // `heroi-atacante` é ficha sintética sem `characterId`. Mandar 'heroi-atacante' como id de
    // arte faria o cliente procurar no manifesto uma entrada que nunca vai existir — e a
    // diferença entre isso e o glifo do M16 só apareceria na tela.
    const app = buildTestApp();
    const res = await app.inject({
      method: 'POST',
      url: '/battles/ticket',
      headers: { 'x-platform-ticket': `dev:${ATTACKER_TOKEN}`},
      payload: ticketBody,
    });

    expect(res.json().characterIdByUnitId).toEqual({ 'heroi-defensor': 'enemy-tirano' });
  });

  it('aplica as mesmas validações de posse e de defesa que POST /battles', async () => {
    const app = buildTestApp();
    const alheio = await app.inject({
      method: 'POST',
      url: '/battles/ticket',
      headers: { 'x-platform-ticket': `dev:${ATTACKER_TOKEN}`},
      payload: { ...ticketBody, attackerHeroIds: ['heroi-defensor'] },
    });
    expect(alheio.statusCode).toBe(403);

    const semDefesa = await app.inject({
      method: 'POST',
      url: '/battles/ticket',
      headers: { 'x-platform-ticket': `dev:${ATTACKER_TOKEN}`},
      payload: { ...ticketBody, defenderPlayerId: 'player-atacante' },
    });
    expect(semDefesa.statusCode).toBe(404);
  });

  it('a seed do ticket é a MESMA que a batalha usa — é o que faz a partida jogada valer', async () => {
    // Sem isto o cliente jogaria com uma seed e o servidor resolveria com outra: os duelos
    // que o jogador viu não seriam os que contam. §9.1 chama divergência assim de bug
    // crítico.
    const app = buildTestApp();
    const ticket = (
      await app.inject({
        method: 'POST',
        url: '/battles/ticket',
        headers: { 'x-platform-ticket': `dev:${ATTACKER_TOKEN}`},
        payload: ticketBody,
      })
    ).json();

    const battle = await app.inject({
      method: 'POST',
      url: '/battles',
      headers: { 'x-platform-ticket': `dev:${ATTACKER_TOKEN}`},
      payload: { ...ticketBody, nonce: ticket.nonce, rulesVersion: RULES_VERSION, commands: [] },
    });

    expect(battle.statusCode).toBe(200);
    expect(battle.json().seed).toBe(ticket.seed);
  });

  it('o setup do ticket é o MESMO que o servidor usa pra simular', async () => {
    const app = buildTestApp();
    const ticket = (
      await app.inject({
        method: 'POST',
        url: '/battles/ticket',
        headers: { 'x-platform-ticket': `dev:${ATTACKER_TOKEN}`},
        payload: ticketBody,
      })
    ).json();

    await app.inject({
      method: 'POST',
      url: '/battles',
      headers: { 'x-platform-ticket': `dev:${ATTACKER_TOKEN}`},
      payload: { ...ticketBody, nonce: ticket.nonce, rulesVersion: RULES_VERSION, commands: [] },
    });

    const replay = (
      await app.inject({
        method: 'GET',
        url: `/battles/${ticket.nonce}`,
        headers: { 'x-platform-ticket': `dev:${ATTACKER_TOKEN}`},
      })
    ).json();

    expect(replay.seed).toBe(ticket.seed);
    expect(replay.initialState).toEqual(ticket.setup);
  });

  it('nonces diferentes dão seeds diferentes — o ticket não é um carimbo fixo', async () => {
    const app = buildTestApp();
    const pedir = async () =>
      (
        await app.inject({
          method: 'POST',
          url: '/battles/ticket',
          headers: { 'x-platform-ticket': `dev:${ATTACKER_TOKEN}`},
          payload: ticketBody,
        })
      ).json();

    const a = await pedir();
    const b = await pedir();
    expect(a.nonce).not.toBe(b.nonce);
    expect(a.seed).not.toBe(b.seed);
  });

  it('consome a mesma cota de rate limit da batalha (§9.4)', async () => {
    // Pedir ticket em série é exatamente o que um grinder de seed faria; a contenção é o
    // rate limiter, e por isso a emissão passa por ele.
    const app = buildTestApp(createInMemoryRateLimiter({ maxRequests: 1, windowMs: 60_000 }));
    const primeiro = await app.inject({
      method: 'POST',
      url: '/battles/ticket',
      headers: { 'x-platform-ticket': `dev:${ATTACKER_TOKEN}`},
      payload: ticketBody,
    });
    expect(primeiro.statusCode).toBe(200);

    const segundo = await app.inject({
      method: 'POST',
      url: '/battles/ticket',
      headers: { 'x-platform-ticket': `dev:${ATTACKER_TOKEN}`},
      payload: ticketBody,
    });
    expect(segundo.statusCode).toBe(429);
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
