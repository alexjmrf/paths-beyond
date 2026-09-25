import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
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
  createMemoryMatchRepository,
  createMemoryPartyPresetRepository,
  createMemoryPlayerRepository,
  createMemoryReplayRepository,
  createMemoryRewardsRepository,
  createMemorySeasonRepository,
  createMemoryTelemetryRepository,
} from '../src/repository/memoryRepository.js';

// M36 4/N — TODA ROTA QUE O CLIENTE CHAMA EXISTE NO SERVIDOR, conferido sem subir nada.
//
// **Por que este arquivo existe.** Esta milestone trocou o transporte inteiro da batalha: seis
// rotas foram aposentadas e sete nasceram, e o cliente foi reescrito em cima delas. Os dois
// lados têm suítes verdes e nenhuma delas fala com a outra — o cliente testa contra `fetch`
// mockado, o servidor testa com `inject`. Uma rota renomeada de um lado e não do outro passa
// pelas duas e só aparece com o jogo na mão.
//
// É a mesma família de `ambiente.test.ts` (o compose conferido contra o código) e de
// `migrations.test.ts` (o SQL conferido contra o TypeScript): ler a configuração — aqui, o
// código do cliente — como DADO, e afirmar o que o outro lado exige dela.
//
// **E ele deriva.** Nenhuma lista de rotas escrita à mão: os caminhos saem de
// `apps/client/src/data/api.ts` por varredura, e as rotas do servidor saem do Fastify por
// `onRoute`. Uma rota nova no cliente entra na conferência sozinha.

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const API_DO_CLIENTE = readFileSync(join(RAIZ, 'apps', 'client', 'src', 'data', 'api.ts'), 'utf8');

const catalog = loadCatalogFromDisk();

function servidor() {
  return buildApp({
    repository: createMemoryPlayerRepository([]),
    heroRepository: createMemoryHeroRepository([]),
    arenaDefenseRepository: createMemoryArenaDefenseRepository(),
    partyPresetRepository: createMemoryPartyPresetRepository(),
    replayRepository: createMemoryReplayRepository(),
    matchRepository: createMemoryMatchRepository(),
    seasonRepository: createMemorySeasonRepository(),
    economyRepository: createMemoryEconomyRepository(),
    ownershipRepository: createMemoryCharacterOwnershipRepository(),
    rewardsRepository: createMemoryRewardsRepository(),
    // A telemetria é OPCIONAL em `buildApp` (M34 1/N): sem ela `/me/telemetry` não é
    // registrada. O cliente a chama, então o servidor deste teste é o COMPLETO — que é também
    // o de produção.
    telemetryRepository: createMemoryTelemetryRepository(),
    catalog,
    shopCatalog: {},
    rateLimiter: createInMemoryRateLimiter({ maxRequests: 100, windowMs: 60_000 }),
    ticketSecret: 'segredo-do-contrato',
    identityValidator: createDevIdentityValidator(),
  });
}

async function rotasDoServidor(): Promise<readonly string[]> {
  const app = servidor();
  const rotas: string[] = [];
  app.addHook('onRoute', (rota) => {
    const metodos = Array.isArray(rota.method) ? rota.method : [rota.method];
    for (const metodo of metodos) rotas.push(`${metodo} ${rota.url}`);
  });
  await app.ready();
  return rotas;
}

/**
 * Os caminhos que o cliente pede, extraídos de `request<...>(ticket, '<caminho>', ...)`.
 *
 * O método sai do corpo da chamada (`method: 'POST'`), com `GET` por omissão — é a mesma
 * convenção de `fetch`, e é o que `api.ts` usa.
 */
function chamadasDoCliente(): readonly string[] {
  const chamadas: string[] = [];
  const marcador = /request<[^>]*>\(/g;

  for (const inicio of API_DO_CLIENTE.matchAll(marcador)) {
    // Varre até o parêntese que fecha ESTA chamada, contando os de dentro: o corpo tem
    // `JSON.stringify(...)`, e um `[^)]*` pararia nele.
    let profundidade = 1;
    let i = inicio.index! + inicio[0].length;
    while (i < API_DO_CLIENTE.length && profundidade > 0) {
      const c = API_DO_CLIENTE[i]!;
      if (c === '(') profundidade += 1;
      else if (c === ')') profundidade -= 1;
      i += 1;
    }
    const corpo = API_DO_CLIENTE.slice(inicio.index! + inicio[0].length, i - 1);

    // O caminho é o PRIMEIRO literal de string depois do argumento do ticket.
    const caminho = /,\s*[`']([^`']+)[`']/.exec(corpo)?.[1];
    if (!caminho) continue;
    const metodo = /method:\s*'(\w+)'/.exec(corpo)?.[1] ?? 'GET';
    chamadas.push(`${metodo} ${caminho}`);
  }

  return chamadas;
}

/** `/campaign/${missionId}/previa` → casa com `/campaign/:id/previa` do Fastify. */
function existeNoServidor(rotas: readonly string[], chamada: string): boolean {
  const [metodo, caminho] = chamada.split(' ') as [string, string];
  // Os dois lados viram a mesma forma: cada segmento variável é `X`.
  const doCliente = caminho.replace(/\$\{[^}]*\}/g, 'X');
  return rotas.some((rota) => {
    const [m, u] = rota.split(' ') as [string, string];
    return m === metodo && u.replace(/:[^/]+/g, 'X') === doCliente;
  });
}

describe('o contrato entre o cliente e o servidor', () => {
  it('a varredura acha as chamadas do cliente — a conferência não passa por não ter olhado nada', () => {
    const chamadas = chamadasDoCliente();
    expect(chamadas.length).toBeGreaterThan(20);
    // E as da batalha viva estão entre elas: são as sete que esta milestone criou.
    expect(chamadas).toContain('POST /matches/${nonce}/commands');
    expect(chamadas).toContain('GET /matches/current');
  });

  it('toda rota que o cliente chama existe no servidor', async () => {
    const rotas = await rotasDoServidor();
    const orfas = chamadasDoCliente().filter((chamada) => !existeNoServidor(rotas, chamada));

    expect(orfas, 'o cliente chama rota que o servidor não registra').toEqual([]);
  });

  it('e o cliente NÃO chama nenhuma das rotas aposentadas nesta milestone', async () => {
    // `ticket → joga tudo → run` morreu na 2/N. Se uma delas voltar ao cliente, ela vai bater
    // num 404 em produção — e um teste que só conferisse "existe no servidor" ficaria calado,
    // porque elas não existem mais nem lá.
    const aposentadas = [
      '/battles/ticket',
      '/campaign/${missionId}/ticket',
      '/campaign/${chapterId}/ticket',
      '/campaign/${chapterId}/run',
      '/dungeons/${dungeonId}/ticket',
    ];
    for (const rota of aposentadas) {
      expect(API_DO_CLIENTE.includes(rota), `o cliente voltou a chamar ${rota}`).toBe(false);
    }

    // E a submissão de arena: `POST /battles` sem sufixo. A busca é pelo literal exato para não
    // pegar `GET /battles/${nonce}`, que continua existindo (o replay).
    expect(API_DO_CLIENTE.includes("'/battles'")).toBe(false);
  });
});
