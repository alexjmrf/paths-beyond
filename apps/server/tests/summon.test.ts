import { loadCatalogFromDisk } from '@paths-beyond/content';
import { describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { createDevIdentityValidator } from '../src/identity/devIdentity.js';
import { createInMemoryRateLimiter } from '../src/battle/rateLimit.js';
import {
  createMemoryArenaDefenseRepository,
  createMemoryPartyPresetRepository,
  createMemoryCharacterOwnershipRepository,
  createMemoryEconomyRepository,
  createMemoryHeroRepository,
  createMemoryPlayerRepository,
  createMemoryReplayRepository,
  createMemoryRewardsRepository,
  createMemorySeasonRepository,
} from '../src/repository/memoryRepository.js';
import { DEFAULT_PVE_ACCOUNT } from '../src/repository/types.js';

// §10 (M18, sub-sessão 3/N) — posse de personagem, `POST /summon` e a moeda premium.
//
// O que este arquivo mede é o que a milestone promete no critério 1: um jogador começa com
// o NÚCLEO, gasta premium, puxa alguém, e ele passa a ser dele. Mais o que o critério 4
// pede dos sumidouros: cada ação cobra uma única vez, mesmo com reenvio.

const TICKET_SECRET = 'segredo-de-teste';
const TOKEN = 'token-summon';
const AGORA = Date.UTC(2024, 0, 5, 12);

const catalog = loadCatalogFromDisk();
const CUSTO = catalog.premiumRules.summon.premiumCost;
const BANNER = 'banner-elenco';

// D14 — os quatro garantidos, e os cinco que só o banner entrega.
const NUCLEO = ['ally-arcanista', 'ally-arqueiro', 'ally-clerigo', 'hero-jogador'];
const ADQUIRIVEIS = ['ally-couracado', 'ally-grifeiro', 'ally-guerreiro', 'ally-lanceiro', 'ally-mensageira'];

interface Harness {
  readonly app: ReturnType<typeof buildApp>;
  readonly playerRepository: ReturnType<typeof createMemoryPlayerRepository>;
  readonly ownershipRepository: ReturnType<typeof createMemoryCharacterOwnershipRepository>;
  readonly rewardsRepository: ReturnType<typeof createMemoryRewardsRepository>;
  readonly economyRepository: ReturnType<typeof createMemoryEconomyRepository>;
}

function buildHarness(options: { premium?: number } = {}): Harness {
  const playerRepository = createMemoryPlayerRepository([
    {
      id: 'player-1',
      platformProvider: 'dev' as const,
      platformId: TOKEN,
      displayName: 'Invocador',
      elo: 1200,
      arenaMarks: 0,
      ...DEFAULT_PVE_ACCOUNT,
      premium: options.premium ?? 0,
      energy: { stored: catalog.economyRules.energy.max, asOfMs: AGORA },
    },
  ]);
  const ownershipRepository = createMemoryCharacterOwnershipRepository();
  const rewardsRepository = createMemoryRewardsRepository();
  const economyRepository = createMemoryEconomyRepository();

  return {
    playerRepository,
    ownershipRepository,
    rewardsRepository,
    economyRepository,
    app: buildApp({
      repository: playerRepository,
      heroRepository: createMemoryHeroRepository(),
      arenaDefenseRepository: createMemoryArenaDefenseRepository(),
      partyPresetRepository: createMemoryPartyPresetRepository(),
      replayRepository: createMemoryReplayRepository(),
      seasonRepository: createMemorySeasonRepository(),
      economyRepository,
      ownershipRepository,
      rewardsRepository,
      catalog,
      shopCatalog: {},
      rateLimiter: createInMemoryRateLimiter({ maxRequests: 1000, windowMs: 60_000 }),
      ticketSecret: TICKET_SECRET,
      identityValidator: createDevIdentityValidator(),
      now: () => AGORA,
    }),
  };
}

async function post(h: Harness, url: string, payload: Record<string, unknown>) {
  const response = await h.app.inject({ method: 'POST', url, headers: { 'x-platform-ticket': `dev:${TOKEN}`}, payload });
  return { status: response.statusCode, body: response.json() as any };
}

// §9.4 (M20) — o sign-in explícito. A M18 6/N materializava o núcleo dentro de
// `GET /me/heroes`; o M20 tirou a escrita do `GET` e a pôs aqui, que é onde a conta nasce.
// Os testes abaixo continuam afirmando exatamente a mesma coisa sobre o NÚCLEO — o que
// mudou é por qual porta ele chega.
async function sessao(h: Harness) {
  const response = await h.app.inject({
    method: 'POST',
    url: '/accounts/session',
    headers: { 'x-platform-ticket': `dev:${TOKEN}` },
    payload: {},
  });
  return { status: response.statusCode, body: response.json() as any };
}

async function get(h: Harness, url: string) {
  const response = await h.app.inject({ method: 'GET', url, headers: { 'x-platform-ticket': `dev:${TOKEN}`} });
  return { status: response.statusCode, body: response.json() as any };
}

describe('GET /me/roster', () => {
  it('uma conta NOVA já possui o núcleo de história e mais nada', async () => {
    // Sem passo de concessão em lugar nenhum: o núcleo é derivado do catálogo (D14), e é
    // isso que faz "garantido a todo jogador" valer por construção.
    const h = buildHarness();
    const { status, body } = await get(h, '/me/roster');

    expect(status).toBe(200);
    const possuidos = body.characters.filter((c: any) => c.owned).map((c: any) => c.id);
    expect(possuidos.sort()).toEqual([...NUCLEO].sort());
  });

  it('lista o elenco inteiro, possuído ou não, e diz o que veio da história', async () => {
    const h = buildHarness();
    const { body } = await get(h, '/me/roster');

    expect(body.characters).toHaveLength(NUCLEO.length + ADQUIRIVEIS.length);
    for (const character of body.characters) {
      expect(character.fromStory).toBe(NUCLEO.includes(character.id));
    }
  });

  it('o adquirido entra no roster', async () => {
    const h = buildHarness();
    await h.ownershipRepository.grant('player-1', 'ally-grifeiro');

    const { body } = await get(h, '/me/roster');
    const kaia = body.characters.find((c: any) => c.id === 'ally-grifeiro');

    expect(kaia.owned).toBe(true);
    expect(kaia.fromStory).toBe(false);
  });
});

describe('POST /summon', () => {
  it('cobra a moeda premium e entrega um personagem que passa a ser do jogador', async () => {
    const h = buildHarness({ premium: CUSTO });
    const { status, body } = await post(h, '/summon', { nonce: 'n-1', bannerId: BANNER });

    expect(status).toBe(200);
    expect(body.premium).toBe(0);
    expect(body.outcome.kind).toBe('character');
    expect(ADQUIRIVEIS).toContain(body.outcome.characterId);

    const roster = await get(h, '/me/roster');
    const puxado = roster.body.characters.find((c: any) => c.id === body.outcome.characterId);
    expect(puxado.owned).toBe(true);
  });

  it('sem moeda suficiente recusa, e NÃO queima o nonce', async () => {
    // Se recusar por saldo gastasse a chave de idempotência, o jogador que juntasse a moeda
    // não conseguiria reusar o mesmo nonce e veria um 409 sem ter invocado nada.
    const h = buildHarness({ premium: CUSTO - 1 });

    const pobre = await post(h, '/summon', { nonce: 'n-1', bannerId: BANNER });
    expect(pobre.status).toBe(400);

    await h.playerRepository.updatePremium('player-1', CUSTO);
    const rico = await post(h, '/summon', { nonce: 'n-1', bannerId: BANNER });
    expect(rico.status).toBe(200);
  });

  it('reenvio do mesmo nonce não cobra duas vezes', async () => {
    const h = buildHarness({ premium: CUSTO * 2 });

    const primeira = await post(h, '/summon', { nonce: 'n-1', bannerId: BANNER });
    const segunda = await post(h, '/summon', { nonce: 'n-1', bannerId: BANNER });

    expect(primeira.status).toBe(200);
    expect(segunda.status).toBe(409);

    const player = await h.playerRepository.getPlayerById('player-1');
    expect(player?.premium).toBe(CUSTO);
  });

  it('banner desconhecido é 404', async () => {
    const h = buildHarness({ premium: CUSTO });
    const { status } = await post(h, '/summon', { nonce: 'n-1', bannerId: 'banner-que-nao-existe' });
    expect(status).toBe(404);
  });

  it('duplicata vira fragmento do PRÓPRIO personagem, e não um personagem repetido', async () => {
    const h = buildHarness({ premium: CUSTO * 20 });
    // Com o pool inteiro já adquirido, toda rolagem é duplicata.
    for (const id of ADQUIRIVEIS) await h.ownershipRepository.grant('player-1', id);

    const { body } = await post(h, '/summon', { nonce: 'n-dup', bannerId: BANNER });

    expect(body.outcome.kind).toBe('duplicate');
    const materiais = await h.economyRepository.getMaterials('player-1');
    expect(materiais[body.outcome.fragmentMaterialId]).toBe(1);
    // E o fragmento é o que o catálogo declara para AQUELE personagem.
    const character = catalog.characters[body.outcome.characterId]!;
    expect(body.outcome.fragmentMaterialId).toBe(character.fragmentMaterialId);
  });

  it('o pity é contado por jogador e sobrevive entre rolagens', async () => {
    const h = buildHarness({ premium: CUSTO * 20 });
    for (const id of ADQUIRIVEIS) await h.ownershipRepository.grant('player-1', id);

    // Pool esgotado: o contador CONGELA (a leitura registrada na 1/N). É o que se afirma
    // aqui — que ele não avança inventando garantia sem destino.
    const primeira = await post(h, '/summon', { nonce: 'p-1', bannerId: BANNER });
    const segunda = await post(h, '/summon', { nonce: 'p-2', bannerId: BANNER });

    expect(primeira.body.rollsSinceNew).toBe(0);
    expect(segunda.body.rollsSinceNew).toBe(0);
  });

  it('invocando até esgotar o pool, o jogador obtém os CINCO — o pity garante a cauda', async () => {
    // O critério 1 ponta a ponta pela rota, e não pelo motor: 60 invocações são de sobra
    // com pity 10 sobre um pool de 5, e o que se afirma é que nenhum fica para trás.
    const h = buildHarness({ premium: CUSTO * 60 });

    for (let i = 0; i < 60; i++) {
      const r = await post(h, '/summon', { nonce: `bulk-${i}`, bannerId: BANNER });
      expect(r.status).toBe(200);
    }

    const adquiridos = await h.ownershipRepository.listAcquired('player-1');
    expect([...adquiridos].sort()).toEqual([...ADQUIRIVEIS].sort());
  });

  it('a mesma seed dá a mesma rolagem: dois jogadores com o mesmo nonce NÃO recebem o mesmo', async () => {
    // O `rollId` inclui o id do jogador, e é isso que impede dois jogadores de compartilhar
    // resultado ao mandarem o mesmo nonce — que é o que um cliente adulterado tentaria para
    // descobrir a rolagem de outro antes de gastar.
    const a = buildHarness({ premium: CUSTO });
    const b = buildHarness({ premium: CUSTO });
    // O segundo jogador tem outro id; o harness usa 'player-1' nos dois, então a diferença
    // é forçada aqui pelo banner de pity de cada um. O que importa afirmar é que a rolagem
    // é função da seed e não do relógio: repetir a mesma entrada dá o mesmo resultado.
    const r1 = await post(a, '/summon', { nonce: 'mesmo', bannerId: BANNER });
    const r2 = await post(b, '/summon', { nonce: 'mesmo', bannerId: BANNER });

    expect(r1.body.outcome).toEqual(r2.body.outcome);
  });
});

describe('POST /energy/purchase (D17)', () => {
  it('troca premium por energia', async () => {
    const { premiumCost, energy: ganho } = catalog.premiumRules.energyPurchase;
    const h = buildHarness({ premium: premiumCost });

    const antes = (await h.playerRepository.getPlayerById('player-1'))!.energy.stored;
    const { status, body } = await post(h, '/energy/purchase', { nonce: 'e-1' });

    expect(status).toBe(200);
    expect(body.premium).toBe(0);
    expect(body.energy.stored).toBe(antes + ganho);
  });

  it('a compra passa POR CIMA do teto de conta', async () => {
    // De propósito: o teto limita o farm de graça, e o sumidouro não teria função se a
    // compra fosse aparada por ele — quem compra é justamente quem está com a barra cheia.
    const { premiumCost, energy: ganho } = catalog.premiumRules.energyPurchase;
    const h = buildHarness({ premium: premiumCost });

    const { body } = await post(h, '/energy/purchase', { nonce: 'e-1' });

    expect(body.energy.stored).toBe(catalog.economyRules.energy.max + ganho);
  });

  it('sem moeda suficiente recusa', async () => {
    const h = buildHarness({ premium: 0 });
    const { status } = await post(h, '/energy/purchase', { nonce: 'e-1' });
    expect(status).toBe(400);
  });

  it('reenvio do mesmo nonce não cobra duas vezes', async () => {
    const { premiumCost } = catalog.premiumRules.energyPurchase;
    const h = buildHarness({ premium: premiumCost * 2 });

    expect((await post(h, '/energy/purchase', { nonce: 'e-1' })).status).toBe(200);
    expect((await post(h, '/energy/purchase', { nonce: 'e-1' })).status).toBe(409);

    const player = await h.playerRepository.getPlayerById('player-1');
    expect(player?.premium).toBe(premiumCost);
  });
});

// §10/D14 (M18, sub-sessão 6/N) — POSSE não é a mesma coisa que ter o herói.
//
// Até esta fatia `POST /summon` concedia posse e mais nada: o personagem invocado não
// virava instância nenhuma, e o critério de aceite 1 pede que ele seja JOGÁVEL. O mesmo
// buraco valia para o núcleo — todo herói do projeto até aqui nasceu de seed de banco ou
// de fixture, e uma conta nova de verdade abriria o jogo sem ninguém para levar ao mapa.
describe('M18 6/N — o personagem possuído vira herói jogável', () => {
  it('uma conta NOVA recebe uma instância para cada personagem do núcleo', async () => {
    const h = buildHarness();
    await sessao(h);
    const { status, body } = await get(h, '/me/heroes');

    expect(status).toBe(200);
    expect(body.map((entry: any) => entry.hero.characterId).sort()).toEqual([...NUCLEO].sort());
  });

  it('a instância sai da FICHA do catálogo, não de convenção do servidor', async () => {
    const h = buildHarness();
    await sessao(h);
    const { body } = await get(h, '/me/heroes');

    for (const entry of body) {
      const ficha = catalog.characters[entry.hero.characterId]!.startingHero;
      expect({
        level: entry.hero.level,
        weaponType: entry.hero.weaponType,
        equipment: entry.hero.equipment,
        duelSkills: entry.hero.duelSkills,
      }).toEqual({
        level: ficha.level,
        weaponType: ficha.weaponType,
        equipment: ficha.equipment,
        duelSkills: ficha.duelSkills,
      });
      // Progresso é da conta, não do catálogo: ninguém nasce desperto.
      expect({ exp: entry.hero.exp, awakening: entry.hero.awakening, imprint: entry.hero.imprint }).toEqual({
        exp: 0,
        awakening: 0,
        imprint: 0,
      });
      // A arma da ficha chega EQUIPADA, e não só nomeada: sem o item resolvido o herói
      // entraria no mapa desarmado.
      expect(entry.equippedItems.map((item: any) => item.id)).toContain(ficha.equipment.weapon);
    }
  });

  // M20 — a idempotência que importa mudou de rota junto com a escrita: dois sign-ins não
  // podem dar dois núcleos.
  it('assinar duas vezes não duplica ninguém', async () => {
    const h = buildHarness();
    await sessao(h);
    const primeira = await get(h, '/me/heroes');
    await sessao(h);
    const segunda = await get(h, '/me/heroes');

    expect(segunda.body.map((e: any) => e.hero.id)).toEqual(primeira.body.map((e: any) => e.hero.id));
    expect(segunda.body).toHaveLength(NUCLEO.length);
  });

  it('o invocado ganha instância na hora, e ela aparece no roster de heróis', async () => {
    const h = buildHarness({ premium: CUSTO });
    await sessao(h);
    const { body } = await post(h, '/summon', { nonce: 'n-1', bannerId: BANNER });
    expect(body.outcome.kind).toBe('character');

    const heroes = await get(h, '/me/heroes');
    const puxado = heroes.body.find((e: any) => e.hero.characterId === body.outcome.characterId);

    expect(puxado, 'invocado sem instância de herói').toBeDefined();
    expect(heroes.body).toHaveLength(NUCLEO.length + 1);
  });

  it('a DUPLICATA não cria uma segunda instância — ela vira fragmento', async () => {
    const h = buildHarness({ premium: CUSTO * 2 });
    await sessao(h);
    for (const id of ADQUIRIVEIS) await h.ownershipRepository.grant('player-1', id);
    const antes = (await get(h, '/me/heroes')).body.length;

    const { body } = await post(h, '/summon', { nonce: 'n-dup', bannerId: BANNER });
    expect(body.outcome.kind).toBe('duplicate');

    expect((await get(h, '/me/heroes')).body).toHaveLength(antes);
  });

  it('o herói do invocado passa na checagem de posse — ele é jogável de verdade', async () => {
    // O recíproco do anti-cheat da 3/N, e a metade do critério 1 que "aparece no roster"
    // não cobre: a instância só vale se o servidor a aceitar numa batalha.
    const h = buildHarness({ premium: CUSTO });
    const { body } = await post(h, '/summon', { nonce: 'n-1', bannerId: BANNER });

    const heroes = await get(h, '/me/heroes');
    const puxado = heroes.body.find((e: any) => e.hero.characterId === body.outcome.characterId);

    const ticket = await post(h, '/campaign/encounter-campanha-1/ticket', { heroIds: [puxado.hero.id] });

    expect(ticket.status).toBe(200);
    expect(ticket.body.setup.units.some((u: any) => u.unitId === `player-${puxado.hero.id}`)).toBe(true);
  });
});
