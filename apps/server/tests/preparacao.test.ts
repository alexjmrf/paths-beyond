import { loadCatalogFromDisk } from '@paths-beyond/content';
import { describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { createDevIdentityValidator } from '../src/identity/devIdentity.js';
import { createInMemoryRateLimiter } from '../src/battle/rateLimit.js';
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
import { DEFAULT_PVE_ACCOUNT } from '../src/repository/types.js';

// §6.3/§8.2 (M18, sub-sessão 7/N) — as duas rotas de PREPARAÇÃO que faltavam.
//
// Elas existem porque a campanha do cliente vai para o servidor: até aqui o editor de
// táticas (M6/M13) e a árvore de talentos (M17 4/N) editavam a party LOCAL e remontavam o
// mapa, e nada disso chegava ao banco. Com a campanha passando pelo ticket, o servidor
// reconstrói a batalha a partir do que ele tem — então uma edição que não chega nele não
// só se perde: faz o `run` reexecutar uma batalha DIFERENTE da que foi jogada, que é a
// divergência que §9.1 chama de bug crítico.
//
// As duas rotas não decidem nada (regra 3): quem valida é `packages/core`
// (`validateTacticsScript` e `validateColumnAllocation`). Aqui há autorização, persistência
// e a tradução do "não" do core para um 400.

const TICKET_SECRET = 'segredo-de-teste';
const TOKEN = 'token-preparacao';
const OUTRO_TOKEN = 'token-alheio';
const AGORA = Date.UTC(2024, 0, 5, 12);

const catalog = loadCatalogFromDisk();

// Aren: a única árvore do elenco que concede DOIS `extraTacticsSlot`, e por isso o único
// personagem que alcança as 6 linhas de §6.3. É o que torna o teto móvel observável.
const PERSONAGEM = 'hero-jogador';
const HERO_ID = 'heroi-de-teste';
const ARVORE = catalog.characterTalentTrees[PERSONAGEM]!;
const FICHA = catalog.characters[PERSONAGEM]!.startingHero;

function heroiDeTeste(overrides: Record<string, unknown> = {}) {
  return {
    id: HERO_ID,
    characterId: PERSONAGEM,
    classId: catalog.characters[PERSONAGEM]!.classId,
    level: FICHA.level,
    exp: 0,
    awakening: 0 as const,
    imprint: 0 as const,
    talents: {},
    equipment: { ...FICHA.equipment },
    weaponType: FICHA.weaponType,
    duelSkills: [...FICHA.duelSkills],
    mapSkills: [...FICHA.mapSkills],
    tacticsScript: [...FICHA.tacticsScript],
    ...overrides,
  };
}

function buildHarness() {
  const heroRepository = createMemoryHeroRepository([
    { ownerPlayerId: 'player-1', hero: heroiDeTeste() as never, equippedItems: [] },
    { ownerPlayerId: 'player-2', hero: { ...heroiDeTeste(), id: 'heroi-alheio' } as never, equippedItems: [] },
  ]);
  const playerRepository = createMemoryPlayerRepository([
    {
      id: 'player-1',
      platformProvider: 'dev' as const,
      platformId: TOKEN,
      displayName: 'Preparação',
      elo: 1200,
      arenaMarks: 0,
      ...DEFAULT_PVE_ACCOUNT,
      energy: { stored: catalog.economyRules.energy.max, asOfMs: AGORA },
    },
    {
      id: 'player-2',
      platformProvider: 'dev' as const,
      platformId: OUTRO_TOKEN,
      displayName: 'Outro',
      elo: 1200,
      arenaMarks: 0,
      ...DEFAULT_PVE_ACCOUNT,
      energy: { stored: catalog.economyRules.energy.max, asOfMs: AGORA },
    },
  ]);

  return {
    heroRepository,
    app: buildApp({
      repository: playerRepository,
      heroRepository,
      arenaDefenseRepository: createMemoryArenaDefenseRepository(),
      replayRepository: createMemoryReplayRepository(),
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
    }),
  };
}

async function put(h: ReturnType<typeof buildHarness>, url: string, payload: Record<string, unknown>, token = TOKEN) {
  const response = await h.app.inject({ method: 'PUT', url, headers: { 'x-platform-ticket': `dev:${token}`}, payload });
  return { status: response.statusCode, body: response.json() as any };
}

const ATAQUE = FICHA.duelSkills[0]!;
const ESPECIAL = FICHA.duelSkills[1]!;

function linha(skillId: string, conditions = 0) {
  return {
    enabled: true,
    skillId,
    conditions: Array.from({ length: conditions }, (_u, i) => ({ t: 'selfHpBelow', pct: 100 * (i + 1) })),
  };
}

// Um caminho legal descendo a coluna A da árvore do Aren, linha a linha — a mesma forma
// que `packages/content/tests/elenco.test.ts` usa para provar que o orçamento é gastável.
function caminhoLegal(pontos: number): Record<string, number> {
  const alocacao: Record<string, number> = {};
  const coluna = [...ARVORE.nodes].filter((n) => n.column === 'a').sort((a, b) => a.row - b.row);
  for (const node of coluna.slice(0, pontos)) alocacao[node.id] = 1;
  return alocacao;
}

// O nó que concede `extraTacticsSlot`, e o caminho que chega até ele. Sem descer a coluna
// inteira a alocação seria ilegal por amarração, e o teste mediria a coisa errada.
function caminhoAteSlotExtra(): Record<string, number> {
  const comSlot = ARVORE.nodes.find((n) => n.effects.some((e) => e.t === 'extraTacticsSlot') && n.column !== 'middle');
  if (!comSlot) return {};
  const coluna = [...ARVORE.nodes].filter((n) => n.column === comSlot.column).sort((a, b) => a.row - b.row);
  const alocacao: Record<string, number> = {};
  for (const node of coluna) {
    alocacao[node.id] = 1;
    if (node.id === comSlot.id) break;
  }
  return alocacao;
}

describe('PUT /heroes/:heroId/talents (§8.2)', () => {
  it('persiste uma alocação legal, e o herói volta com ela', async () => {
    const h = buildHarness();
    const alocacao = caminhoLegal(3);

    const { status, body } = await put(h, `/heroes/${HERO_ID}/talents`, { talents: alocacao });

    expect(status).toBe(200);
    expect(body.hero.talents).toEqual(alocacao);
    expect((await h.heroRepository.getHeroById(HERO_ID))!.hero.talents).toEqual(alocacao);
  });

  // A trava que importa: quem decide o que é legal é `validateColumnAllocation`, no core.
  // Um nó de linha 5 sem os quatro acima dele é o caso clássico — passa em qualquer schema
  // (é um id válido com um número válido) e é ilegal pela amarração de §8.2.
  it('recusa alocação que fura a amarração da árvore', async () => {
    const h = buildHarness();
    const fundo = [...ARVORE.nodes].filter((n) => n.column === 'a').sort((a, b) => b.row - a.row)[0]!;

    const { status, body } = await put(h, `/heroes/${HERO_ID}/talents`, { talents: { [fundo.id]: 1 } });

    expect(status).toBe(400);
    expect(body.error).toBeTruthy();
    // E não gravou nada: recusar tem de ser recusar.
    expect((await h.heroRepository.getHeroById(HERO_ID))!.hero.talents).toEqual({});
  });

  it('recusa gastar mais pontos do que o orçamento de 9', async () => {
    const h = buildHarness();
    const excesso: Record<string, number> = {};
    for (const node of ARVORE.nodes) excesso[node.id] = node.maxRank;

    const { status } = await put(h, `/heroes/${HERO_ID}/talents`, { talents: excesso });

    expect(status).toBe(400);
  });

  // §10 — o nó avançado exige awakening 5. O herói de teste está em 0, e a rota tem de
  // usar o awakening DELE, não um padrão qualquer.
  it('recusa nó avançado quando o herói não tem awakening para ele', async () => {
    const h = buildHarness();
    const gated = ARVORE.nodes.find((n) => n.minAwakening !== undefined);
    expect(gated, 'a árvore do Aren não tem nó avançado').toBeDefined();

    const coluna = [...ARVORE.nodes].filter((n) => n.column === 'a' && n.row < gated!.row).sort((a, b) => a.row - b.row);
    const alocacao: Record<string, number> = { [gated!.id]: 1 };
    for (const node of coluna) alocacao[node.id] = 1;

    const { status } = await put(h, `/heroes/${HERO_ID}/talents`, { talents: alocacao });

    expect(status).toBe(400);
  });

  it('recusa herói de outro jogador', async () => {
    const h = buildHarness();
    const { status } = await put(h, `/heroes/heroi-alheio/talents`, { talents: {} });
    expect(status).toBe(403);
  });

  it('herói desconhecido é 403 e não 404: quem não é seu não existe para você', async () => {
    const h = buildHarness();
    const { status } = await put(h, `/heroes/heroi-que-nao-existe/talents`, { talents: {} });
    expect(status).toBe(403);
  });
});

describe('PUT /heroes/:heroId/tactics (§6.3)', () => {
  it('persiste um script dentro do teto base', async () => {
    const h = buildHarness();
    const script = [linha(ESPECIAL, 2), linha(ATAQUE)];

    const { status, body } = await put(h, `/heroes/${HERO_ID}/tactics`, { tacticsScript: script });

    expect(status).toBe(200);
    expect(body.hero.tacticsScript).toEqual(script);
    expect((await h.heroRepository.getHeroById(HERO_ID))!.hero.tacticsScript).toEqual(script);
  });

  it('recusa uma linha acima do teto base, e não grava', async () => {
    const h = buildHarness();
    const antes = (await h.heroRepository.getHeroById(HERO_ID))!.hero.tacticsScript;

    const { status, body } = await put(h, `/heroes/${HERO_ID}/tactics`, {
      tacticsScript: [linha(ATAQUE), linha(ATAQUE), linha(ATAQUE), linha(ATAQUE), linha(ATAQUE)],
    });

    expect(status).toBe(400);
    expect(body.error).toContain('linha');
    expect((await h.heroRepository.getHeroById(HERO_ID))!.hero.tacticsScript).toEqual(antes);
  });

  // A razão de a rota resolver os talentos DO HERÓI em vez de aplicar um teto fixo: o
  // mesmo script é ilegal antes e legal depois de alocar o nó que concede o slot. É também
  // o primeiro lugar do projeto onde `extraTacticsSlot` muda alguma coisa.
  it('o teto sobe quando o herói ALOCA o talento de slot — o mesmo script passa', async () => {
    const h = buildHarness();
    const cincoLinhas = [linha(ATAQUE), linha(ATAQUE), linha(ATAQUE), linha(ATAQUE), linha(ATAQUE)];

    expect((await put(h, `/heroes/${HERO_ID}/tactics`, { tacticsScript: cincoLinhas })).status).toBe(400);

    const comSlot = caminhoAteSlotExtra();
    expect(Object.keys(comSlot).length, 'nenhum nó de slot encontrado na árvore').toBeGreaterThan(0);
    expect((await put(h, `/heroes/${HERO_ID}/talents`, { talents: comSlot })).status).toBe(200);

    expect((await put(h, `/heroes/${HERO_ID}/tactics`, { tacticsScript: cincoLinhas })).status).toBe(200);
  });

  it('recusa a terceira condição numa linha sem o talento que a libera', async () => {
    const h = buildHarness();

    const { status, body } = await put(h, `/heroes/${HERO_ID}/tactics`, { tacticsScript: [linha(ESPECIAL, 3)] });

    expect(status).toBe(400);
    expect(body.error).toContain('condi');
  });

  // A skill conhecida sai do herói (duelSkills + mapSkills + o que os talentos concedem),
  // não de um catálogo global: nomear a especial de outra classe tem de ser recusado.
  it('recusa linha com skill que o herói não conhece', async () => {
    const h = buildHarness();

    const { status } = await put(h, `/heroes/${HERO_ID}/tactics`, {
      tacticsScript: [linha('skill-especial-arqueiro')],
    });

    expect(status).toBe(400);
  });

  it('recusa herói de outro jogador', async () => {
    const h = buildHarness();
    const { status } = await put(h, `/heroes/heroi-alheio/tactics`, { tacticsScript: [] }, TOKEN);
    expect(status).toBe(403);
  });
});

// A prova de que a preparação CHEGA na batalha: sem ela as duas rotas seriam escrita em
// banco que nada lê, e o motivo de elas existirem (a campanha pelo servidor) não estaria
// verificado em lugar nenhum.
describe('o que foi salvo é o que a batalha monta', () => {
  it('o ticket de campanha traz o script salvo, e não o da ficha', async () => {
    const h = buildHarness();
    const script = [linha(ATAQUE, 1)];
    expect((await put(h, `/heroes/${HERO_ID}/tactics`, { tacticsScript: script })).status).toBe(200);

    const ticket = await h.app.inject({
      method: 'POST',
      url: '/campaign/encounter-campanha-1/ticket',
      headers: { 'x-platform-ticket': `dev:${TOKEN}`},
      payload: { heroIds: [HERO_ID] },
    });

    expect(ticket.statusCode).toBe(200);
    const unidade = (ticket.json() as any).setup.units.find((u: any) => u.unitId === `player-${HERO_ID}`);
    expect(unidade.tacticsScript).toEqual(script);
  });

  it('o ticket reflete os talentos salvos: o stat sheet muda', async () => {
    const h = buildHarness();

    const antes = await h.app.inject({
      method: 'POST',
      url: '/campaign/encounter-campanha-1/ticket',
      headers: { 'x-platform-ticket': `dev:${TOKEN}`},
      payload: { heroIds: [HERO_ID] },
    });
    const statsAntes = (antes.json() as any).setup.units.find((u: any) => u.unitId === `player-${HERO_ID}`).stats;

    expect((await put(h, `/heroes/${HERO_ID}/talents`, { talents: caminhoLegal(4) })).status).toBe(200);

    const depois = await h.app.inject({
      method: 'POST',
      url: '/campaign/encounter-campanha-1/ticket',
      headers: { 'x-platform-ticket': `dev:${TOKEN}`},
      payload: { heroIds: [HERO_ID] },
    });
    const statsDepois = (depois.json() as any).setup.units.find((u: any) => u.unitId === `player-${HERO_ID}`).stats;

    expect(statsDepois).not.toEqual(statsAntes);
  });
});
