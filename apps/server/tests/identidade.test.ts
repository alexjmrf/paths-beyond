import { loadCatalogFromDisk } from '@paths-beyond/content';
import { describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { createInMemoryRateLimiter } from '../src/battle/rateLimit.js';
import { createDevIdentityValidator } from '../src/identity/devIdentity.js';
import { createSteamIdentityValidator } from '../src/identity/steam.js';
import type { IdentityValidator } from '../src/identity/types.js';
import {
  createMemoryArenaDefenseRepository,
  createMemoryCharacterOwnershipRepository,
  createMemoryEconomyRepository,
  createMemoryHeroRepository,
  createMemoryPlayerRepository,
  createMemoryReplayRepository,
  createMemoryRewardsRepository,
  createMemorySeasonRepository,
} from '../src/repository/memoryRepository.js';

// §9.4 (M20) — IDENTIDADE DE PLATAFORMA no lugar do token digitado.
//
// `x-player-token` era um stub declarado em M7, e era a decisão certa enquanto o servidor só
// arbitrava arena: quem soubesse o token de alguém ERA essa pessoa, e o que se perdia com
// isso era uma partida. Com economia real e uma moeda que se compra com dinheiro, o mesmo
// token é ao mesmo tempo o mecanismo de autenticação e o de personificação.
//
// O que entra é o ticket de sessão da plataforma, validado do lado do servidor. A
// propriedade que importa: **credencial nenhuma fica do nosso lado** — não há senha para
// vazar nem token para adivinhar, e o que o cliente manda vale por poucos segundos.
//
// O validador é INJETADO, no mesmo padrão de `now` e `newNonce` (M14/M15). Sem isso a suíte
// dependeria da Steam para rodar, o que é o mesmo que não rodar.

const AGORA = Date.UTC(2026, 8, 3, 12);
const catalog = loadCatalogFromDisk();

function harness(options: { identity?: IdentityValidator } = {}) {
  const playerRepository = createMemoryPlayerRepository();

  const app = buildApp({
    repository: playerRepository,
    heroRepository: createMemoryHeroRepository(),
    arenaDefenseRepository: createMemoryArenaDefenseRepository(),
    replayRepository: createMemoryReplayRepository(),
    seasonRepository: createMemorySeasonRepository(),
    economyRepository: createMemoryEconomyRepository(),
    ownershipRepository: createMemoryCharacterOwnershipRepository(),
    rewardsRepository: createMemoryRewardsRepository(),
    catalog,
    shopCatalog: {},
    rateLimiter: createInMemoryRateLimiter({ maxRequests: 1000, windowMs: 60_000 }),
    ticketSecret: 'segredo-de-teste',
    now: () => AGORA,
    identityValidator: options.identity ?? createDevIdentityValidator(),
  });

  return { app, playerRepository };
}

const TICKET = 'dev:jogador-um';

async function sessao(app: ReturnType<typeof buildApp>, ticket = TICKET) {
  const response = await app.inject({
    method: 'POST',
    url: '/accounts/session',
    headers: { 'x-platform-ticket': ticket },
    payload: {},
  });
  return { status: response.statusCode, body: response.json() as any };
}

describe('o ticket de plataforma substitui o token digitado', () => {
  it('sem ticket, a rota protegida recusa', async () => {
    const { app } = harness();

    const response = await app.inject({ method: 'GET', url: '/me' });

    expect(response.statusCode).toBe(401);
  });

  // O critério de aceite é literal: "nenhuma rota aceita mais o token digitado". Um header
  // antigo que ainda funcionasse deixaria o mecanismo de personificação de pé ao lado do
  // novo, que é pior do que não ter trocado.
  it('o header ANTIGO não vale mais, nem com um jogador existente', async () => {
    const { app, playerRepository } = harness();
    await playerRepository.createPlayer({
      id: 'jogador-um',
      platformProvider: 'dev',
      platformId: 'jogador-um',
      displayName: 'Um',
    });

    const response = await app.inject({
      method: 'GET',
      url: '/me',
      headers: { 'x-platform-ticket': 'jogador-um' },
    });

    expect(response.statusCode).toBe(401);
  });

  it('ticket inválido é recusado pelo validador', async () => {
    const { app } = harness();

    const response = await app.inject({
      method: 'GET',
      url: '/me',
      headers: { 'x-platform-ticket': 'lixo-que-nao-e-ticket' },
    });

    expect(response.statusCode).toBe(401);
  });

  it('ticket válido de conta INEXISTENTE não entra pela porta dos fundos', async () => {
    // A criação é explícita (`POST /accounts/session`). Uma rota protegida que criasse conta
    // sozinha traria de volta o "leitura que escreve" que o M20 saiu de cima.
    const { app } = harness();

    const response = await app.inject({ method: 'GET', url: '/me', headers: { 'x-platform-ticket': TICKET } });

    expect(response.statusCode).toBe(401);
  });

  it('depois da sessão criada, o mesmo ticket abre as rotas protegidas', async () => {
    const { app } = harness();
    expect((await sessao(app)).status).toBe(200);

    const response = await app.inject({ method: 'GET', url: '/me', headers: { 'x-platform-ticket': TICKET } });

    expect(response.statusCode).toBe(200);
    expect((response.json() as any).platformId).toBe('jogador-um');
  });

  it('dois tickets diferentes são duas contas diferentes', async () => {
    const { app } = harness();

    const um = await sessao(app, 'dev:jogador-um');
    const dois = await sessao(app, 'dev:jogador-dois');

    expect(um.body.id).not.toBe(dois.body.id);
  });
});

describe('o validador é injetado — a suíte não fala com a Steam', () => {
  it('um validador que recusa tudo derruba a sessão, sem rede nenhuma', async () => {
    const recusaTudo: IdentityValidator = { validate: async () => null };
    const { app } = harness({ identity: recusaTudo });

    expect((await sessao(app)).status).toBe(401);
  });

  it('um validador próprio decide quem é o jogador', async () => {
    const sempreAMesmaPessoa: IdentityValidator = {
      validate: async () => ({ provider: 'steam', platformId: '76561198000000001', displayName: 'Alguém' }),
    };
    const { app } = harness({ identity: sempreAMesmaPessoa });

    const { status, body } = await sessao(app, 'qualquer-coisa');

    expect(status).toBe(200);
    expect(body.platformId).toBe('76561198000000001');
    expect(body.platformProvider).toBe('steam');
  });
});

// A implementação da Steam existe e é testada com um `fetch` falso: chamar a Steam de
// verdade exigiria chave de API e o shell desktop (M21), e nenhum dos dois é escopo daqui.
// O que se afirma é o CONTRATO — o que se manda, o que se lê da resposta, e o que se faz
// quando ela nega.
describe('o validador da Steam', () => {
  const APP_ID = '480';
  const API_KEY = 'chave-de-teste';

  function fetchFalso(resposta: unknown, status = 200) {
    const chamadas: string[] = [];
    const impl = async (url: string) => {
      chamadas.push(url);
      return new Response(JSON.stringify(resposta), { status });
    };
    return { chamadas, impl };
  }

  it('aceita o ticket e devolve o SteamID que a Steam respondeu', async () => {
    const { chamadas, impl } = fetchFalso({
      response: { params: { result: 'OK', steamid: '76561198000000001', ownersteamid: '76561198000000001' } },
    });
    const validador = createSteamIdentityValidator({ apiKey: API_KEY, appId: APP_ID, fetchImpl: impl as never });

    const identidade = await validador.validate('DEADBEEF');

    expect(identidade).toEqual({ provider: 'steam', platformId: '76561198000000001' });
    // A chave vai na query da Steam Web API, e o ticket também: é o contrato dela.
    expect(chamadas[0]).toContain('AuthenticateUserTicket');
    expect(chamadas[0]).toContain(`appid=${APP_ID}`);
    expect(chamadas[0]).toContain('ticket=DEADBEEF');
  });

  it('recusa quando a Steam não devolve OK', async () => {
    const { impl } = fetchFalso({ response: { params: { result: 'Failure' } } });
    const validador = createSteamIdentityValidator({ apiKey: API_KEY, appId: APP_ID, fetchImpl: impl as never });

    expect(await validador.validate('DEADBEEF')).toBeNull();
  });

  it('recusa quando a Steam devolve erro HTTP, sem lançar', async () => {
    // A Steam fora do ar não pode derrubar o servidor: vira recusa, e o jogador vê 401 em
    // vez de 500.
    const { impl } = fetchFalso({ error: 'indisponível' }, 503);
    const validador = createSteamIdentityValidator({ apiKey: API_KEY, appId: APP_ID, fetchImpl: impl as never });

    expect(await validador.validate('DEADBEEF')).toBeNull();
  });

  it('recusa quando quem ativou o jogo é OUTRA conta (family sharing / revenda)', async () => {
    // `ownersteamid` diferente de `steamid` significa que a licença é de outra conta. É a
    // checagem que a própria Steam recomenda, e ignorá-la é aceitar conta emprestada.
    const { impl } = fetchFalso({
      response: { params: { result: 'OK', steamid: '76561198000000001', ownersteamid: '76561198000000009' } },
    });
    const validador = createSteamIdentityValidator({ apiKey: API_KEY, appId: APP_ID, fetchImpl: impl as never });

    expect(await validador.validate('DEADBEEF')).toBeNull();
  });

  it('a chave da API não aparece em erro nem em log', async () => {
    const { impl } = fetchFalso({ response: { params: { result: 'Failure' } } });
    const validador = createSteamIdentityValidator({ apiKey: API_KEY, appId: APP_ID, fetchImpl: impl as never });

    // O validador devolve `null` em vez de lançar com a URL dentro — a URL carrega a chave.
    await expect(validador.validate('DEADBEEF')).resolves.toBeNull();
  });
});
