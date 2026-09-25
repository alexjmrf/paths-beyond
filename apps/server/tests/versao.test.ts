import { loadCatalogFromDisk } from '@paths-beyond/content';
import { RULES_VERSION, RULES_VERSION_MISMATCH_CODE, resolveAutoBattle, type Hero } from '@paths-beyond/core';
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
  createMemoryPlayerRepository,
  createMemoryMatchRepository,
  createMemoryReplayRepository,
  createMemoryRewardsRepository,
  createMemorySeasonRepository,
} from '../src/repository/memoryRepository.js';
import { DEFAULT_PVE_ACCOUNT, type MatchRepository } from '../src/repository/types.js';

// §3.3/§9.4 (M22, sub-sessão 1/N) — a VERSÃO DE REGRAS nas três rotas que reexecutam
// comandos do cliente.
//
// `POST /battles` recusa versão diferente desde o M7. As outras duas nasceram sem a
// checagem: `/dungeons/:id/run` (buraco registrado no M17 5/N) e `/campaign/:id/run` (que
// nasceu no M18 4/N, depois de o roadmap do M22 ser escrito). As três reexecutam comandos
// contra o motor DESTE servidor — se o cliente jogou com outra versão de regras, o replay
// não descreve a mesma partida, e o desfecho passa a depender de qual motor rodou.
//
// O que este arquivo trava, além da recusa: **o corpo do erro é legível por máquina.** Um
// 409 com frase solta obriga o cliente a adivinhar pela mensagem, e a tela que manda
// atualizar para de aparecer no dia em que alguém melhora a redação.

const TICKET_SECRET = 'segredo-de-teste';
const TOKEN = 'token-versao';
const AGORA = Date.UTC(2026, 5, 1);
const CAPITULO = 'encounter-campanha-1';

const catalog = loadCatalogFromDisk();

function heroiDoCapitulo(): Hero {
  const encounter = catalog.encounters.find((e) => e.id === CAPITULO)!;
  return (encounter.units.find((unit) => unit.side === 'player') as { hero: Hero }).hero;
}

function buildHarness() {
  const hero = heroiDoCapitulo();
  const playerRepository = createMemoryPlayerRepository([
    {
      id: 'player-1',
      platformProvider: 'dev' as const,
      platformId: TOKEN,
      displayName: 'Herói',
      elo: 1200,
      arenaMarks: 0,
      ...DEFAULT_PVE_ACCOUNT,
      energy: { stored: catalog.economyRules.energy.max, asOfMs: AGORA },
    },
  ]);

  return buildApp({
    repository: playerRepository,
    heroRepository: createMemoryHeroRepository([{ ownerPlayerId: 'player-1', hero, equippedItems: [] }]),
    arenaDefenseRepository: createMemoryArenaDefenseRepository(),
    partyPresetRepository: createMemoryPartyPresetRepository(),
    replayRepository: createMemoryReplayRepository(),
    matchRepository: createMemoryMatchRepository(),
    seasonRepository: createMemorySeasonRepository(),
    economyRepository: createMemoryEconomyRepository(),
    ownershipRepository: createMemoryCharacterOwnershipRepository(),
    rewardsRepository: createMemoryRewardsRepository(),
    catalog,
    shopCatalog: {},
    rateLimiter: createInMemoryRateLimiter({ maxRequests: 1000, windowMs: 60_000 }),
    ticketSecret: TICKET_SECRET,
    identityValidator: createDevIdentityValidator(),
    now: () => AGORA,
  });
}

async function post(app: ReturnType<typeof buildApp>, url: string, payload: Record<string, unknown> = {}) {
  const response = await app.inject({
    method: 'POST',
    url,
    headers: { 'x-platform-ticket': `dev:${TOKEN}` },
    payload,
  });
  return { status: response.statusCode, body: response.json() as any };
}

// Uma masmorra que o time inicial vence, e um capítulo idem: as rotas precisam CHEGAR ao
// ponto de recusar por versão, e não morrer antes por outro motivo.
const MASMORRA = Object.values(catalog.dungeons).find((d) => !d.manualOnly && !d.requiresClearOf)!.id;

describe('a versão de regras nas rotas de batalha', () => {
  // M36 2/N — as três rotas que reexecutavam comandos (`POST /battles`, `/dungeons/:id/run`,
  // `/campaign/:id/run`) viraram duas: ABRIR a partida e MANDAR um comando. A checagem mudou de
  // lugar junto, e para melhor: ela acontece antes de o jogador investir a batalha inteira, em
  // vez de depois. O que se mede continua o mesmo — recusa com corpo legível por máquina, o
  // motivo distinguindo "mandou outra" de "não mandou", e nada cobrado antes da recusa.

  it('`POST /arena/matches` recusa versão diferente com corpo LEGÍVEL POR MÁQUINA', async () => {
    const app = buildHarness();
    const { status, body } = await post(app, '/arena/matches', {
      attackerHeroIds: [heroiDoCapitulo().id],
      defenderPlayerId: 'player-1',
      rulesVersion: '0.18.0',
    });

    expect(status).toBe(409);
    // A frase continua, para log e para humano; o que é novo é o resto.
    expect(body.error).toContain('rulesVersion');
    expect(body.code).toBe(RULES_VERSION_MISMATCH_CODE);
    expect(body.reason).toBe('different');
    expect(body.expected).toBe(RULES_VERSION);
    expect(body.received).toBe('0.18.0');
  });

  it('`POST /dungeons/:id/matches` recusa versão diferente — o buraco do M17 5/N, ainda tapado', async () => {
    const app = buildHarness();
    const { status, body } = await post(app, `/dungeons/${MASMORRA}/matches`, {
      heroIds: [heroiDoCapitulo().id],
      rulesVersion: '0.18.0',
    });

    expect(status).toBe(409);
    expect(body.code).toBe(RULES_VERSION_MISMATCH_CODE);
  });

  it('`POST /campaign/:id/matches` idem — o mesmo buraco, nascido depois do roadmap', async () => {
    const app = buildHarness();
    const { status, body } = await post(app, `/campaign/${CAPITULO}/matches`, {
      heroIds: [heroiDoCapitulo().id],
      rulesVersion: '0.18.0',
    });

    expect(status).toBe(409);
    expect(body.code).toBe(RULES_VERSION_MISMATCH_CODE);
  });

  it('a versão AUSENTE é recusada ao abrir, e o motivo a distingue de "mandou outra"', async () => {
    // Um cliente que não manda a versão é um cliente anterior à checagem. A tela diz coisas
    // diferentes nos dois casos, e por isso o servidor não os confunde.
    const app = buildHarness();
    const { status, body } = await post(app, `/dungeons/${MASMORRA}/matches`, {
      heroIds: [heroiDoCapitulo().id],
    });

    expect(status).toBe(409);
    expect(body.reason).toBe('missing');
    expect(body.received).toBeNull();
  });

  it('a recusa por versão vem ANTES de qualquer cobrança — energia intacta', async () => {
    // O ponto da ordem, e ele ficou mais forte com D48: a energia agora é cobrada ao ABRIR, que
    // é exatamente a rota que recusa. Um cliente velho não pode pagar pela partida que ele não
    // vai jogar.
    const app = buildHarness();
    const antes = await app.inject({
      method: 'GET',
      url: '/me/economy',
      headers: { 'x-platform-ticket': `dev:${TOKEN}` },
    });

    await post(app, `/dungeons/${MASMORRA}/matches`, {
      heroIds: [heroiDoCapitulo().id],
      rulesVersion: '0.18.0',
    });

    const depois = await app.inject({
      method: 'GET',
      url: '/me/economy',
      headers: { 'x-platform-ticket': `dev:${TOKEN}` },
    });

    expect(depois.json().energy.stored).toBe(antes.json().energy.stored);
  });

  it('a versão CERTA continua passando — a rota abre a batalha em vez de recusar', async () => {
    const app = buildHarness();
    const { status, body } = await post(app, `/dungeons/${MASMORRA}/matches`, {
      heroIds: [heroiDoCapitulo().id],
      rulesVersion: RULES_VERSION,
    });

    expect(status).toBe(201);
    // Ganhar ou perder é questão de balanceamento (um herói de capítulo 1 numa masmorra), e não
    // é o que este teste mede: o que ele mede é que a requisição foi ACEITA em vez de recusada.
    expect(body.rulesVersion).toBe(RULES_VERSION);
    expect(body.outcome).toBe('ongoing');
  });

  it('a partida carrega a versão em que foi aberta, e o comando é julgado por ela', async () => {
    // O laço fecha de um jeito novo: antes o cliente repetia a versão na submissão; agora ela
    // fica GRAVADA na partida. Quem pode mudar no meio de uma batalha é o servidor (um deploy),
    // e é essa a checagem que o cliente não teria como fazer sozinho.
    const app = buildHarness();
    const abertura = await post(app, `/campaign/${CAPITULO}/matches`, {
      heroIds: [heroiDoCapitulo().id],
      rulesVersion: RULES_VERSION,
    });
    expect(abertura.status).toBe(201);
    expect(abertura.body.rulesVersion).toBe(RULES_VERSION);

    // E um cliente que insiste em declarar uma versão errada no comando continua sendo recusado.
    const comando = await post(app, `/matches/${abertura.body.nonce}/commands`, {
      command: { t: 'wait', unitId: 'seja-quem-for' },
      rulesVersion: '0.18.0',
    });
    expect(comando.status).toBe(409);
    expect(comando.body.code).toBe(RULES_VERSION_MISMATCH_CODE);
  });
});

// M37 4/N — **O REPLAY DE UMA PARTIDA ANTERIOR É RECUSADO COM 409.**
//
// É critério de aceite do milestone, e era um buraco de verdade: `GET /battles/:nonce/log`
// REEXECUTA a partida a partir de `setup + seed + commands` contra o motor deste servidor, e
// não conferia a versão em que ela foi gravada. Uma partida de `0.19.0` relida depois do
// `RULES_VERSION` subir era reproduzida com as regras NOVAS — e o log entregue ao jogador
// deixava de descrever a batalha que ele jogou.
//
// As rotas que ABREM e que mandam comando já recusavam desde o M22; esta não, porque ela não
// recebe versão nenhuma do cliente — a versão que importa é a que está GRAVADA na partida.
// É a mesma família de defeito que fez `version.ts` existir: a checagem que faltava era
// justamente na rota que ninguém tinha olhado.
function buildHarnessComRepos() {
  const hero = heroiDoCapitulo();

  // A partida é aberta na versão de HOJE (é a única que a rota aceita) e lida como se tivesse
  // sido gravada em outra. O envelope faz isso na LEITURA em vez de escrever o campo, porque
  // `MatchRepository.update` não aceita `rulesVersion` — e não deve aceitar: em produção nada
  // altera a versão de uma partida já aberta. Quem muda é o servidor, por baixo dela.
  const real = createMemoryMatchRepository();
  let versaoGravada: string | null = null;
  const matchRepository: MatchRepository = {
    ...real,
    async get(nonce) {
      const match = await real.get(nonce);
      if (!match) return null;
      return versaoGravada === null ? match : { ...match, rulesVersion: versaoGravada };
    },
  };
  const gravarComoVersao = (rulesVersion: string) => {
    versaoGravada = rulesVersion;
  };
  const playerRepository = createMemoryPlayerRepository([
    {
      id: 'player-1',
      platformProvider: 'dev' as const,
      platformId: TOKEN,
      displayName: 'Herói',
      elo: 1200,
      arenaMarks: 0,
      ...DEFAULT_PVE_ACCOUNT,
      energy: { stored: catalog.economyRules.energy.max, asOfMs: AGORA },
    },
  ]);

  const app = buildApp({
    repository: playerRepository,
    heroRepository: createMemoryHeroRepository([{ ownerPlayerId: 'player-1', hero, equippedItems: [] }]),
    arenaDefenseRepository: createMemoryArenaDefenseRepository(),
    partyPresetRepository: createMemoryPartyPresetRepository(),
    replayRepository: createMemoryReplayRepository(),
    matchRepository,
    seasonRepository: createMemorySeasonRepository(),
    economyRepository: createMemoryEconomyRepository(),
    ownershipRepository: createMemoryCharacterOwnershipRepository(),
    rewardsRepository: createMemoryRewardsRepository(),
    catalog,
    shopCatalog: {},
    rateLimiter: createInMemoryRateLimiter({ maxRequests: 1000, windowMs: 60_000 }),
    ticketSecret: TICKET_SECRET,
    identityValidator: createDevIdentityValidator(),
    now: () => AGORA,
  });

  return { app, gravarComoVersao };
}

describe('o replay de uma partida ANTERIOR é recusado (M37)', () => {
  async function partidaGravadaEm(rulesVersion: string) {
    const { app, gravarComoVersao } = buildHarnessComRepos();
    const abertura = await post(app, `/campaign/${CAPITULO}/matches`, {
      heroIds: [heroiDoCapitulo().id],
      rulesVersion: RULES_VERSION,
    });
    expect(abertura.status).toBe(201);

    // A partida passa a ser lida como gravada em outra versão: é o que acontece de verdade
    // quando um deploy sobe o `RULES_VERSION` com partidas já no banco.
    gravarComoVersao(rulesVersion);

    const log = await app.inject({
      method: 'GET',
      url: `/battles/${abertura.body.nonce}/log`,
      headers: { 'x-platform-ticket': `dev:${TOKEN}` },
    });

    return { status: log.statusCode, body: log.json() as any };
  }

  it('`GET /battles/:nonce/log` recusa com 409 e corpo legível por máquina', async () => {
    const { status, body } = await partidaGravadaEm('0.19.0');

    expect(status).toBe(409);
    expect(body.code).toBe(RULES_VERSION_MISMATCH_CODE);
    expect(body.reason).toBe('different');
    expect(body.expected).toBe(RULES_VERSION);
    // A versão recebida é a da PARTIDA, e não algo que o cliente mandou: é isso que o
    // distingue das outras recusas por versão do projeto.
    expect(body.received).toBe('0.19.0');
  });

  it('a recusa não é sobre ser "velha", e sim sobre ser DIFERENTE — uma futura também cai', async () => {
    // Um banco restaurado de um servidor mais novo, ou um rollback de deploy. O motor deste
    // servidor não sabe reproduzir nenhuma das duas.
    const { status, body } = await partidaGravadaEm('99.0.0');

    expect(status).toBe(409);
    expect(body.code).toBe(RULES_VERSION_MISMATCH_CODE);
    expect(body.received).toBe('99.0.0');
  });

  it('a partida gravada NA versão de hoje continua sendo reproduzível', async () => {
    // A metade que impede a recusa de virar "nenhum replay abre".
    const { status, body } = await partidaGravadaEm(RULES_VERSION);

    expect(status).toBe(200);
    expect(body.rulesVersion).toBe(RULES_VERSION);
    expect(body.passos.length).toBeGreaterThan(0);
  });
});
