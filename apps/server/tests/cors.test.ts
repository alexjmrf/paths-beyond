import { loadCatalogFromDisk } from '@paths-beyond/content';
import { describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { createInMemoryRateLimiter } from '../src/battle/rateLimit.js';
import { createDevIdentityValidator } from '../src/identity/devIdentity.js';
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

// §9.4 (M28, 2/N) — CORS, e por que ele só apareceu agora.
//
// **O bug que só existe na máquina do jogador.** No laço de desenvolvimento o Vite faz proxy
// de `/api`: cliente e servidor são a mesma origem e o navegador nunca pergunta nada.
// Empacotado, o renderer carrega por `file://` — origem `null` para o Chromium — e o
// servidor está em `https://…railway.app`. O cliente manda `x-platform-ticket`, um header
// customizado, e isso obriga o navegador a um PREFLIGHT (`OPTIONS`) antes do `POST`. Sem
// resposta com `Access-Control-*`, o navegador bloqueia e o `fetch` reporta "Failed to
// fetch" — sem nunca ter chegado à rota. O critério 3 do M28 é a primeira vez que o cliente
// empacotado fala com um servidor remoto, e foi a primeira vez que isto foi visto.
//
// **A política é estreita de propósito.** A autenticação é por header e não por cookie, então
// CORS aqui não protege contra CSRF — o que ele decide é QUEM o navegador deixa falar com
// este servidor. Aceita-se: requisição sem `Origin` (curl, servidor a servidor, a própria
// suíte) e `Origin: null` (o Electron por `file://`). Qualquer outra origem é recusada, e
// `credentials` nunca é permitido.

const catalog = loadCatalogFromDisk();

function montarApp() {
  return buildApp({
    repository: createMemoryPlayerRepository([]),
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
    identityValidator: createDevIdentityValidator(),
  });
}

describe('CORS — o cliente empacotado (origem `null`) fala com o servidor remoto', () => {
  it('o PREFLIGHT do sign-in responde 204 com os cabeçalhos que o navegador exige', async () => {
    // Exatamente o que o Chromium manda antes de `POST /accounts/session` com
    // `x-platform-ticket` a partir de `file://`.
    const app = montarApp();

    const r = await app.inject({
      method: 'OPTIONS',
      url: '/accounts/session',
      headers: {
        origin: 'null',
        'access-control-request-method': 'POST',
        'access-control-request-headers': 'content-type, x-platform-ticket',
      },
    });

    expect(r.statusCode).toBe(204);
    expect(r.headers['access-control-allow-origin']).toBe('null');
    expect(String(r.headers['access-control-allow-methods'])).toContain('POST');
    expect(String(r.headers['access-control-allow-headers']).toLowerCase()).toContain('x-platform-ticket');
    expect(String(r.headers['access-control-allow-headers']).toLowerCase()).toContain('content-type');
  });

  it('o preflight de rota PROTEGIDA também responde 204 — o auth não pode 401 o OPTIONS antes do CORS', async () => {
    // `/me` é a chamada seguinte ao sign-in. O preflight não carrega o ticket (o navegador
    // não manda headers customizados no OPTIONS); se o hook de auth rodasse antes do CORS,
    // responderia 401 e o navegador bloquearia a chamada real.
    const app = montarApp();

    const r = await app.inject({
      method: 'OPTIONS',
      url: '/me',
      headers: {
        origin: 'null',
        'access-control-request-method': 'GET',
        'access-control-request-headers': 'x-platform-ticket',
      },
    });

    expect(r.statusCode).toBe(204);
    expect(r.headers['access-control-allow-origin']).toBe('null');
  });

  it('a resposta REAL também carrega `Allow-Origin` — sem ele o navegador descarta o corpo', async () => {
    const app = montarApp();

    const r = await app.inject({
      method: 'POST',
      url: '/accounts/session',
      headers: { origin: 'null', 'content-type': 'application/json', 'x-platform-ticket': 'dev:cors-teste' },
      payload: {},
    });

    expect(r.statusCode).toBeLessThan(500);
    expect(r.headers['access-control-allow-origin']).toBe('null');
  });

  it('sem `Origin` nada muda — curl, servidor a servidor e a própria suíte continuam iguais', async () => {
    const app = montarApp();

    const r = await app.inject({ method: 'GET', url: '/health' });

    expect(r.statusCode).toBe(200);
    expect(r.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('outra origem é RECUSADA — uma página qualquer na web não fala com este servidor', async () => {
    const app = montarApp();

    const r = await app.inject({
      method: 'OPTIONS',
      url: '/accounts/session',
      headers: {
        origin: 'https://outro.example',
        'access-control-request-method': 'POST',
        'access-control-request-headers': 'x-platform-ticket',
      },
    });

    expect(r.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('`credentials` nunca é permitido — a autenticação é por header, não por cookie', async () => {
    const app = montarApp();

    const r = await app.inject({
      method: 'OPTIONS',
      url: '/accounts/session',
      headers: { origin: 'null', 'access-control-request-method': 'POST' },
    });

    expect(r.headers['access-control-allow-credentials']).toBeUndefined();
  });
});
