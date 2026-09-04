import { loadCatalogFromDisk } from '@paths-beyond/content';
import { describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { createInMemoryRateLimiter, type RateLimiter } from '../src/battle/rateLimit.js';
import { createDevIdentityValidator } from '../src/identity/devIdentity.js';
import {
  createMemoryArenaDefenseRepository,
  createMemoryCharacterOwnershipRepository,
  createMemoryEconomyRepository,
  createMemoryHeroRepository,
  createMemoryIdempotencyRepository,
  createMemoryPlayerRepository,
  createMemoryReplayRepository,
  createMemoryRewardsRepository,
  createMemorySeasonRepository,
} from '../src/repository/memoryRepository.js';
import { DEFAULT_PVE_ACCOUNT } from '../src/repository/types.js';

// §9.4 (M22, sub-sessão 3/N) — a COBERTURA do limitador de requisições.
//
// **O buraco que esta fatia fecha.** `tryConsume` era chamado por seis rotas, e as seis eram
// de batalha: `POST /summon`, `POST /shop/purchase`, `POST /energy/purchase`,
// `POST /rewards/:id/claim` e as quatro de progressão não consumiam nada. Ou seja, as rotas
// que tocam a moeda comprável com dinheiro real eram justamente as abertas. O nonce não
// cobre isso — ele protege contra reenviar a MESMA requisição, não contra mandar mil
// DIFERENTES.
//
// **O teste que falha se uma rota nova esquecer**, que é o critério de aceite: ele não tem
// uma lista escrita à mão do que deveria consumir. Ele ENUMERA o que o servidor registrou e
// exige que toda rota que muda estado recuse com 429 quando a cota acaba. Uma rota nova que
// escape do limitador reprova aqui no dia em que for escrita.

const TOKEN = 'token-cobertura';
const AGORA = Date.UTC(2026, 5, 1);
const catalog = loadCatalogFromDisk();

function buildAppCom(rateLimiter: RateLimiter, expensiveRateLimiter?: RateLimiter) {
  return buildApp({
    ...(expensiveRateLimiter ? { expensiveRateLimiter } : {}),
    repository: createMemoryPlayerRepository([
      {
        id: 'player-1',
        platformProvider: 'dev' as const,
        platformId: TOKEN,
        displayName: 'Herói',
        elo: 1200,
        arenaMarks: 0,
        ...DEFAULT_PVE_ACCOUNT,
        premium: 5_000,
        energy: { stored: catalog.economyRules.energy.max, asOfMs: AGORA },
      },
    ]),
    heroRepository: createMemoryHeroRepository([]),
    arenaDefenseRepository: createMemoryArenaDefenseRepository(),
    replayRepository: createMemoryReplayRepository(),
    seasonRepository: createMemorySeasonRepository(),
    economyRepository: createMemoryEconomyRepository(),
    ownershipRepository: createMemoryCharacterOwnershipRepository(),
    rewardsRepository: createMemoryRewardsRepository(),
    idempotencyRepository: createMemoryIdempotencyRepository(),
    catalog,
    shopCatalog: {},
    rateLimiter,
    ticketSecret: 'segredo-de-teste',
    identityValidator: createDevIdentityValidator(),
    now: () => AGORA,
  });
}

// As rotas são registradas por `app.register`, que é DIFERIDO até `ready()`. Um hook
// `onRoute` adicionado depois de `buildApp` e antes de `ready()` vê todas elas — é assim que
// o teste enumera sem o servidor precisar expor nada só para ser testado.
async function rotasRegistradas(app: ReturnType<typeof buildApp>) {
  const rotas: { method: string; url: string }[] = [];
  app.addHook('onRoute', (rota) => {
    const metodos = Array.isArray(rota.method) ? rota.method : [rota.method];
    for (const metodo of metodos) rotas.push({ method: metodo, url: rota.url });
  });
  await app.ready();
  return rotas;
}

const METODOS_QUE_MUDAM = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

// A única rota fora do escopo protegido, e por construção: é ela que faz a conta existir, e
// não há jogador de quem cobrar cota antes de a conta existir. Declarada aqui para que
// EXCLUIR uma rota do limitador seja uma decisão escrita, e não um esquecimento.
const FORA_DO_LIMITADOR = new Set(['POST /accounts/session']);

// Um valor de parâmetro qualquer: o que se mede é a recusa por cota, que acontece antes de
// a rota olhar o parâmetro.
function comParametros(url: string): string {
  return url.replace(/:[^/]+/g, 'x');
}

describe('a cobertura do limitador', () => {
  it('TODA rota que muda estado recusa quando a cota acaba', async () => {
    // Um limitador que nunca deixa passar: o que se quer saber é quais rotas sequer
    // perguntam a ele.
    const app = buildAppCom({ tryConsume: () => false });
    const rotas = await rotasRegistradas(app);

    const mutantes = rotas.filter(
      (r) => METODOS_QUE_MUDAM.has(r.method) && !FORA_DO_LIMITADOR.has(`${r.method} ${r.url}`),
    );
    expect(mutantes.length).toBeGreaterThan(10);

    const escaparam: string[] = [];
    for (const rota of mutantes) {
      // Um app NOVO por rota, e não um compartilhado: `DELETE /me` apaga a conta, e a partir
      // dele todas as outras responderiam 401 — o teste passaria a medir a ausência do
      // jogador em vez da cobertura do limitador. Descoberto rodando.
      const isolado = buildAppCom({ tryConsume: () => false });
      const resposta = await isolado.inject({
        method: rota.method as 'POST',
        url: comParametros(rota.url),
        headers: { 'x-platform-ticket': `dev:${TOKEN}` },
        payload: {},
      });
      if (resposta.statusCode !== 429) escaparam.push(`${rota.method} ${rota.url} → ${resposta.statusCode}`);
    }

    expect(escaparam, 'rotas que mudam estado sem consumir cota').toEqual([]);
  });

  it('as rotas que gastam a moeda comprável estão entre elas — eram as descobertas', async () => {
    // Nomeadas de propósito: o buraco do roadmap era exatamente este conjunto, e um teste
    // que só conta rotas não mostraria que ELAS foram fechadas.
    const app = buildAppCom({ tryConsume: () => false });
    const rotas = (await rotasRegistradas(app)).map((r) => `${r.method} ${r.url}`);

    for (const rota of [
      'POST /summon',
      'POST /shop/purchase',
      'POST /energy/purchase',
      'POST /rewards/:id/claim',
      'POST /items/:itemId/enhance',
      'POST /heroes/:heroId/awaken',
      'POST /heroes/:heroId/imprint',
      'POST /heroes/:heroId/equip',
    ]) {
      expect(rotas, rota).toContain(rota);
    }
  });

  it('LEITURA não consome cota — a tela do jogador não pode ficar refém do limite', async () => {
    const app = buildAppCom({ tryConsume: () => false });
    await app.ready();

    const resposta = await app.inject({
      method: 'GET',
      url: '/me/economy',
      headers: { 'x-platform-ticket': `dev:${TOKEN}` },
    });

    expect(resposta.statusCode).toBe(200);
  });

  it('a cota é POR JOGADOR — um jogador não derruba o outro', async () => {
    // Chave por conta e não por endereço: vários jogadores atrás do mesmo provedor
    // compartilhariam o limite, e um deles bastaria para tirar os outros do ar.
    const consumidos: string[] = [];
    const app = buildAppCom({
      tryConsume: (key) => {
        consumidos.push(key);
        return true;
      },
    });
    await app.ready();

    await app.inject({
      method: 'POST',
      url: '/summon',
      headers: { 'x-platform-ticket': `dev:${TOKEN}` },
      payload: {},
    });

    // A chave leva o nome do balde: as duas contagens dividem a mesma tabela na
    // implementação compartilhada, e sem o prefixo a cota de compra e a de jogo se
    // misturariam.
    expect(consumidos).toEqual(['padrao:player-1']);
  });

  it('o reenvio de quem caiu não consome cota — ele é respondido do armazém', async () => {
    // O hook de idempotência (2/N) roda ANTES do limitador. Cobrar cota de uma requisição
    // que já foi resolvida seria punir o jogador pela queda da internet dele.
    const consumidos: string[] = [];
    const limitador = createInMemoryRateLimiter({ maxRequests: 1000, windowMs: 60_000 });
    const app = buildAppCom({
      tryConsume: (key) => {
        consumidos.push(key);
        return limitador.tryConsume(key) as boolean;
      },
    });
    await app.ready();

    const corpo = { nonce: 'nonce-cobertura', bannerId: Object.values(catalog.banners)[0]!.id, count: 1 };
    const primeira = await app.inject({
      method: 'POST',
      url: '/summon',
      headers: { 'x-platform-ticket': `dev:${TOKEN}` },
      payload: corpo,
    });
    const consumosDepoisDaPrimeira = consumidos.length;

    const reenvio = await app.inject({
      method: 'POST',
      url: '/summon',
      headers: { 'x-platform-ticket': `dev:${TOKEN}` },
      payload: corpo,
    });

    expect(primeira.statusCode).toBe(200);
    expect(reenvio.statusCode).toBe(200);
    expect(consumidos.length).toBe(consumosDepoisDaPrimeira);
  });
});

// Auditoria do M22 (2026-09-04) — o defeito que a própria 3/N criou, e o conserto.
//
// Cobrir toda rota que muda estado com o balde único de produção (10 por minuto, calibrado
// quando só seis rotas de BATALHA consumiam) fazia a preparação caber no mesmo teto: editar
// o script tático de cinco heróis é um `PUT` por salvamento, e o jogador levaria 429 jogando
// normalmente. Aumentar o número global consertaria isso afrouxando justamente as rotas que
// a milestone existia para fechar — então são dois baldes.
describe('os dois baldes', () => {
  it('a preparação NÃO gasta a cota das rotas que compram', async () => {
    const consumidos: string[] = [];
    const espiao = (nome: string) => ({
      tryConsume: (key: string) => {
        consumidos.push(`${nome}:${key}`);
        return true;
      },
    });
    const app = buildAppCom(espiao('padrao'), espiao('caro'));
    await app.ready();

    await app.inject({
      method: 'PUT',
      url: '/heroes/h1/tactics',
      headers: { 'x-platform-ticket': `dev:${TOKEN}` },
      payload: {},
    });

    expect(consumidos).toEqual(['padrao:padrao:player-1']);
  });

  it('as três rotas que gastam dinheiro real caem no balde ESTREITO', async () => {
    const consumidos: string[] = [];
    const espiao = (nome: string) => ({
      tryConsume: (key: string) => {
        consumidos.push(`${nome}:${key}`);
        return true;
      },
    });
    const app = buildAppCom(espiao('padrao'), espiao('caro'));
    await app.ready();

    for (const url of ['/summon', '/shop/purchase', '/energy/purchase']) {
      await app.inject({
        method: 'POST',
        url,
        headers: { 'x-platform-ticket': `dev:${TOKEN}` },
        payload: {},
      });
    }

    expect(consumidos).toEqual([
      'caro:caro:player-1',
      'caro:caro:player-1',
      'caro:caro:player-1',
    ]);
  });

  it('esgotar o balde caro não impede de continuar jogando', async () => {
    // O ponto inteiro da separação: quem gastou a cota de invocação ainda pode salvar
    // tática, equipar e entrar em batalha.
    const app = buildAppCom({ tryConsume: () => true }, { tryConsume: () => false });
    await app.ready();

    const invocacao = await app.inject({
      method: 'POST',
      url: '/summon',
      headers: { 'x-platform-ticket': `dev:${TOKEN}` },
      payload: {},
    });
    const preparacao = await app.inject({
      method: 'PUT',
      url: '/heroes/h1/tactics',
      headers: { 'x-platform-ticket': `dev:${TOKEN}` },
      payload: {},
    });

    expect(invocacao.statusCode).toBe(429);
    expect(preparacao.statusCode).not.toBe(429);
  });

  it('sem balde caro declarado, tudo cai no mesmo — o comportamento de quem monta sem política', async () => {
    const consumidos: string[] = [];
    const app = buildAppCom({
      tryConsume: (key: string) => {
        consumidos.push(key);
        return true;
      },
    });
    await app.ready();

    await app.inject({
      method: 'POST',
      url: '/summon',
      headers: { 'x-platform-ticket': `dev:${TOKEN}` },
      payload: {},
    });

    expect(consumidos).toEqual(['padrao:player-1']);
  });
});
