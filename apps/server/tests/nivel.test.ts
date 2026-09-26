import { loadCatalogFromDisk } from '@paths-beyond/content';
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
  createMemoryIdempotencyRepository,
  createMemoryMatchRepository,
  createMemoryPartyPresetRepository,
  createMemoryPlayerRepository,
  createMemoryReplayRepository,
  createMemoryRewardsRepository,
  createMemorySeasonRepository,
} from '../src/repository/memoryRepository.js';
import { abrirEJogar } from './partidaViva.js';

// M39 1/N — A SUBIDA DE NÍVEL pelo servidor: o exp da vitória numa instância PvE (a soma dos
// inimigos dela, pelo nível de cada um) vai a cada herói que foi, e os Tomos de Experiência sobem
// o herói pela rota de usar tomo — o jeito mais eficiente (decisões do usuário, 2026-09-26).

const catalog = loadCatalogFromDisk();
const MISSAO = 'encounter-campanha-1';
const AGORA = Date.UTC(2026, 8, 26);

function servidor() {
  let nonce = 0;
  const economyRepository = createMemoryEconomyRepository();
  const heroRepository = createMemoryHeroRepository([]);
  const app = buildApp({
    repository: createMemoryPlayerRepository([]),
    heroRepository,
    arenaDefenseRepository: createMemoryArenaDefenseRepository(),
    partyPresetRepository: createMemoryPartyPresetRepository(),
    replayRepository: createMemoryReplayRepository(),
    matchRepository: createMemoryMatchRepository(),
    seasonRepository: createMemorySeasonRepository(),
    economyRepository,
    ownershipRepository: createMemoryCharacterOwnershipRepository(),
    rewardsRepository: createMemoryRewardsRepository(),
    idempotencyRepository: createMemoryIdempotencyRepository(),
    catalog,
    shopCatalog: {},
    rateLimiter: createInMemoryRateLimiter({ maxRequests: 5000, windowMs: 60_000 }),
    ticketSecret: 'segredo-do-nivel',
    identityValidator: createDevIdentityValidator(),
    now: () => AGORA,
    newNonce: () => `nonce-nivel-${(nonce += 1)}`,
  });
  return { app, economyRepository, heroRepository };
}

async function conta(app: ReturnType<typeof buildApp>, identidade: string) {
  const cabecalho = { 'x-platform-ticket': `dev:${identidade}` };
  const post = async (url: string, payload: unknown = {}) => {
    const r = await app.inject({ method: 'POST', url, headers: cabecalho, payload: payload as never });
    return { status: r.statusCode, body: r.json() as Record<string, unknown> };
  };
  const get = async (url: string) => {
    const r = await app.inject({ method: 'GET', url, headers: cabecalho });
    return { status: r.statusCode, body: r.json() as Record<string, unknown> };
  };
  expect((await post('/accounts/session')).status).toBe(200);
  const sessao = await get('/me');
  return { post, get, playerId: (sessao.body as { id: string }).id };
}

/** O exp que a missão vale: a soma dos inimigos dela, pelo nível de cada um. */
function expDaMissao(): number {
  const encontro = catalog.encounters.find((e) => e.id === MISSAO)!;
  const porNivel = catalog.economyRules.experiencia!.porNivelDeInimigo;
  return encontro.units
    .filter((u) => 'enemyId' in u && u.enemyId)
    .reduce((t, u) => t + (catalog.enemies[(u as { enemyId: string }).enemyId]!.level ?? 0) * porNivel, 0);
}

describe('o exp da vitória numa missão', () => {
  it('a vitória dá a cada herói que foi o exp dos inimigos da missão, e a derrota não dá nada', async () => {
    const { app } = servidor();
    const eu = await conta(app, 'nivel-missao');
    const roster = (await eu.get('/me/heroes')).body as unknown as readonly { hero: { id: string } }[];
    const heroIds = [roster[0]!.hero.id];

    let jogada = await abrirEJogar(eu.post, `/campaign/${MISSAO}/matches`, { heroIds, rulesVersion: RULES_VERSION });
    for (let i = 1; i < 8 && jogada.outcome !== 'victory'; i += 1) {
      expect(jogada.ultima?.liquidacao?.exp ?? 0, 'derrota não dá exp').toBe(0);
      jogada = await abrirEJogar(eu.post, `/campaign/${MISSAO}/matches`, { heroIds, rulesVersion: RULES_VERSION });
    }
    expect(jogada.outcome).toBe('victory');

    const exp = expDaMissao();
    expect(exp).toBeGreaterThan(0);
    expect(jogada.ultima?.liquidacao?.exp).toBe(exp);

    const depois = (await eu.get('/me/heroes')).body as unknown as readonly { hero: { id: string; level: number; exp: number } }[];
    const heroi = depois.find((e) => e.hero.id === heroIds[0])!.hero;
    // Nível 10 no começo; a barra guarda o exp (a missão 1 não paga um nível inteiro).
    expect(heroi.level * 1_000_000 + heroi.exp).toBeGreaterThan(10 * 1_000_000);
  });
});

describe('POST /heroes/:heroId/exp-tomes', () => {
  async function comTomos(quantos: number) {
    const s = servidor();
    const eu = await conta(s.app, 'nivel-tomo');
    await s.economyRepository.setMaterials(eu.playerId, { 'material-tomo-medio': quantos });
    const roster = (await eu.get('/me/heroes')).body as unknown as readonly { hero: { id: string } }[];
    return { ...s, eu, heroId: roster[0]!.hero.id };
  }

  it('consome os tomos e sobe o herói pela curva', async () => {
    const { eu, heroId, economyRepository } = await comTomos(3);
    const r = await eu.post(`/heroes/${heroId}/exp-tomes`, { nonce: 't-1', materialId: 'material-tomo-medio', quantidade: 3 });
    expect(r.status).toBe(200);
    // 6.000 de exp a partir do nível 10: 1.000 + 1.100 + 1.200 + 1.300 + 1.400 = 6.000, exatos
    // até o 15, com a barra zerada.
    expect(r.body.hero).toMatchObject({ level: 15, exp: 0 });
    expect(r.body.niveisGanhos).toBe(5);
    expect((await economyRepository.getMaterials(eu.playerId))['material-tomo-medio']).toBe(0);
  });

  it('recusa sem tomos suficientes, material que não é tomo e quantidade inválida — sem cobrar', async () => {
    const { eu, heroId, economyRepository } = await comTomos(1);
    expect((await eu.post(`/heroes/${heroId}/exp-tomes`, { nonce: 't-2', materialId: 'material-tomo-medio', quantidade: 2 })).status).toBe(400);
    expect((await eu.post(`/heroes/${heroId}/exp-tomes`, { nonce: 't-3', materialId: 'material-nucleo-de-despertar', quantidade: 1 })).status).toBe(400);
    expect((await eu.post(`/heroes/${heroId}/exp-tomes`, { nonce: 't-4', materialId: 'material-tomo-medio', quantidade: 0 })).status).toBe(400);
    expect((await economyRepository.getMaterials(eu.playerId))['material-tomo-medio']).toBe(1);
  });

  it('herói de outra conta é 403; reenvio do mesmo nonce não cobra de novo', async () => {
    const { app, eu, heroId, economyRepository } = await comTomos(2);
    const outro = await conta(app, 'nivel-outro');
    expect((await outro.post(`/heroes/${heroId}/exp-tomes`, { nonce: 'x-1', materialId: 'material-tomo-medio', quantidade: 1 })).status).toBe(403);
    const primeira = await eu.post(`/heroes/${heroId}/exp-tomes`, { nonce: 'dup', materialId: 'material-tomo-medio', quantidade: 1 });
    expect(primeira.status, JSON.stringify(primeira.body)).toBe(200);
    // A idempotência do M22 (montada neste harness) devolve a MESMA resposta ao reenvio, sem
    // executar de novo — o que se afirma é que o tomo não é cobrado duas vezes.
    const reenvio = await eu.post(`/heroes/${heroId}/exp-tomes`, { nonce: 'dup', materialId: 'material-tomo-medio', quantidade: 1 });
    expect(reenvio.body).toEqual(primeira.body);
    expect((await economyRepository.getMaterials(eu.playerId))['material-tomo-medio']).toBe(1);
  });
});
