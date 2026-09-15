import { loadCatalogFromDisk, playFromSetup } from '@paths-beyond/content';
import { RULES_VERSION } from '@paths-beyond/core';
import { describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { createInMemoryRateLimiter } from '../src/battle/rateLimit.js';
import { createDevIdentityValidator } from '../src/identity/devIdentity.js';
import {
  createMemoryArenaDefenseRepository,
  createMemoryCharacterOwnershipRepository,
  createMemoryEconomyRepository,
  createMemoryHeroRepository,
  createMemoryPartyPresetRepository,
  createMemoryPlayerRepository,
  createMemoryReplayRepository,
  createMemoryRewardsRepository,
  createMemorySeasonRepository,
  createMemoryTelemetryRepository,
} from '../src/repository/memoryRepository.js';
import { CAMPOS_COLETADOS } from '../src/repository/types.js';

// M34 1/N (D45) — TELEMETRIA: o servidor mede o jogo, e o jogador pode recusar.
//
// O aceite do M34 pergunta quatro coisas: onde os jogadores param, quanto tempo cada missão
// leva, o que é coletado (declarado, com direito a recusar) e que nada identifique alguém além
// do id de conta. As duas primeiras o servidor já VÊ sem instrumentar o cliente: o ticket de
// missão é "começou" e a run é "terminou" — só que o ticket era stateless (a seed sai do HMAC
// do nonce) e nada guardava QUANDO ele foi emitido. Esta fatia guarda: uma linha por tentativa,
// aberta no ticket e fechada na run, e o "último visto" por conta, tocado no sign-in.
//
// A recusa é por conta, não por máquina — é a conta que o servidor conhece (M20) —, e
// recusar significa duas coisas: nada novo é gravado E o que já foi gravado é apagado. O log
// de requisição do M19 continua nos dois casos: é operação (quem pediu o quê e como terminou),
// não medição de jogo, e a declaração diz isso.

const catalog = loadCatalogFromDisk();
const MISSAO = 'encounter-campanha-1';
const T0 = Date.UTC(2026, 8, 15, 12, 0, 0);

function harness() {
  let agora = T0;
  let nonce = 0;
  const telemetryRepository = createMemoryTelemetryRepository();
  const app = buildApp({
    repository: createMemoryPlayerRepository([]),
    heroRepository: createMemoryHeroRepository([]),
    arenaDefenseRepository: createMemoryArenaDefenseRepository(),
    partyPresetRepository: createMemoryPartyPresetRepository(),
    telemetryRepository,
    replayRepository: createMemoryReplayRepository(),
    seasonRepository: createMemorySeasonRepository(),
    economyRepository: createMemoryEconomyRepository(),
    ownershipRepository: createMemoryCharacterOwnershipRepository(),
    rewardsRepository: createMemoryRewardsRepository(),
    catalog,
    shopCatalog: {},
    rateLimiter: createInMemoryRateLimiter({ maxRequests: 1000, windowMs: 60_000 }),
    ticketSecret: 'segredo-da-telemetria',
    identityValidator: createDevIdentityValidator(),
    now: () => agora,
    newNonce: () => `nonce-telemetria-${(nonce += 1)}`,
  });
  return {
    app,
    telemetryRepository,
    avancar(ms: number) {
      agora += ms;
    },
  };
}

type App = ReturnType<typeof buildApp>;

function jogador(app: App, identidade: string) {
  const headers = { 'x-platform-ticket': `dev:${identidade}` };
  return {
    async post(url: string, payload: Record<string, unknown> = {}) {
      const r = await app.inject({ method: 'POST', url, headers, payload });
      return { status: r.statusCode, body: r.json() as any };
    },
    async put(url: string, payload: Record<string, unknown> = {}) {
      const r = await app.inject({ method: 'PUT', url, headers, payload });
      return { status: r.statusCode, body: r.json() as any };
    },
    async get(url: string) {
      const r = await app.inject({ method: 'GET', url, headers });
      return { status: r.statusCode, body: r.json() as any };
    },
    async delete(url: string) {
      const r = await app.inject({ method: 'DELETE', url, headers });
      return { status: r.statusCode, body: r.json() as any };
    },
  };
}

async function contaNova(app: App, identidade: string) {
  const eu = jogador(app, identidade);
  const sessao = await eu.post('/accounts/session');
  expect(sessao.status).toBe(200);
  const heroes = await eu.get('/me/heroes');
  const heroIds = timeParaMissao(heroes.body, MISSAO);
  return { eu, id: sessao.body.id as string, heroIds };
}

function timeParaMissao(heroes: readonly { hero: { id: string; characterId: string } }[], missaoId: string) {
  const missao = catalog.encounters.find((e) => e.id === missaoId)!;
  return missao.units
    .filter((unit) => unit.side === 'player')
    .map((vaga) => heroes.find((h) => h.hero.characterId === (vaga as { hero: { characterId: string } }).hero.characterId)!.hero.id);
}

async function pedirTicket(eu: ReturnType<typeof jogador>, heroIds: readonly string[]) {
  const ticket = await eu.post(`/campaign/${MISSAO}/ticket`, { heroIds });
  expect(ticket.status, JSON.stringify(ticket.body)).toBe(200);
  return ticket.body as { nonce: string; seed: number; setup: unknown };
}

async function jogarAteOFim(eu: ReturnType<typeof jogador>, heroIds: readonly string[], ticket: { nonce: string; seed: number; setup: unknown }) {
  const jogada = playFromSetup(ticket.setup as never, ticket.seed, MISSAO);
  const run = await eu.post(`/campaign/${MISSAO}/run`, {
    nonce: ticket.nonce,
    heroIds,
    commands: jogada.commandLog,
    rulesVersion: RULES_VERSION,
  });
  expect(run.status, JSON.stringify(run.body)).toBe(200);
  return run.body as { outcome: 'victory' | 'defeat'; roundsPlayed: number };
}

describe('a tentativa de missão: aberta no ticket, fechada na run', () => {
  it('o ticket abre uma linha com quem, qual missão e quando; a run fecha com desfecho, rounds e quando', async () => {
    const h = harness();
    const { eu, id, heroIds } = await contaNova(h.app, 'ana');

    const ticket = await pedirTicket(eu, heroIds);
    expect(await h.telemetryRepository.listAttemptsByPlayer(id)).toEqual([
      { playerId: id, missionId: MISSAO, nonce: ticket.nonce, issuedAt: T0, finishedAt: null, outcome: null, rounds: null },
    ]);

    h.avancar(90_000);
    const run = await jogarAteOFim(eu, heroIds, ticket);

    expect(await h.telemetryRepository.listAttemptsByPlayer(id)).toEqual([
      {
        playerId: id,
        missionId: MISSAO,
        nonce: ticket.nonce,
        issuedAt: T0,
        finishedAt: T0 + 90_000,
        outcome: run.outcome,
        rounds: run.roundsPlayed,
      },
    ]);
  });

  it('um ticket sem run é um abandono: a linha fica aberta, e a tentativa seguinte é outra linha', async () => {
    const h = harness();
    const { eu, id, heroIds } = await contaNova(h.app, 'bia');

    await pedirTicket(eu, heroIds);
    h.avancar(10_000);
    const segundo = await pedirTicket(eu, heroIds);
    await jogarAteOFim(eu, heroIds, segundo);

    const linhas = await h.telemetryRepository.listAttemptsByPlayer(id);
    expect(linhas).toHaveLength(2);
    expect(linhas[0]!.finishedAt).toBeNull();
    expect(linhas[1]!.finishedAt).not.toBeNull();
  });

  it('a run de um nonce que a telemetria não conhece NÃO falha a run — medir nunca pode custar a partida', async () => {
    const h = harness();
    const { eu, heroIds } = await contaNova(h.app, 'caio');

    const ticket = await pedirTicket(eu, heroIds);
    // Some com a linha por fora (é o que acontece com uma linha gravada antes de o jogador
    // recusar, ou com um banco restaurado de um backup mais velho).
    await h.telemetryRepository.deletePlayerData((await eu.get('/me')).body.id);
    const run = await jogarAteOFim(eu, heroIds, ticket);
    expect(['victory', 'defeat']).toContain(run.outcome);
  });
});

describe('o último visto', () => {
  it('o sign-in toca o "último visto" da conta, e cada sign-in o move', async () => {
    const h = harness();
    const { eu, id } = await contaNova(h.app, 'dora');
    expect((await h.telemetryRepository.getAccount(id)).lastSeenAt).toBe(T0);

    h.avancar(3_600_000);
    await eu.post('/accounts/session');
    expect((await h.telemetryRepository.getAccount(id)).lastSeenAt).toBe(T0 + 3_600_000);
  });
});

describe('GET/PUT /me/telemetry — a declaração e a recusa', () => {
  it('exige sessão', async () => {
    const h = harness();
    const r = await h.app.inject({ method: 'GET', url: '/me/telemetry' });
    expect(r.statusCode).toBe(401);
  });

  it('conta nova: não recusou, e a resposta DECLARA os campos coletados — a mesma lista que a tabela tem', async () => {
    const h = harness();
    const { eu } = await contaNova(h.app, 'eva');
    const r = await eu.get('/me/telemetry');
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ optOut: false, collected: [...CAMPOS_COLETADOS] });
  });

  it('recusar: nada novo é gravado — nem tentativa, nem último visto', async () => {
    const h = harness();
    const { eu, id, heroIds } = await contaNova(h.app, 'fabio');

    const put = await eu.put('/me/telemetry', { optOut: true });
    expect(put.status).toBe(200);
    expect(put.body).toEqual({ optOut: true, collected: [...CAMPOS_COLETADOS] });

    h.avancar(1_000);
    await eu.post('/accounts/session');
    const ticket = await pedirTicket(eu, heroIds);
    await jogarAteOFim(eu, heroIds, ticket);

    expect(await h.telemetryRepository.listAttemptsByPlayer(id)).toEqual([]);
    expect((await h.telemetryRepository.getAccount(id))).toEqual({ playerId: id, optOut: true, lastSeenAt: null });
    expect((await eu.get('/me/telemetry')).body.optOut).toBe(true);
  });

  it('recusar APAGA o que já tinha sido coletado — recusar não é só parar', async () => {
    const h = harness();
    const { eu, id, heroIds } = await contaNova(h.app, 'gil');
    await jogarAteOFim(eu, heroIds, await pedirTicket(eu, heroIds));
    expect(await h.telemetryRepository.listAttemptsByPlayer(id)).toHaveLength(1);

    await eu.put('/me/telemetry', { optOut: true });
    expect(await h.telemetryRepository.listAttemptsByPlayer(id)).toEqual([]);
    expect((await h.telemetryRepository.getAccount(id)).lastSeenAt).toBeNull();
  });

  it('voltar atrás (optOut: false) volta a gravar dali em diante', async () => {
    const h = harness();
    const { eu, id, heroIds } = await contaNova(h.app, 'hugo');
    await eu.put('/me/telemetry', { optOut: true });
    await eu.put('/me/telemetry', { optOut: false });

    await pedirTicket(eu, heroIds);
    expect(await h.telemetryRepository.listAttemptsByPlayer(id)).toHaveLength(1);
  });

  it('corpo sem booleano é 400', async () => {
    const h = harness();
    const { eu } = await contaNova(h.app, 'iris');
    expect((await eu.put('/me/telemetry', { optOut: 'sim' })).status).toBe(400);
    expect((await eu.put('/me/telemetry', {})).status).toBe(400);
  });
});

describe('a conta leva a telemetria junto (§9.4, M20)', () => {
  it('a exportação inclui as tentativas e a escolha', async () => {
    const h = harness();
    const { eu, id, heroIds } = await contaNova(h.app, 'joana');
    await jogarAteOFim(eu, heroIds, await pedirTicket(eu, heroIds));

    const exportado = await eu.get('/me/export');
    expect(exportado.status).toBe(200);
    expect(exportado.body.telemetry.account).toEqual({ playerId: id, optOut: false, lastSeenAt: T0 });
    expect(exportado.body.telemetry.missionAttempts).toHaveLength(1);
    expect(exportado.body.telemetry.missionAttempts[0].missionId).toBe(MISSAO);
  });

  it('apagar a conta apaga a telemetria — senão a exclusão reprovaria por integridade no Postgres', async () => {
    const h = harness();
    const { eu, id, heroIds } = await contaNova(h.app, 'kai');
    await pedirTicket(eu, heroIds);

    expect((await eu.delete('/me')).body).toEqual({ deleted: true });
    expect(await h.telemetryRepository.listAttemptsByPlayer(id)).toEqual([]);
    expect(await h.telemetryRepository.getAccount(id)).toEqual({ playerId: id, optOut: false, lastSeenAt: null });
  });
});

describe('sem repositório de telemetria, o servidor é o de antes', () => {
  it('ticket, run e sign-in funcionam sem gravar nada', async () => {
    let nonce = 0;
    const app = buildApp({
      repository: createMemoryPlayerRepository([]),
      heroRepository: createMemoryHeroRepository([]),
      arenaDefenseRepository: createMemoryArenaDefenseRepository(),
      partyPresetRepository: createMemoryPartyPresetRepository(),
      replayRepository: createMemoryReplayRepository(),
      seasonRepository: createMemorySeasonRepository(),
      economyRepository: createMemoryEconomyRepository(),
      ownershipRepository: createMemoryCharacterOwnershipRepository(),
      rewardsRepository: createMemoryRewardsRepository(),
      catalog,
      shopCatalog: {},
      rateLimiter: createInMemoryRateLimiter({ maxRequests: 1000, windowMs: 60_000 }),
      ticketSecret: 'segredo',
      identityValidator: createDevIdentityValidator(),
      now: () => T0,
      newNonce: () => `nonce-sem-telemetria-${(nonce += 1)}`,
    });
    const { eu, heroIds } = await contaNova(app, 'lia');
    const run = await jogarAteOFim(eu, heroIds, await pedirTicket(eu, heroIds));
    expect(['victory', 'defeat']).toContain(run.outcome);
    expect((await eu.get('/me/telemetry')).status).toBe(404);
  });
});
