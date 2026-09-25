import { loadCatalogFromDisk } from '@paths-beyond/content';
import { describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { CAMPOS_VISIVEIS_DO_INIMIGO } from '../src/battle/visao.js';
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
} from '../src/repository/memoryRepository.js';
import { ordemDeAparicao } from '../src/campaign/routes.js';

// M36 3/N (D47/D48) — a PRÉVIA da missão e a ORDEM DO ELENCO, do lado do servidor.
//
// **Por que este arquivo existe aqui e não em `apps/client`.** As duas coisas eram derivadas no
// CLIENTE, a partir de `packages/data/encounters/*.json` empacotado junto com o jogo (M35 2/N).
// Esses arquivos descrevem, com nome e número, todo inimigo de PvE — e depois de D47 distribuí-
// los no instalador é o mesmo teatro que o teorema usou para proibir a simulação no cliente. O
// catálogo foi partido, e com ele as duas derivações mudaram de lado.
//
// As asserções são as mesmas dos testes que existiam em `apps/client/tests/previaDaMissao.test.ts`
// e `quemVai.test.ts`, contra o caminho novo — menos a ZONA DE AMEAÇA, que não foi movida: ela
// saiu do jogo por D47, porque deriva de `moveType`, `moveRange` e `duelRange` do inimigo, que é
// exatamente o que passou a ser desconhecido.

const catalog = loadCatalogFromDisk();
const MISSAO = 'encounter-campanha-ponte-1';

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
    catalog,
    shopCatalog: {},
    rateLimiter: createInMemoryRateLimiter({ maxRequests: 1000, windowMs: 60_000 }),
    ticketSecret: 'segredo-da-previa',
    identityValidator: createDevIdentityValidator(),
    now: () => Date.UTC(2026, 8, 1),
  });
}

type App = ReturnType<typeof buildApp>;

async function comConta(app: App, identidade = 'olheiro') {
  const headers = { 'x-platform-ticket': `dev:${identidade}` };
  const sessao = await app.inject({ method: 'POST', url: '/accounts/session', headers });
  expect(sessao.statusCode).toBe(200);
  return {
    async get(url: string) {
      const r = await app.inject({ method: 'GET', url, headers });
      return { status: r.statusCode, body: r.json() as Record<string, unknown> };
    },
  };
}

describe('GET /campaign/:id/previa — olhar não é entrar', () => {
  it('exige sessão', async () => {
    const r = await servidor().inject({ method: 'GET', url: `/campaign/${MISSAO}/previa` });
    expect(r.statusCode).toBe(401);
  });

  it('missão desconhecida é 404 — a tela desenha "escolha uma missão"', async () => {
    const eu = await comConta(servidor());
    expect((await eu.get('/campaign/encounter-que-nao-existe/previa')).status).toBe(404);
  });

  it('não abre partida nenhuma: olhar é de graça e não consome a batalha em andamento', async () => {
    // Era a primeira asserção da versão do cliente ("não faz requisição nenhuma"), traduzida
    // para o que ela protegia de verdade: a prévia não pode custar nem comprometer nada.
    const app = servidor();
    const eu = await comConta(app);

    await eu.get(`/campaign/${MISSAO}/previa`);
    await eu.get(`/campaign/${MISSAO}/previa`);

    expect((await eu.get('/matches/current')).status).toBe(404);
  });

  it('missão 1: o mapa da missão, um inimigo, uma vaga onde o encounter a declara', async () => {
    const eu = await comConta(servidor());
    const { status, body } = await eu.get(`/campaign/${MISSAO}/previa`);
    expect(status).toBe(200);

    const encounter = catalog.encounters.find((e) => e.id === MISSAO)!;
    const mapa = catalog.maps[encounter.mapId]!;
    const map = body.map as { width: number; height: number };
    const unidades = body.unidades as readonly { unitId: string; side: string }[];

    expect(map.width).toBe(mapa.grid.width);
    expect(map.height).toBe(mapa.grid.height);

    // As vagas NÃO são unidades (ninguém foi escolhido ainda); vêm à parte, na posição
    // autorada, para o tabuleiro marcá-las.
    expect(unidades.every((u) => u.side !== 'player')).toBe(true);
    expect(body.vagas).toEqual(encounter.units.filter((u) => u.side === 'player').map((u) => u.pos));
    expect(body.vagas).toHaveLength(1);

    // O inimigo, com o id de `enemies/` para a tela dar o nome e a arte (D48) — o mesmo mapa
    // que a abertura da partida traz.
    const inimigos = unidades.filter((u) => u.side === 'enemy');
    expect(inimigos).toHaveLength(1);
    const autorado = encounter.units.find((u) => u.side === 'enemy')!;
    expect((body.characterIdByUnitId as Record<string, string>)[inimigos[0]!.unitId]).toBe(
      (autorado as { enemyId: string }).enemyId,
    );
  });

  it('o inimigo da prévia é REDIGIDO: mesma lista de campos da batalha, e nada além dela', async () => {
    // Sem isto a prévia seria a porta dos fundos: o mesmo dado que a batalha esconde, servido
    // antes de a batalha começar.
    const eu = await comConta(servidor());
    const { body } = await eu.get(`/campaign/${MISSAO}/previa`);

    const inimigos = (body.unidades as readonly Record<string, unknown>[]).filter((u) => u.side === 'enemy');
    expect(inimigos.length).toBeGreaterThan(0);
    for (const inimigo of inimigos) {
      expect(Object.keys(inimigo).sort()).toEqual([...CAMPOS_VISIVEIS_DO_INIMIGO].sort());
    }
  });

  it('as peças estão onde o conteúdo as pôs — a prévia não roda o turno de IA da abertura', async () => {
    // A versão do cliente montava o estado com `buildInitialState`, que DRENA o turno de IA que
    // antecede o primeiro comando: a prévia mostrava as peças já movidas. Ninguém tinha notado
    // porque a seed era fixa e o desenho parecia plausível.
    const eu = await comConta(servidor());
    const { body } = await eu.get(`/campaign/${MISSAO}/previa`);

    const encounter = catalog.encounters.find((e) => e.id === MISSAO)!;
    const unidades = body.unidades as readonly { unitId: string; pos: { x: number; y: number } }[];
    for (const autorada of encounter.units.filter((u) => u.side !== 'player')) {
      const naPrevia = unidades.find((u) => u.unitId === autorada.unitId);
      expect(naPrevia?.pos, autorada.unitId).toEqual(autorada.pos);
    }
  });

  it('toda missão da demo tem prévia, com as vagas e a condição de vitória do conteúdo', async () => {
    const eu = await comConta(servidor());

    for (const encounter of catalog.encounters) {
      const { status, body } = await eu.get(`/campaign/${encounter.id}/previa`);
      expect(status, encounter.id).toBe(200);
      expect((body.vagas as readonly unknown[]).length, encounter.id).toBe(
        encounter.units.filter((u) => u.side === 'player').length,
      );
      // §5.7 — a condição do encounter sobrepõe a do layout quando declarada.
      expect(body.winCondition, encounter.id).toEqual(
        encounter.winCondition ?? catalog.maps[encounter.mapId]!.winCondition,
      );
    }
  });
});

// M35 2/N (D42), movido para cá em M36 3/N — a ordem em que a campanha APRESENTA o elenco.
// A regra não mudou; o que mudou é de que lado ela é derivada, porque `encounters` saiu do
// bundle do cliente. Continua sendo APRESENTAÇÃO (quem vem pré-marcado), não regra.
describe('ordemDeAparicao — derivada da campanha autorada', () => {
  const ordem = ordemDeAparicao(catalog);

  it('o protagonista é o primeiro, e os quatro do núcleo de história (D14) vêm na ordem dos capítulos', () => {
    expect(ordem[0]).toBe('hero-jogador');
    const nucleo = ordem.filter((id) => ['hero-jogador', 'ally-clerigo', 'ally-arqueiro', 'ally-arcanista'].includes(id));
    expect(nucleo).toEqual(['hero-jogador', 'ally-clerigo', 'ally-arqueiro', 'ally-arcanista']);
  });

  it('cobre todo personagem que aparece como vaga na campanha, sem repetir', () => {
    expect(new Set(ordem).size).toBe(ordem.length);
    for (const id of ordem) expect(catalog.characters[id], id).toBeDefined();
  });

  it('e chega ao cliente em `GET /campaign`, que é a única porta dele para ela', async () => {
    const eu = await comConta(servidor());
    const { body } = await eu.get('/campaign');
    expect(body.castOrder).toEqual(ordem);
  });
});
