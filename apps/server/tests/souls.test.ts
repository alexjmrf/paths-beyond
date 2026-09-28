import { RULES_VERSION, validateSoul, type SoulInstance } from '@paths-beyond/core';
import { loadCatalogFromDisk } from '@paths-beyond/content';
import { describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { assembleArenaBattle, type BattleRoutesOptions } from '../src/battle/routes.js';
import { createDevIdentityValidator } from '../src/identity/devIdentity.js';
import { createInMemoryRateLimiter } from '../src/battle/rateLimit.js';
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
import { DEFAULT_PVE_ACCOUNT } from '../src/repository/types.js';
import { buildStoredHero } from '../src/summon/roster.js';

// M39 4/N (D61) — a Soul JOGÁVEL: craftar (escolhendo o personagem no ato, de material genérico),
// recraftar, equipar (com a trava de nível e de personagem) e desequipar pelo servidor, com nonce,
// e a Soul chegando a toda montagem de batalha.
//
// Nenhuma regra mora aqui: `craftSoul`, `recraftSoul`, `equipSoul` e `validateSoul` são do core
// (2/N) e os números são de `economy.json` (3/N). O que se mede é autorização, cobrança,
// idempotência e persistência.

const TOKEN = 'token-soul';
const OUTRO_TOKEN = 'token-soul-outro';
const AGORA = Date.UTC(2026, 8, 30, 12);
const catalog = loadCatalogFromDisk();
const regras = catalog.economyRules.soul!;

const RURIK = 'ally-guerreiro';
const NYRA = 'ally-lanceiro';
const BARDAN = 'ally-couracado'; // de invocação, e não está na conta do player-1
const ESSENCIA = 'material-essencia-de-alma';
const heroiDe = (playerId: string, characterId: string) => `${playerId}-${characterId}`;

// Uma Soul VÁLIDA do Rurik com mainstat atk — concedida direto no repositório para o teste de
// batalha não depender do sorteio.
const SOUL_DO_RURIK: SoulInstance = {
  id: 'soul-rurik-fixa',
  soulOf: RURIK,
  mainstat: { stat: 'atk', value: 45 },
  substats: [
    { stat: 'hp', value: 100 },
    { stat: 'def', value: 20 },
  ],
  crafts: 1,
};

function jogador(id: string, platformId: string, extra: Record<string, unknown> = {}) {
  return {
    id,
    platformProvider: 'dev' as const,
    platformId,
    displayName: id,
    elo: 1200,
    arenaMarks: 0,
    ...DEFAULT_PVE_ACCOUNT,
    premium: 0,
    energy: { stored: catalog.economyRules.energy.max, asOfMs: AGORA },
    ...extra,
  };
}

async function harness(options: { gold?: number; essencia?: number } = {}) {
  const playerRepository = createMemoryPlayerRepository([
    jogador('player-1', TOKEN, { gold: options.gold ?? 20_000 }),
    jogador('player-2', OUTRO_TOKEN, { gold: 20_000 }),
  ]);
  const ownershipRepository = createMemoryCharacterOwnershipRepository();
  const economyRepository = createMemoryEconomyRepository();
  const heroRepository = createMemoryHeroRepository();
  const arenaDefenseRepository = createMemoryArenaDefenseRepository();
  const deps = {
    repository: playerRepository,
    heroRepository,
    arenaDefenseRepository,
    partyPresetRepository: createMemoryPartyPresetRepository(),
    replayRepository: createMemoryReplayRepository(),
    matchRepository: createMemoryMatchRepository(),
    seasonRepository: createMemorySeasonRepository(),
    economyRepository,
    ownershipRepository,
    rewardsRepository: createMemoryRewardsRepository(),
    catalog,
    shopCatalog: {},
    rateLimiter: createInMemoryRateLimiter({ maxRequests: 1000, windowMs: 60_000 }),
    ticketSecret: 'segredo',
    identityValidator: createDevIdentityValidator(),
    now: () => AGORA,
  };
  const app = buildApp(deps);

  for (const characterId of [RURIK, NYRA]) {
    await ownershipRepository.grant('player-1', characterId);
    await heroRepository.createHero(buildStoredHero(catalog, 'player-1', characterId));
  }
  await economyRepository.setMaterials('player-1', { [ESSENCIA]: options.essencia ?? 100 });

  async function post(url: string, payload: Record<string, unknown>, token = TOKEN) {
    const r = await app.inject({ method: 'POST', url, headers: { 'x-platform-ticket': `dev:${token}` }, payload });
    return { status: r.statusCode, body: r.json() as any };
  }
  async function get(url: string, token = TOKEN) {
    const r = await app.inject({ method: 'GET', url, headers: { 'x-platform-ticket': `dev:${token}` } });
    return { status: r.statusCode, body: r.json() as any };
  }
  async function subirNivel(playerId: string, characterId: string, level: number) {
    const stored = (await heroRepository.getHeroById(heroiDe(playerId, characterId)))!;
    await heroRepository.updateHero({ ...stored, hero: { ...stored.hero, level } });
  }
  return { app, deps, post, get, subirNivel, playerRepository, ownershipRepository, economyRepository, heroRepository, arenaDefenseRepository };
}

describe('POST /souls/craft — o personagem escolhido no ato, de material genérico', () => {
  it('cobra o custo de craft e entrega uma Soul válida DAQUELE personagem', async () => {
    const h = await harness();
    const r = await h.post('/souls/craft', { nonce: 'cr-1', characterId: RURIK });

    expect(r.status, JSON.stringify(r.body)).toBe(201);
    const soul = r.body.soul as SoulInstance;
    expect(soul.soulOf).toBe(RURIK);
    expect(soul.crafts).toBe(1);
    expect(validateSoul(soul, catalog.characterSouls[RURIK]!, regras)).toEqual([]);
    expect(r.body.wallet.gold).toBe(20_000 - regras.craftCost.gold);
    expect(r.body.materials[ESSENCIA]).toBe(100 - regras.craftCost.materials[ESSENCIA]!);
    expect(await h.ownershipRepository.listSouls('player-1')).toEqual([soul]);
  });

  it('o MESMO material crafta para outro personagem, e o mesmo personagem pode ter várias', async () => {
    const h = await harness({ essencia: 200 });
    await h.post('/souls/craft', { nonce: 'v-1', characterId: RURIK });
    await h.post('/souls/craft', { nonce: 'v-2', characterId: RURIK });
    await h.post('/souls/craft', { nonce: 'v-3', characterId: NYRA });

    const souls = await h.ownershipRepository.listSouls('player-1');
    expect(souls.map((s) => s.soulOf)).toEqual([RURIK, RURIK, NYRA]);
    expect(new Set(souls.map((s) => s.id)).size).toBe(3);
  });

  it('só para personagem que a conta POSSUI; personagem fora do elenco é 404', async () => {
    const h = await harness();
    expect((await h.post('/souls/craft', { nonce: 'p-1', characterId: BARDAN })).status).toBe(403);
    expect((await h.post('/souls/craft', { nonce: 'p-2', characterId: 'ally-ninguem' })).status).toBe(404);
    expect(await h.ownershipRepository.listSouls('player-1')).toEqual([]);
  });

  it('sem recurso recusa, não cobra, e o nonce continua usável', async () => {
    const h = await harness({ essencia: 39 });
    const r = await h.post('/souls/craft', { nonce: 'pobre', characterId: RURIK });
    expect(r.status).toBe(400);
    expect((await h.economyRepository.getMaterials('player-1'))[ESSENCIA]).toBe(39);

    await h.economyRepository.setMaterials('player-1', { [ESSENCIA]: 40 });
    expect((await h.post('/souls/craft', { nonce: 'pobre', characterId: RURIK })).status).toBe(201);
  });

  it('reenvio do mesmo nonce é 409 e não crafta duas vezes; sem nonce é 400', async () => {
    const h = await harness();
    await h.post('/souls/craft', { nonce: 'dup', characterId: RURIK });
    expect((await h.post('/souls/craft', { nonce: 'dup', characterId: RURIK })).status).toBe(409);
    expect(await h.ownershipRepository.listSouls('player-1')).toHaveLength(1);
    expect((await h.post('/souls/craft', { characterId: RURIK })).status).toBe(400);
  });

  it('o sorteio sai do nonce: o mesmo nonce em dois servidores dá a mesma Soul', async () => {
    const a = await (await harness()).post('/souls/craft', { nonce: 'mesmo', characterId: RURIK });
    const b = await (await harness()).post('/souls/craft', { nonce: 'mesmo', characterId: RURIK });
    expect(a.body.soul).toEqual(b.body.soul);
  });
});

describe('GET /me/souls', () => {
  it('lista as Souls do jogador, e só dele', async () => {
    const h = await harness();
    const r = await h.post('/souls/craft', { nonce: 'l-1', characterId: RURIK });
    expect((await h.get('/me/souls')).body.souls).toEqual([r.body.soul]);
    expect((await h.get('/me/souls', OUTRO_TOKEN)).body.souls).toEqual([]);
  });
});

describe('POST /souls/:id/recraft — re-sorteia tudo na mesma instância', () => {
  it('cobra o custo de recraft, mantém id e dono, e conta o craft', async () => {
    const h = await harness();
    const feita = (await h.post('/souls/craft', { nonce: 'rc-0', characterId: RURIK })).body.soul as SoulInstance;
    const r = await h.post(`/souls/${feita.id}/recraft`, { nonce: 'rc-1' });

    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(r.body.soul.id).toBe(feita.id);
    expect(r.body.soul.soulOf).toBe(RURIK);
    expect(r.body.soul.crafts).toBe(2);
    expect(r.body.wallet.gold).toBe(20_000 - regras.craftCost.gold - regras.recraftCost.gold);
    expect((await h.ownershipRepository.listSouls('player-1'))[0]).toEqual(r.body.soul);
  });

  it('Soul de outro jogador é 404; sem recurso é 400 e nada muda', async () => {
    const h = await harness();
    const feita = (await h.post('/souls/craft', { nonce: 'rc-a', characterId: RURIK })).body.soul as SoulInstance;
    expect((await h.post(`/souls/${feita.id}/recraft`, { nonce: 'rc-b' }, OUTRO_TOKEN)).status).toBe(404);

    await h.economyRepository.setMaterials('player-1', {});
    expect((await h.post(`/souls/${feita.id}/recraft`, { nonce: 'rc-c' })).status).toBe(400);
    expect((await h.ownershipRepository.listSouls('player-1'))[0]).toEqual(feita);
  });
});

describe('POST /souls/:id/equip — o slot abre no nível do dado, e só para o dono', () => {
  it('recusa abaixo do nível 20; aceita no 20', async () => {
    const h = await harness();
    await h.ownershipRepository.grantSoul('player-1', SOUL_DO_RURIK);

    const baixo = await h.post(`/souls/${SOUL_DO_RURIK.id}/equip`, { nonce: 'eq-baixo', heroId: heroiDe('player-1', RURIK) });
    expect(baixo.status).toBe(400);

    await h.subirNivel('player-1', RURIK, regras.unlockLevel);
    const r = await h.post(`/souls/${SOUL_DO_RURIK.id}/equip`, { nonce: 'eq-20', heroId: heroiDe('player-1', RURIK) });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(r.body.hero.soul).toBe(SOUL_DO_RURIK.id);
    expect((await h.heroRepository.getHeroById(heroiDe('player-1', RURIK)))?.hero.soul).toBe(SOUL_DO_RURIK.id);
  });

  it('a trava por PERSONAGEM: a Soul do Rurik não entra na Nyra', async () => {
    const h = await harness();
    await h.ownershipRepository.grantSoul('player-1', SOUL_DO_RURIK);
    await h.subirNivel('player-1', NYRA, 20);
    const r = await h.post(`/souls/${SOUL_DO_RURIK.id}/equip`, { nonce: 'eq-nyra', heroId: heroiDe('player-1', NYRA) });
    expect(r.status).toBe(400);
  });

  it('Soul de outro jogador é 404; herói de outro jogador é 403', async () => {
    const h = await harness();
    await h.ownershipRepository.grantSoul('player-1', SOUL_DO_RURIK);
    expect((await h.post(`/souls/${SOUL_DO_RURIK.id}/equip`, { nonce: 'x-1', heroId: heroiDe('player-1', RURIK) }, OUTRO_TOKEN)).status).toBe(404);

    await h.ownershipRepository.grantSoul('player-2', { ...SOUL_DO_RURIK, id: 'soul-p2' });
    expect((await h.post('/souls/soul-p2/equip', { nonce: 'x-2', heroId: heroiDe('player-1', RURIK) }, OUTRO_TOKEN)).status).toBe(403);
  });

  it('desequipar tira a Soul do herói; ela continua na conta', async () => {
    const h = await harness();
    await h.ownershipRepository.grantSoul('player-1', SOUL_DO_RURIK);
    await h.subirNivel('player-1', RURIK, 20);
    await h.post(`/souls/${SOUL_DO_RURIK.id}/equip`, { nonce: 'u-1', heroId: heroiDe('player-1', RURIK) });

    const r = await h.post(`/heroes/${heroiDe('player-1', RURIK)}/soul/unequip`, { nonce: 'u-2' });
    expect(r.status).toBe(200);
    expect(r.body.hero.soul ?? null).toBeNull();
    expect(await h.ownershipRepository.listSouls('player-1')).toHaveLength(1);
  });
});

// D64 — descartar. Sem reembolso (a spec não prevê nenhum) e só Soul que NÃO está equipada: apagar
// a que um herói leva deixaria o herói apontando para uma Soul que não existe, e a montagem de
// batalha falha alto nesse caso (4/N).
describe('POST /souls/:id/discard — tira a Soul da conta', () => {
  it('apaga a Soul, não devolve nada, e as outras ficam', async () => {
    const h = await harness();
    const a = (await h.post('/souls/craft', { nonce: 'd-a', characterId: RURIK })).body.soul as SoulInstance;
    const b = (await h.post('/souls/craft', { nonce: 'd-b', characterId: RURIK })).body.soul as SoulInstance;
    const antes = await h.economyRepository.getMaterials('player-1');
    const ouroAntes = (await h.playerRepository.getPlayerById('player-1'))!.gold;

    const r = await h.post(`/souls/${a.id}/discard`, { nonce: 'd-1' });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(r.body.discarded).toBe(a.id);
    expect(await h.ownershipRepository.listSouls('player-1')).toEqual([b]);
    expect(await h.economyRepository.getMaterials('player-1')).toEqual(antes);
    expect((await h.playerRepository.getPlayerById('player-1'))!.gold).toBe(ouroAntes);
  });

  it('Soul EQUIPADA é recusada, e nada muda', async () => {
    const h = await harness();
    await h.ownershipRepository.grantSoul('player-1', SOUL_DO_RURIK);
    await h.subirNivel('player-1', RURIK, 20);
    await h.post(`/souls/${SOUL_DO_RURIK.id}/equip`, { nonce: 'd-eq', heroId: heroiDe('player-1', RURIK) });

    const r = await h.post(`/souls/${SOUL_DO_RURIK.id}/discard`, { nonce: 'd-2' });
    expect(r.status).toBe(409);
    expect(await h.ownershipRepository.listSouls('player-1')).toEqual([SOUL_DO_RURIK]);

    // Recusada antes do nonce: desequipar e descartar com a MESMA chave funciona.
    await h.post(`/heroes/${heroiDe('player-1', RURIK)}/soul/unequip`, { nonce: 'd-un' });
    expect((await h.post(`/souls/${SOUL_DO_RURIK.id}/discard`, { nonce: 'd-2' })).status).toBe(200);
  });

  it('Soul de outro jogador é 404; sem nonce é 400; reenvio é 409', async () => {
    const h = await harness();
    await h.ownershipRepository.grantSoul('player-1', SOUL_DO_RURIK);
    expect((await h.post(`/souls/${SOUL_DO_RURIK.id}/discard`, { nonce: 'd-x' }, OUTRO_TOKEN)).status).toBe(404);
    expect((await h.post(`/souls/${SOUL_DO_RURIK.id}/discard`, {})).status).toBe(400);
    expect(await h.ownershipRepository.listSouls('player-1')).toEqual([SOUL_DO_RURIK]);

    await h.ownershipRepository.grantSoul('player-1', { ...SOUL_DO_RURIK, id: 'soul-2' });
    expect((await h.post(`/souls/${SOUL_DO_RURIK.id}/discard`, { nonce: 'd-y' })).status).toBe(200);
    expect((await h.post('/souls/soul-2/discard', { nonce: 'd-y' })).status).toBe(409);
    expect(await h.ownershipRepository.listSouls('player-1')).toHaveLength(1);
  });
});

describe('a Soul chega à batalha', () => {
  async function comSoulEquipada(h: Awaited<ReturnType<typeof harness>>) {
    await h.ownershipRepository.grantSoul('player-1', SOUL_DO_RURIK);
    await h.subirNivel('player-1', RURIK, 20);
    const r = await h.post(`/souls/${SOUL_DO_RURIK.id}/equip`, { nonce: 'b-eq', heroId: heroiDe('player-1', RURIK) });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
  }

  async function atkNaCampanha(h: Awaited<ReturnType<typeof harness>>): Promise<number> {
    const r = await h.post('/campaign/encounter-campanha-1/matches', {
      heroIds: [heroiDe('player-1', RURIK)],
      rulesVersion: RULES_VERSION,
      nonce: 'camp',
    });
    expect(r.status, JSON.stringify(r.body)).toBe(201);
    return r.body.visivel.units.find((u: any) => u.unitId === `player-${heroiDe('player-1', RURIK)}`).stats.atk;
  }

  it('na campanha: o mesmo herói, no mesmo nível, tem mais `atk` com a Soul equipada', async () => {
    const sem = await harness();
    await sem.subirNivel('player-1', RURIK, 20);
    const com = await harness();
    await comSoulEquipada(com);
    expect(await atkNaCampanha(com)).toBeGreaterThan(await atkNaCampanha(sem));
  });

  it('na arena: a Soul do atacante E a do defensor entram na montagem', async () => {
    async function montar(equipar: boolean) {
      const h = await harness();
      await h.ownershipRepository.grant('player-2', RURIK);
      await h.heroRepository.createHero(buildStoredHero(catalog, 'player-2', RURIK));
      await h.subirNivel('player-1', RURIK, 20);
      await h.subirNivel('player-2', RURIK, 20);
      if (equipar) {
        await h.ownershipRepository.grantSoul('player-1', SOUL_DO_RURIK);
        await h.ownershipRepository.grantSoul('player-2', { ...SOUL_DO_RURIK, id: 'soul-def' });
        await h.post(`/souls/${SOUL_DO_RURIK.id}/equip`, { nonce: 'ar-1', heroId: heroiDe('player-1', RURIK) });
        await h.post('/souls/soul-def/equip', { nonce: 'ar-2', heroId: heroiDe('player-2', RURIK) }, OUTRO_TOKEN);
      }
      await h.arenaDefenseRepository.saveDefense({
        ownerPlayerId: 'player-2',
        mapId: Object.keys(catalog.maps)[0]!,
        units: [{ heroId: heroiDe('player-2', RURIK), pos: { x: 5, y: 0 }, height: 0, aiArchetype: 'aggressive' }],
      } as never);
      const r = await assembleArenaBattle(h.deps as unknown as BattleRoutesOptions, 'player-1', [heroiDe('player-1', RURIK)], 'player-2');
      if (!r.ok) throw new Error(r.error);
      const atk = (unitId: string) => r.setup.units.find((u) => u.unitId === unitId)!.stats.atk;
      return { atacante: atk(heroiDe('player-1', RURIK)), defensor: atk(heroiDe('player-2', RURIK)) };
    }

    const sem = await montar(false);
    const com = await montar(true);
    expect(com.atacante).toBeGreaterThan(sem.atacante);
    expect(com.defensor).toBeGreaterThan(sem.defensor);
  });

  async function montarContraDefesa(h: Awaited<ReturnType<typeof harness>>) {
    await h.ownershipRepository.grant('player-2', NYRA);
    await h.heroRepository.createHero(buildStoredHero(catalog, 'player-2', NYRA));
    await h.arenaDefenseRepository.saveDefense({
      ownerPlayerId: 'player-2',
      mapId: Object.keys(catalog.maps)[0]!,
      units: [{ heroId: heroiDe('player-2', NYRA), pos: { x: 5, y: 0 }, height: 0, aiArchetype: 'aggressive' }],
    } as never);
    return assembleArenaBattle(h.deps as unknown as BattleRoutesOptions, 'player-1', [heroiDe('player-1', RURIK)], 'player-2');
  }

  it('herói apontando para Soul que não está na conta falha ALTO, em vez de lutar sem ela', async () => {
    const h = await harness();
    const stored = (await h.heroRepository.getHeroById(heroiDe('player-1', RURIK)))!;
    await h.heroRepository.updateHero({ ...stored, hero: { ...stored.hero, level: 20, soul: 'soul-fantasma' } });
    await expect(montarContraDefesa(h)).rejects.toThrow(/Soul/);
  });

  it('Soul com mainstat que não é do personagem falha ALTO na montagem', async () => {
    const h = await harness();
    await h.ownershipRepository.grantSoul('player-1', { ...SOUL_DO_RURIK, id: 'soul-torta', mainstat: { stat: 'heal', value: 60 } });
    const stored = (await h.heroRepository.getHeroById(heroiDe('player-1', RURIK)))!;
    await h.heroRepository.updateHero({ ...stored, hero: { ...stored.hero, level: 20, soul: 'soul-torta' } });
    await expect(montarContraDefesa(h)).rejects.toThrow(/Soul|mainstat/);
  });
});
