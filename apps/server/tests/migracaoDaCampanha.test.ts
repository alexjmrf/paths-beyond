import { loadCatalogFromDisk } from '@paths-beyond/content';
import { describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { createInMemoryRateLimiter } from '../src/battle/rateLimit.js';
import { createDevIdentityValidator } from '../src/identity/devIdentity.js';
import {
  createMemoryArenaDefenseRepository,
  createMemoryPartyPresetRepository,
  createMemoryCharacterOwnershipRepository,
  createMemoryEconomyRepository,
  createMemoryHeroRepository,
  createMemoryIdempotencyRepository,
  createMemoryPlayerRepository,
  createMemoryReplayRepository,
  createMemoryRewardsRepository,
  createMemorySeasonRepository,
} from '../src/repository/memoryRepository.js';

// §10/D23 (M27, 3/N) — **O CRITÉRIO DE ACEITE 1, SEGUNDA METADE: "a campanha antiga migra
// sem perder o que o jogador já limpou".**
//
// A 1/N provou a primeira metade em `packages/data`: os seis encontros mantiveram os ids
// antigos. Isso é a condição NECESSÁRIA — `listClearedChapters` guarda o id do que foi
// limpo, e um id renomeado apagaria progresso em silêncio —, mas não é a afirmação. A
// afirmação é sobre a CONTA, e só o servidor a responde: um jogador cujo banco foi escrito
// pela versão de seis capítulos abre o jogo e vê o que já tinha.
//
// **A conta aqui não joga nada.** Ela é semeada pelo repositório, com os seis ids que a
// versão antiga teria gravado, e depois só LÊ. É o único jeito de escrever este teste: a
// versão antiga não existe mais para produzir o estado, e reproduzi-lo jogando as trinta
// missões de hoje seria testar outra coisa.
//
// **O que ele cobra, e que a trava de ids não cobra:** que `chaptersCleared` continue
// significando CAPÍTULO INTEIRO. É a armadilha que D31 achou: seis ids no banco viraram
// seis MISSÕES, e ler `.length` manteria o nome trocando o sentido — "A Fortaleza Caiu"
// (600 de moeda premium) ficaria reivindicável para quem não fechou capítulo nenhum. Nada
// quebraria; a moeda só apareceria na conta errada.

const TICKET_SECRET = 'segredo-da-migracao';
const AGORA = Date.UTC(2026, 5, 1);

const catalog = loadCatalogFromDisk();

// Os seis ids que a versão de seis capítulos gravava. Escritos à mão de propósito: são o
// FORMATO ANTIGO, e derivá-los do catálogo de hoje faria o teste migrar junto com o defeito
// que ele existe para pegar.
const IDS_ANTIGOS = [
  'encounter-campanha-1',
  'encounter-campanha-2',
  'encounter-campanha-3',
  'encounter-campanha-4',
  'encounter-campanha-5',
  'encounter-campanha-6',
];

function servidorComContaAntiga(identidade: string, claimsAntigos: string[] = []) {
  const rewardsRepository = createMemoryRewardsRepository();
  const app = buildApp({
    repository: createMemoryPlayerRepository([]),
    heroRepository: createMemoryHeroRepository([]),
    arenaDefenseRepository: createMemoryArenaDefenseRepository(),
    partyPresetRepository: createMemoryPartyPresetRepository(),
    replayRepository: createMemoryReplayRepository(),
    seasonRepository: createMemorySeasonRepository(),
    economyRepository: createMemoryEconomyRepository(),
    ownershipRepository: createMemoryCharacterOwnershipRepository(),
    rewardsRepository,
    idempotencyRepository: createMemoryIdempotencyRepository(),
    catalog,
    shopCatalog: {},
    rateLimiter: createInMemoryRateLimiter({ maxRequests: 1000, windowMs: 60_000 }),
    ticketSecret: TICKET_SECRET,
    identityValidator: createDevIdentityValidator(),
    now: () => AGORA,
  });

  const cabecalho = { 'x-platform-ticket': `dev:${identidade}` };
  const eu = {
    async post(url: string, payload: Record<string, unknown> = {}) {
      const r = await app.inject({ method: 'POST', url, headers: cabecalho, payload });
      return { status: r.statusCode, body: r.json() as any };
    },
    async get(url: string) {
      const r = await app.inject({ method: 'GET', url, headers: cabecalho });
      return { status: r.statusCode, body: r.json() as any };
    },
  };

  return {
    eu,
    // O sign-in cria a conta; o banco de progresso é escrito DEPOIS, como se a versão
    // anterior o tivesse deixado lá.
    async semear() {
      expect((await eu.post('/accounts/session')).status).toBe(200);
      for (const id of IDS_ANTIGOS) await rewardsRepository.markChapterCleared(identidade, id);
      for (const id of claimsAntigos) await rewardsRepository.claim(identidade, id);
    },
  };
}

function premio(rewards: { id: string }[], id: string) {
  const achado = rewards.find((r) => r.id === id) as
    | { id: string; claimable: boolean; claimed: boolean }
    | undefined;
  expect(achado, `${id} não está em /me/rewards`).toBeDefined();
  return achado!;
}

describe('M27 — a campanha antiga migra sem perder o que o jogador já limpou', () => {
  it('as seis missões antigas continuam marcadas como limpas na tela', async () => {
    const { eu, semear } = servidorComContaAntiga('jogador-da-migracao');
    await semear();

    const campanha = (await eu.get('/campaign')).body;
    const missoes = campanha.chapters.flatMap((c: any) => c.missions);

    for (const id of IDS_ANTIGOS) {
      const missao = missoes.find((m: any) => m.id === id);
      expect(missao, `${id} sumiu do catálogo — o progresso do jogador aponta para o nada`).toBeDefined();
      expect(missao.cleared, `${id} deixou de estar limpa`).toBe(true);
    }
  });

  it('e nada além delas ficou limpo — a migração não inventa progresso', async () => {
    const { eu, semear } = servidorComContaAntiga('jogador-sem-brinde');
    await semear();

    const campanha = (await eu.get('/campaign')).body;
    const limpas = campanha.chapters
      .flatMap((c: any) => c.missions)
      .filter((m: any) => m.cleared)
      .map((m: any) => m.id);

    expect([...limpas].sort()).toEqual([...IDS_ANTIGOS].sort());
  });

  it('nenhum CAPÍTULO fica limpo com seis missões — capítulo é dez, e a tela não pode mentir', async () => {
    // Os seis antigos moram hoje em capítulos que têm dez missões cada. Seis ids no banco
    // não fecham nenhum deles, e é isso que o jogador deve ver: o que ele já jogou continua
    // lá, e o que ele ainda não jogou continua por jogar.
    const { eu, semear } = servidorComContaAntiga('jogador-do-capitulo');
    await semear();

    const campanha = (await eu.get('/campaign')).body;
    for (const capitulo of campanha.chapters) {
      expect(capitulo.missions.length, `${capitulo.id}`).toBe(10);
      expect(capitulo.cleared, `${capitulo.id} apareceu limpo com seis missões no banco`).toBe(false);
    }
  });

  it('`chaptersCleared` conta CAPÍTULO e não missão — a armadilha de D31, pela porta da frente', async () => {
    // "A Fortaleza Caiu" pede três capítulos e paga 600. Se `chaptersCleared` fosse o
    // `.length` da lista de ids limpos, esta conta teria "6" e a conquista sairia paga sem
    // o jogador ter fechado capítulo nenhum.
    const { eu, semear } = servidorComContaAntiga('jogador-da-fortaleza');
    await semear();

    const rewards = (await eu.get('/me/rewards')).body.rewards as { id: string }[];
    expect(premio(rewards, 'achievement-a-fortaleza-caiu').claimable).toBe(false);
    expect(premio(rewards, 'achievement-a-estrada-aberta').claimable).toBe(false);

    // E a recusa não é geral: a condição que a granularidade nova trouxe funciona, e
    // funciona RETROATIVAMENTE — seis missões limpas satisfazem "limpe uma".
    expect(premio(rewards, 'achievement-primeiro-passo').claimable).toBe(true);
  });

  it('e a moeda continua recusada de fato, não só na tela', async () => {
    const { eu, semear } = servidorComContaAntiga('jogador-teimoso');
    await semear();

    const tentativa = await eu.post('/rewards/achievement-a-fortaleza-caiu/claim', {});
    expect(tentativa.status, JSON.stringify(tentativa.body)).not.toBe(200);
    expect((await eu.get('/me/roster')).body.premium).toBe(0);
  });

  it('o que já foi reivindicado FICA, mesmo quando a condição deixa de ser cumprida', async () => {
    // A consequência que D31 registrou e aceitou: com seis encontros, seis ids limpos eram
    // a campanha inteira, e as conquistas de capítulo eram alcançáveis. Com trinta missões
    // deixam de ser. Quem reivindicou antes não devolve — `claims` é persistido, e cobrar
    // de volta uma recompensa já paga é pior do que a incoerência.
    const { eu, semear } = servidorComContaAntiga('jogador-antigo-premiado', [
      'achievement-a-fortaleza-caiu',
    ]);
    await semear();

    const rewards = (await eu.get('/me/rewards')).body.rewards as { id: string }[];
    const fortaleza = premio(rewards, 'achievement-a-fortaleza-caiu');
    expect(fortaleza.claimed, 'a reivindicação antiga sumiu').toBe(true);
    expect(fortaleza.claimable, 'uma reivindicação paga não pode voltar a ser reivindicável').toBe(false);
  });
});
