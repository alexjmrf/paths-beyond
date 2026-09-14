import { loadCatalogFromDisk } from '@paths-beyond/content';
import type { Hero } from '@paths-beyond/core';
import { describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { createDevIdentityValidator } from '../src/identity/devIdentity.js';
import { createInMemoryRateLimiter } from '../src/battle/rateLimit.js';
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
} from '../src/repository/memoryRepository.js';
import { DEFAULT_PVE_ACCOUNT, MAX_PARTY_PRESETS } from '../src/repository/types.js';

// M35 3/N (D42) — os PRESETS de party: 8 slots por conta, no servidor.
//
// O terceiro passo de escolher uma missão é "quem vai", e o briefing decide que o jogador
// escolhe um preset e ainda troca antes de entrar. Um preset é estado de CONTA: sobrevive à
// máquina e à reinstalação, então mora no servidor — o mesmo desenho de `/me/defense` (M15),
// que já provou tabela + repository com paridade + rota. `localStorage` foi recusado pelo
// mesmo motivo que o M18 7/N tirou o progresso de lá.
//
// O servidor NÃO valida o preset contra uma missão (o número de vagas é da missão, e o preset
// é reutilizado entre missões): ele valida posse (§9.4) e o tamanho máximo de time, e a tela
// apara ao aplicar. Slot é 1..8 (`MAX_PARTY_PRESETS`), e o nome é livre — é o que se lê no
// seletor.

const catalog = loadCatalogFromDisk();
const TOKEN = 'token-presets';
const OUTRO = 'token-outro';

function heroiDoCapitulo(indice: number): Hero {
  const encounter = catalog.encounters.find((e) => e.units.filter((u) => u.side === 'player').length >= 2)!;
  const slot = encounter.units.filter((unit) => unit.side === 'player')[indice]!;
  return { ...(slot as { hero: Hero }).hero, id: `heroi-${indice}` };
}

function buildHarness() {
  const playerRepository = createMemoryPlayerRepository([
    { id: 'player-1', platformProvider: 'dev' as const, platformId: TOKEN, displayName: 'Um', elo: 1200, arenaMarks: 0, ...DEFAULT_PVE_ACCOUNT },
    { id: 'player-2', platformProvider: 'dev' as const, platformId: OUTRO, displayName: 'Dois', elo: 1200, arenaMarks: 0, ...DEFAULT_PVE_ACCOUNT },
  ]);
  const heroRepository = createMemoryHeroRepository([
    { ownerPlayerId: 'player-1', hero: heroiDoCapitulo(0), equippedItems: [] },
    { ownerPlayerId: 'player-1', hero: heroiDoCapitulo(1), equippedItems: [] },
    { ownerPlayerId: 'player-2', hero: { ...heroiDoCapitulo(0), id: 'heroi-do-outro' }, equippedItems: [] },
  ]);
  const partyPresetRepository = createMemoryPartyPresetRepository();
  const app = buildApp({
    repository: playerRepository,
    heroRepository,
    arenaDefenseRepository: createMemoryArenaDefenseRepository(),
    partyPresetRepository,
    economyRepository: createMemoryEconomyRepository(),
    ownershipRepository: createMemoryCharacterOwnershipRepository(),
    rewardsRepository: createMemoryRewardsRepository(),
    replayRepository: createMemoryReplayRepository(),
    seasonRepository: createMemorySeasonRepository(),
    catalog,
    shopCatalog: {},
    ticketSecret: 'segredo',
    identityValidator: createDevIdentityValidator(),
    rateLimiter: createInMemoryRateLimiter({ maxRequests: 1000, windowMs: 60_000 }),
  });
  return { app, partyPresetRepository };
}

const auth = (token = TOKEN) => ({ 'x-platform-ticket': `dev:${token}` });

describe('GET /me/party-presets', () => {
  it('exige sessão', async () => {
    const { app } = buildHarness();
    expect((await app.inject({ method: 'GET', url: '/me/party-presets' })).statusCode).toBe(401);
  });

  it('conta nova: lista vazia, e o número de slots vem junto para a tela desenhar os oito', async () => {
    const { app } = buildHarness();
    const response = await app.inject({ method: 'GET', url: '/me/party-presets', headers: auth() });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ slots: MAX_PARTY_PRESETS, presets: [] });
  });
});

describe('PUT /me/party-presets/:slot', () => {
  it('salva, devolve o preset, e a lista passa a tê-lo', async () => {
    const { app } = buildHarness();
    const put = await app.inject({
      method: 'PUT',
      url: '/me/party-presets/3',
      headers: auth(),
      payload: { name: 'Estrada', heroIds: ['heroi-0', 'heroi-1'] },
    });
    expect(put.statusCode).toBe(200);
    expect(put.json()).toEqual({ ownerPlayerId: 'player-1', slot: 3, name: 'Estrada', heroIds: ['heroi-0', 'heroi-1'] });

    const list = await app.inject({ method: 'GET', url: '/me/party-presets', headers: auth() });
    expect(list.json().presets).toEqual([{ ownerPlayerId: 'player-1', slot: 3, name: 'Estrada', heroIds: ['heroi-0', 'heroi-1'] }]);
  });

  it('salvar de novo no mesmo slot SUBSTITUI', async () => {
    const { app } = buildHarness();
    await app.inject({ method: 'PUT', url: '/me/party-presets/1', headers: auth(), payload: { name: 'A', heroIds: ['heroi-0'] } });
    await app.inject({ method: 'PUT', url: '/me/party-presets/1', headers: auth(), payload: { name: 'B', heroIds: ['heroi-1'] } });
    const list = await app.inject({ method: 'GET', url: '/me/party-presets', headers: auth() });
    expect(list.json().presets).toEqual([{ ownerPlayerId: 'player-1', slot: 1, name: 'B', heroIds: ['heroi-1'] }]);
  });

  it('slot fora de 1..8 é 400', async () => {
    const { app } = buildHarness();
    for (const slot of ['0', '9', 'x']) {
      const r = await app.inject({ method: 'PUT', url: `/me/party-presets/${slot}`, headers: auth(), payload: { name: 'A', heroIds: ['heroi-0'] } });
      expect(r.statusCode, slot).toBe(400);
    }
  });

  it('sem herói, ou mais de 5, é 400; nome vazio é 400', async () => {
    const { app } = buildHarness();
    const vazio = await app.inject({ method: 'PUT', url: '/me/party-presets/1', headers: auth(), payload: { name: 'A', heroIds: [] } });
    expect(vazio.statusCode).toBe(400);
    const seis = await app.inject({
      method: 'PUT',
      url: '/me/party-presets/1',
      headers: auth(),
      payload: { name: 'A', heroIds: ['heroi-0', 'heroi-1', 'heroi-0', 'heroi-1', 'heroi-0', 'heroi-1'] },
    });
    expect(seis.statusCode).toBe(400);
    const semNome = await app.inject({ method: 'PUT', url: '/me/party-presets/1', headers: auth(), payload: { name: '  ', heroIds: ['heroi-0'] } });
    expect(semNome.statusCode).toBe(400);
  });

  it('herói de outra conta é 403 (§9.4 — posse)', async () => {
    const { app } = buildHarness();
    const r = await app.inject({ method: 'PUT', url: '/me/party-presets/1', headers: auth(), payload: { name: 'A', heroIds: ['heroi-do-outro'] } });
    expect(r.statusCode).toBe(403);
  });

  it('o mesmo herói duas vezes é 400 — uma vaga por pessoa', async () => {
    const { app } = buildHarness();
    const r = await app.inject({ method: 'PUT', url: '/me/party-presets/1', headers: auth(), payload: { name: 'A', heroIds: ['heroi-0', 'heroi-0'] } });
    expect(r.statusCode).toBe(400);
  });

  it('cada conta só vê os próprios presets', async () => {
    const { app } = buildHarness();
    await app.inject({ method: 'PUT', url: '/me/party-presets/2', headers: auth(), payload: { name: 'Meu', heroIds: ['heroi-0'] } });
    const doOutro = await app.inject({ method: 'GET', url: '/me/party-presets', headers: auth(OUTRO) });
    expect(doOutro.json().presets).toEqual([]);
  });
});

describe('DELETE /me/party-presets/:slot', () => {
  it('apaga o slot; apagar o que não existe é 404', async () => {
    const { app } = buildHarness();
    await app.inject({ method: 'PUT', url: '/me/party-presets/2', headers: auth(), payload: { name: 'Meu', heroIds: ['heroi-0'] } });
    expect((await app.inject({ method: 'DELETE', url: '/me/party-presets/2', headers: auth() })).statusCode).toBe(200);
    expect((await app.inject({ method: 'GET', url: '/me/party-presets', headers: auth() })).json().presets).toEqual([]);
    expect((await app.inject({ method: 'DELETE', url: '/me/party-presets/2', headers: auth() })).statusCode).toBe(404);
  });
});

describe('a conta leva os presets junto', () => {
  it('a exportação (§9.4, M20) inclui os presets', async () => {
    const { app } = buildHarness();
    await app.inject({ method: 'PUT', url: '/me/party-presets/5', headers: auth(), payload: { name: 'Serra', heroIds: ['heroi-1'] } });
    const exportado = await app.inject({ method: 'GET', url: '/me/export', headers: auth() });
    expect(exportado.json().partyPresets).toEqual([{ ownerPlayerId: 'player-1', slot: 5, name: 'Serra', heroIds: ['heroi-1'] }]);
  });

  it('apagar a conta apaga os presets — senão a exclusão reprovaria por integridade no Postgres', async () => {
    const { app, partyPresetRepository } = buildHarness();
    await app.inject({ method: 'PUT', url: '/me/party-presets/5', headers: auth(), payload: { name: 'Serra', heroIds: ['heroi-1'] } });
    expect((await app.inject({ method: 'DELETE', url: '/me', headers: auth() })).statusCode).toBe(200);
    expect(await partyPresetRepository.listPresetsByOwner('player-1')).toEqual([]);
  });
});
