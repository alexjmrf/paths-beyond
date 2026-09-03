import { loadCatalogFromDisk } from '@paths-beyond/content';
import { resolveAutoBattle, type Hero } from '@paths-beyond/core';
import { describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { createInMemoryRateLimiter } from '../src/battle/rateLimit.js';
import {
  createMemoryArenaDefenseRepository,
  createMemoryCharacterOwnershipRepository,
  createMemoryEconomyRepository,
  createMemoryHeroRepository,
  createMemoryPlayerRepository,
  createMemoryReplayRepository,
  createMemorySeasonRepository,
} from '../src/repository/memoryRepository.js';
import { DEFAULT_PVE_ACCOUNT } from '../src/repository/types.js';

// §10 (M14, sub-sessão 3/N) — o farm de ponta a ponta contra o servidor real, com o
// catálogo real de `packages/data`.
//
// Decisão do usuário: a masmorra é uma BATALHA. Estes testes provam que ela se comporta
// como tal — o servidor reexecuta a jogada, a varredura pode perder, derrota gasta energia
// e não paga, e a dificuldade alta continua trancada até a normal ser limpa à mão.

const TICKET_SECRET = 'segredo-de-teste';
const TOKEN = 'token-farmer';

const catalog = loadCatalogFromDisk();

// Instante fixo: sexta-feira, 2024-01-05, 12:00 UTC. Fixo porque a trava de entrada reseta
// em dias declarados — com o relógio real, o teste passaria ou não conforme o dia em que
// rodasse.
const SEXTA = Date.UTC(2024, 0, 5, 12);
const DIA = 86_400_000;

// Nível alto de propósito: estes testes são sobre a MECÂNICA do servidor (energia, trava de
// entrada, idempotência, quem paga o quê), não sobre balanceamento. Um time fraco perderia
// tudo e os testes falariam sobre dificuldade em vez de sobre rota. O caso "time fraco
// perde" tem um teste próprio, com um time propositalmente insuficiente.
function heroi(id: string, classId: string, weaponType: Hero['weaponType'], skill: string, level = 50): Hero {
  return {
    id,
    classId,
    level,
    exp: 0,
    awakening: 0,
    imprint: 0,
    talents: {},
    equipment: { weapon: null, helmet: null, armor: null, necklace: null, ring: null, boots: null },
    weaponType,
    duelSkills: [skill],
    mapSkills: [],
    tacticsScript: [{ enabled: true, skillId: skill, conditions: [] }],
  };
}

interface Harness {
  readonly app: ReturnType<typeof buildApp>;
  readonly economyRepository: ReturnType<typeof createMemoryEconomyRepository>;
  readonly ownershipRepository: ReturnType<typeof createMemoryCharacterOwnershipRepository>;
  readonly playerRepository: ReturnType<typeof createMemoryPlayerRepository>;
  now: number;
  nonceCounter: number;
}

function buildHarness(options: { energy?: number } = {}): Harness {
  const energiaInicial = options.energy ?? catalog.economyRules.energy.max;
  const playerRepository = createMemoryPlayerRepository([
    {
      id: 'player-farmer',
      token: TOKEN,
      displayName: 'Farmer',
      elo: 1200,
      arenaMarks: 0,
      ...DEFAULT_PVE_ACCOUNT,
      energy: { stored: energiaInicial, asOfMs: SEXTA },
    },
  ]);

  const heroRepository = createMemoryHeroRepository([
    {
      ownerPlayerId: 'player-farmer',
      hero: heroi('heroi-1', 'class-espadachim', 'sword', 'skill-ataque-espadachim'),
      equippedItems: [],
    },
    {
      ownerPlayerId: 'player-farmer',
      hero: heroi('heroi-2', 'class-couracado', 'axe', 'skill-ataque-couracado'),
      equippedItems: [],
    },
    {
      ownerPlayerId: 'player-farmer',
      // O time insuficiente do teste de varredura fracassada: nível 5, sem equipamento.
      hero: heroi('heroi-fraco', 'class-clerigo', 'holy', 'skill-ataque-clerigo', 5),
      equippedItems: [],
    },
    {
      // §9.4 (M18, 3/N) — um herói que REPRESENTA um personagem adquirível. Os outros três
      // não declaram `characterId`, então a checagem de posse não os alcança; sem este, ela
      // ficaria verde sem nunca ter rodado nesta rota.
      ownerPlayerId: 'player-farmer',
      hero: {
        ...heroi('heroi-personagem', 'class-espadachim', 'sword', 'skill-ataque-espadachim'),
        characterId: PERSONAGEM_ADQUIRIVEL,
      },
      equippedItems: [],
    },
  ]);

  const economyRepository = createMemoryEconomyRepository();

  const ownershipRepository = createMemoryCharacterOwnershipRepository();
  const harness: Harness = {
    now: SEXTA,
    nonceCounter: 0,
    economyRepository,
    ownershipRepository,
    playerRepository,
    app: buildApp({
      repository: playerRepository,
      heroRepository,
      arenaDefenseRepository: createMemoryArenaDefenseRepository(),
      replayRepository: createMemoryReplayRepository(),
      seasonRepository: createMemorySeasonRepository(),
      economyRepository,
      ownershipRepository,
      catalog,
      shopCatalog: {},
      rateLimiter: createInMemoryRateLimiter({ maxRequests: 1000, windowMs: 60_000 }),
      ticketSecret: TICKET_SECRET,
      now: () => harness.now,
      // M15 4/N — o nonce do ticket vira a SEED da batalha (`deriveSeed`), e
      // `generateNonce` é `crypto.randomUUID`: sem fixar, um teste que afirma "este time
      // vence esta masmorra" jogava uma partida DIFERENTE a cada execução, e o da elite
      // (dura de propósito, §10) falhava 1 em 8. Contador determinístico, mesma disciplina
      // do relógio injetado acima.
      //
      // O prefixo é fixture ESCOLHIDA, não sorteada: a elite é marginal por desenho — o
      // time de referência a vence na maioria das seeds e perde em algumas —, e estes
      // testes são sobre o fluxo de recompensa, não sobre dificuldade. Trocar o prefixo
      // troca a partida; se um deles voltar a falhar, o certo é investigar o motor antes de
      // trocar a string.
      newNonce: () => `seed-fixa-${(harness.nonceCounter += 1)}`,
    }),
  };
  return harness;
}

const NORMAL = 'dungeon-campo-de-treino';
const ELITE = 'dungeon-campo-de-treino-elite';

// Um adquirível de verdade do catálogo (D14): Kaia só entra por invocação.
const PERSONAGEM_ADQUIRIVEL = 'ally-grifeiro';

async function pedirTicket(h: Harness, dungeonId: string, heroIds: readonly string[] = ['heroi-1']) {
  const response = await h.app.inject({
    method: 'POST',
    url: `/dungeons/${dungeonId}/ticket`,
    headers: { 'x-player-token': TOKEN },
    payload: { heroIds },
  });
  return { status: response.statusCode, body: response.json() };
}

async function rodar(
  h: Harness,
  dungeonId: string,
  payload: Record<string, unknown>,
): Promise<{ status: number; body: any }> {
  const response = await h.app.inject({
    method: 'POST',
    url: `/dungeons/${dungeonId}/run`,
    headers: { 'x-player-token': TOKEN },
    payload,
  });
  return { status: response.statusCode, body: response.json() };
}

async function economia(h: Harness) {
  const response = await h.app.inject({ method: 'GET', url: '/me/economy', headers: { 'x-player-token': TOKEN } });
  return response.json();
}

// Uma vitória "manual" honesta: o servidor exige que os comandos submetidos levem à
// vitória, então o teste joga a batalha do mesmo jeito que a varredura jogaria e submete
// exatamente esses comandos. É o que um cliente faria — e prova, de quebra, que o resultado
// do cliente e o do servidor coincidem.
async function jogarEVencer(h: Harness, dungeonId: string, heroIds: readonly string[] = ['heroi-1', 'heroi-2']) {
  const ticket = await pedirTicket(h, dungeonId, heroIds);
  expect(ticket.status).toBe(200);
  const jogada = resolveAutoBattle({ setup: ticket.body.setup, seed: ticket.body.seed });
  expect(jogada.outcome).toBe('victory');
  return rodar(h, dungeonId, { nonce: ticket.body.nonce, heroIds, commands: jogada.commands });
}

describe('GET /me/economy', () => {
  it('rejeita sem autenticação', async () => {
    const h = buildHarness();
    const response = await h.app.inject({ method: 'GET', url: '/me/economy' });
    expect(response.statusCode).toBe(401);
  });

  it('devolve energia, carteira e inventário de uma conta nova', async () => {
    const h = buildHarness();
    const body = await economia(h);
    expect(body.energy.stored).toBe(catalog.economyRules.energy.max);
    expect(body.wallet).toEqual({ gold: 0, stones: 0, arenaMarks: 0 });
    expect(body.inventory).toEqual([]);
    expect(body.clearedDungeons).toEqual([]);
  });

  it('a energia REGENERA com o tempo, sem ninguém escrever no banco', async () => {
    const h = buildHarness({ energy: 0 });
    expect((await economia(h)).energy.stored).toBe(0);
    h.now = SEXTA + catalog.economyRules.energy.refillIntervalMs * 3;
    expect((await economia(h)).energy.stored).toBe(3);
  });
});

describe('GET /dungeons', () => {
  it('lista as masmorras com a disponibilidade já resolvida', async () => {
    const h = buildHarness();
    const response = await h.app.inject({ method: 'GET', url: '/dungeons', headers: { 'x-player-token': TOKEN } });
    const body = response.json();
    expect(body.dungeons.length).toBe(Object.keys(catalog.dungeons).length);

    const normal = body.dungeons.find((d: any) => d.id === NORMAL);
    const elite = body.dungeons.find((d: any) => d.id === ELITE);
    // Antes de limpar: a normal não aceita varredura e a elite está trancada.
    expect(normal.sweepAvailable).toBe(false);
    expect(normal.lockedBy).toBeNull();
    expect(elite.lockedBy).toBe(NORMAL);
    expect(elite.manualOnly).toBe(true);
    expect(elite.entriesLeft).toBeGreaterThan(0);
  });
});

describe('POST /dungeons/:id/run — a masmorra é uma batalha', () => {
  // §9.4 (M18, 3/N) — a mesma checagem de posse da arena, na outra rota que monta batalha a
  // partir de ids do cliente. Se só uma das duas perguntasse, a que não pergunta seria a
  // porta.
  it('recusa herói cujo PERSONAGEM o jogador não possui', async () => {
    const h = buildHarness();
    const { status, body } = await pedirTicket(h, NORMAL, ['heroi-personagem']);

    expect(status).toBe(400);
    expect(body.error).toContain(PERSONAGEM_ADQUIRIVEL);
  });

  it('com o personagem adquirido, o mesmo herói passa', async () => {
    const h = buildHarness();
    await h.ownershipRepository.grant('player-farmer', PERSONAGEM_ADQUIRIVEL);

    const { status } = await pedirTicket(h, NORMAL, ['heroi-personagem']);

    expect(status).toBe(200);
  });

  it('vitória manual paga a recompensa e marca a masmorra como limpa', async () => {
    const h = buildHarness();
    const resultado = await jogarEVencer(h, NORMAL);

    expect(resultado.status).toBe(200);
    expect(resultado.body.outcome).toBe('victory');
    expect(resultado.body.rewards.exp).toBeGreaterThan(0);

    const depois = await economia(h);
    expect(depois.wallet.gold).toBe(resultado.body.rewards.gold);
    expect(depois.clearedDungeons).toContain(NORMAL);
  });

  it('a energia é cobrada de verdade', async () => {
    const h = buildHarness();
    const antes = (await economia(h)).energy.stored;
    await jogarEVencer(h, NORMAL);
    const depois = (await economia(h)).energy.stored;
    expect(antes - depois).toBe(catalog.dungeons[NORMAL]!.energyCost);
  });

  it('sem energia, a run é recusada e nada é cobrado', async () => {
    const h = buildHarness({ energy: 1 });
    const ticket = await pedirTicket(h, NORMAL);
    const resultado = await rodar(h, NORMAL, { nonce: ticket.body.nonce, heroIds: ['heroi-1'], commands: [] });

    expect(resultado.status).toBe(403);
    expect(resultado.body.error).toContain('energia');
    expect((await economia(h)).energy.stored).toBe(1);
  });

  it('derrota gasta energia e NÃO paga nada', async () => {
    const h = buildHarness();
    const ticket = await pedirTicket(h, NORMAL);
    // Nenhum comando: os inimigos agem, o jogador não, e a batalha não é vencida.
    const resultado = await rodar(h, NORMAL, { nonce: ticket.body.nonce, heroIds: ['heroi-1'], commands: [] });

    expect(resultado.status).toBe(200);
    expect(resultado.body.outcome).toBe('defeat');
    expect(resultado.body.rewards).toBeNull();

    const depois = await economia(h);
    expect(depois.wallet.gold).toBe(0);
    expect(depois.clearedDungeons).not.toContain(NORMAL);
    expect(depois.energy.stored).toBe(catalog.economyRules.energy.max - catalog.dungeons[NORMAL]!.energyCost);
  });

  it('o mesmo nonce não paga duas vezes', async () => {
    const h = buildHarness();
    const ticket = await pedirTicket(h, NORMAL, ['heroi-1', 'heroi-2']);
    const jogada = resolveAutoBattle({ setup: ticket.body.setup, seed: ticket.body.seed });
    const payload = { nonce: ticket.body.nonce, heroIds: ['heroi-1', 'heroi-2'], commands: jogada.commands };

    const primeira = await rodar(h, NORMAL, payload);
    const ouroDepoisDaPrimeira = (await economia(h)).wallet.gold;

    const segunda = await rodar(h, NORMAL, payload);
    expect(primeira.status).toBe(200);
    expect(segunda.status).toBe(409);
    expect((await economia(h)).wallet.gold).toBe(ouroDepoisDaPrimeira);
  });

  it('comando inválido é rejeitado — o servidor não confia na jogada do cliente', async () => {
    const h = buildHarness();
    const ticket = await pedirTicket(h, NORMAL);
    const resultado = await rodar(h, NORMAL, {
      nonce: ticket.body.nonce,
      heroIds: ['heroi-1'],
      commands: [{ t: 'move', unitId: 'unidade-que-nao-existe', path: [{ x: 0, y: 0 }] }],
    });
    expect(resultado.status).toBe(400);
    expect(resultado.body.error).toContain('rejeitado');
  });
});

describe('varredura (decisão do usuário: limpar à mão antes)', () => {
  it('é recusada antes da primeira limpeza manual', async () => {
    const h = buildHarness();
    const resultado = await rodar(h, NORMAL, { nonce: 'nonce-varredura-1', heroIds: ['heroi-1'], auto: true });
    expect(resultado.status).toBe(403);
    expect(resultado.body.error).toContain('à mão');
  });

  it('é liberada depois da limpeza e resolve a batalha sozinha', async () => {
    const h = buildHarness();
    await jogarEVencer(h, NORMAL);

    const listagem = await h.app.inject({ method: 'GET', url: '/dungeons', headers: { 'x-player-token': TOKEN } });
    expect(listagem.json().dungeons.find((d: any) => d.id === NORMAL).sweepAvailable).toBe(true);

    const varredura = await rodar(h, NORMAL, {
      nonce: 'nonce-varredura-2',
      heroIds: ['heroi-1', 'heroi-2'],
      auto: true,
    });
    expect(varredura.status).toBe(200);
    expect(varredura.body.outcome).toBe('victory');
    expect(varredura.body.rewards.exp).toBeGreaterThan(0);
  });

  it('varrer com time fraco demais PERDE — não é loot garantido', async () => {
    const h = buildHarness();
    await jogarEVencer(h, 'dungeon-covil-do-tirano');

    // Entrar com um clérigo nível 5 sozinho é exatamente o caso que a decisão do usuário
    // previu: o time automático "ainda sim teria que ser forte o suficiente para passar".
    const varredura = await rodar(h, 'dungeon-covil-do-tirano', {
      nonce: 'nonce-varredura-fraca',
      heroIds: ['heroi-fraco'],
      auto: true,
    });
    expect(varredura.status).toBe(200);
    expect(varredura.body.outcome).toBe('defeat');
    expect(varredura.body.rewards).toBeNull();
  });

  it('a dificuldade alta recusa varredura mesmo depois de limpa', async () => {
    const h = buildHarness();
    await jogarEVencer(h, NORMAL);
    await jogarEVencer(h, ELITE);

    const varredura = await rodar(h, ELITE, { nonce: 'nonce-elite-auto', heroIds: ['heroi-1'], auto: true });
    expect(varredura.status).toBe(403);
    expect(varredura.body.error).toContain('sempre manual');
  });
});

describe('trava de tempo da dificuldade alta', () => {
  it('a elite fica trancada até a normal ser limpa', async () => {
    const h = buildHarness();
    const ticket = await pedirTicket(h, ELITE);
    expect(ticket.status).toBe(403);
    expect(ticket.body.error).toContain(NORMAL);
  });

  it('as entradas acabam e só voltam no dia declarado', async () => {
    const h = buildHarness();
    await jogarEVencer(h, NORMAL);

    const limite = catalog.dungeons[ELITE]!.entryLimit!;
    for (let i = 0; i < limite.maxEntries; i++) {
      const resultado = await jogarEVencer(h, ELITE);
      expect(resultado.status, `entrada ${i + 1}`).toBe(200);
    }

    // Esgotou: a próxima é recusada mesmo com energia sobrando.
    const estourou = await rodar(h, ELITE, { nonce: 'nonce-estouro', heroIds: ['heroi-1'], commands: [] });
    expect(estourou.status).toBe(403);
    expect(estourou.body.error).toContain('entrada');

    // A agenda desta masmorra reseta domingo e quarta; de sexta, o próximo é domingo.
    h.now = SEXTA + 2 * DIA;
    const depoisDoReset = await jogarEVencer(h, ELITE);
    expect(depoisDoReset.status).toBe(200);
  });

  it('a listagem mostra quantas entradas sobraram', async () => {
    const h = buildHarness();
    await jogarEVencer(h, NORMAL);
    await jogarEVencer(h, ELITE);

    const listagem = await h.app.inject({ method: 'GET', url: '/dungeons', headers: { 'x-player-token': TOKEN } });
    const elite = listagem.json().dungeons.find((d: any) => d.id === ELITE);
    expect(elite.entriesLeft).toBe(catalog.dungeons[ELITE]!.entryLimit!.maxEntries - 1);
  });
});

describe('o drop é do servidor, não do cliente', () => {
  it('a recompensa é determinística pelo nonce: dois servidores concordariam', async () => {
    const h1 = buildHarness();
    const h2 = buildHarness();

    const t1 = await pedirTicket(h1, NORMAL, ['heroi-1', 'heroi-2']);
    const jogada = resolveAutoBattle({ setup: t1.body.setup, seed: t1.body.seed });
    const payload = { nonce: t1.body.nonce, heroIds: ['heroi-1', 'heroi-2'], commands: jogada.commands };

    const r1 = await rodar(h1, NORMAL, payload);
    const r2 = await rodar(h2, NORMAL, payload);
    expect(r1.body.rewards).toEqual(r2.body.rewards);
  });

  it('a masmorra de equipamento entrega item no inventário, com id único', async () => {
    const h = buildHarness();
    const resultado = await jogarEVencer(h, 'dungeon-forja-abandonada');
    expect(resultado.body.outcome).toBe('victory');
    expect(resultado.body.rewards.items.length).toBeGreaterThan(0);

    const inventario = (await economia(h)).inventory;
    expect(inventario.length).toBe(resultado.body.rewards.items.length);
    expect(new Set(inventario.map((i: any) => i.id)).size).toBe(inventario.length);
  });

  it('a masmorra de chefe entrega material de despertar', async () => {
    const h = buildHarness();
    const resultado = await jogarEVencer(h, 'dungeon-covil-do-tirano');
    expect(resultado.body.outcome).toBe('victory');

    const materiais = (await economia(h)).materials;
    const total = Object.values(materiais).reduce((soma: number, n) => soma + (n as number), 0);
    expect(total).toBeGreaterThan(0);
  });
});
