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

// M38 4/N — o artefato JOGÁVEL: equipar (com a trava por classe e movendo entre heróis),
// desequipar, despertar e dar imprint pelo servidor, e o artefato chegando à batalha.
//
// Nenhuma regra mora aqui: `equipArtifact`, `awakenArtifact` e `applyArtifactImprint` são do
// core desde a 1/N. O que se mede é autorização, cobrança, idempotência e persistência.

const TOKEN = 'token-artefato';
const OUTRO_TOKEN = 'token-defensor';
const AGORA = Date.UTC(2026, 8, 30, 12);
const catalog = loadCatalogFromDisk();

const RURIK = 'ally-guerreiro';
const HALLA = 'ally-machadeira'; // mesma classe do Rurik (D51)
const NYRA = 'ally-lanceiro'; // outra classe
const MACHADO = 'artifact-machado-do-tirano';
const NUCLEO = 'material-nucleo-de-artefato';
const FRAGMENTO = `material-fragmento-${MACHADO}`;
const INSTANCIA = `artefato-player-1-${MACHADO}`;
const heroiDe = (playerId: string, characterId: string) => `${playerId}-${characterId}`;

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

async function harness(options: { gold?: number } = {}) {
  const playerRepository = createMemoryPlayerRepository([
    jogador('player-1', TOKEN, options.gold !== undefined ? { gold: options.gold } : {}),
    jogador('player-2', OUTRO_TOKEN),
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

  // Rurik, Halla e Nyra na conta do player-1; o Machado do Tirano na conta dele.
  for (const characterId of [RURIK, HALLA, NYRA]) {
    await ownershipRepository.grant('player-1', characterId);
    await heroRepository.createHero(buildStoredHero(catalog, 'player-1', characterId));
  }
  await ownershipRepository.grantArtifact('player-1', { id: INSTANCIA, artifactId: MACHADO, awakening: 0, imprint: 0 });

  async function post(url: string, payload: Record<string, unknown>, token = TOKEN) {
    const r = await app.inject({ method: 'POST', url, headers: { 'x-platform-ticket': `dev:${token}` }, payload });
    return { status: r.statusCode, body: r.json() as any };
  }
  async function get(url: string, token = TOKEN) {
    const r = await app.inject({ method: 'GET', url, headers: { 'x-platform-ticket': `dev:${token}` } });
    return { status: r.statusCode, body: r.json() as any };
  }
  return { app, deps, post, get, playerRepository, ownershipRepository, economyRepository, heroRepository, arenaDefenseRepository };
}

describe('GET /me/artifacts', () => {
  it('lista as instâncias do jogador, e só dele', async () => {
    const h = await harness();
    expect((await h.get('/me/artifacts')).body.artifacts).toEqual([
      { id: INSTANCIA, artifactId: MACHADO, awakening: 0, imprint: 0 },
    ]);
    expect((await h.get('/me/artifacts', OUTRO_TOKEN)).body.artifacts).toEqual([]);
  });
});

describe('POST /artifacts/:id/equip', () => {
  it('equipa no herói da classe do artefato', async () => {
    const h = await harness();
    const r = await h.post(`/artifacts/${INSTANCIA}/equip`, { nonce: 'eq-1', heroId: heroiDe('player-1', RURIK) });
    expect(r.status).toBe(200);
    expect(r.body.hero.artifact).toBe(INSTANCIA);
    expect((await h.heroRepository.getHeroById(heroiDe('player-1', RURIK)))?.hero.artifact).toBe(INSTANCIA);
  });

  it('a trava por CLASSE: recusa herói de outra classe', async () => {
    const h = await harness();
    const r = await h.post(`/artifacts/${INSTANCIA}/equip`, { nonce: 'eq-classe', heroId: heroiDe('player-1', NYRA) });
    expect(r.status).toBe(400);
    expect((await h.heroRepository.getHeroById(heroiDe('player-1', NYRA)))?.hero.artifact ?? null).toBeNull();
  });

  it('equipar em outro herói MOVE o artefato: o anterior fica sem (D56)', async () => {
    const h = await harness();
    await h.post(`/artifacts/${INSTANCIA}/equip`, { nonce: 'mv-1', heroId: heroiDe('player-1', RURIK) });
    const r = await h.post(`/artifacts/${INSTANCIA}/equip`, { nonce: 'mv-2', heroId: heroiDe('player-1', HALLA) });

    expect(r.status).toBe(200);
    expect(r.body.movedFrom).toBe(heroiDe('player-1', RURIK));
    expect((await h.heroRepository.getHeroById(heroiDe('player-1', HALLA)))?.hero.artifact).toBe(INSTANCIA);
    expect((await h.heroRepository.getHeroById(heroiDe('player-1', RURIK)))?.hero.artifact ?? null).toBeNull();
  });

  it('artefato de outro jogador é 404; herói de outro jogador é 403', async () => {
    const h = await harness();
    const alheio = await h.post(`/artifacts/${INSTANCIA}/equip`, { nonce: 'x-1', heroId: heroiDe('player-1', RURIK) }, OUTRO_TOKEN);
    expect(alheio.status).toBe(404);

    await h.ownershipRepository.grantArtifact('player-2', { id: 'art-p2', artifactId: MACHADO, awakening: 0, imprint: 0 });
    const heroiAlheio = await h.post('/artifacts/art-p2/equip', { nonce: 'x-2', heroId: heroiDe('player-1', RURIK) }, OUTRO_TOKEN);
    expect(heroiAlheio.status).toBe(403);
  });

  it('reenvio do mesmo nonce é 409', async () => {
    const h = await harness();
    await h.post(`/artifacts/${INSTANCIA}/equip`, { nonce: 'dup', heroId: heroiDe('player-1', RURIK) });
    const r = await h.post(`/artifacts/${INSTANCIA}/equip`, { nonce: 'dup', heroId: heroiDe('player-1', HALLA) });
    expect(r.status).toBe(409);
  });
});

describe('POST /heroes/:heroId/artifact/unequip', () => {
  it('tira o artefato do herói; o artefato continua na conta', async () => {
    const h = await harness();
    await h.post(`/artifacts/${INSTANCIA}/equip`, { nonce: 'u-1', heroId: heroiDe('player-1', RURIK) });
    const r = await h.post(`/heroes/${heroiDe('player-1', RURIK)}/artifact/unequip`, { nonce: 'u-2' });

    expect(r.status).toBe(200);
    expect(r.body.hero.artifact ?? null).toBeNull();
    expect(await h.ownershipRepository.listArtifacts('player-1')).toHaveLength(1);
  });
});

describe('POST /artifacts/:id/awaken', () => {
  it('cobra ouro e núcleo de artefato, e sobe um degrau', async () => {
    const h = await harness({ gold: 10_000 });
    await h.economyRepository.setMaterials('player-1', { [NUCLEO]: 5 });
    const passo = catalog.economyRules.artifactAwakening![0]!;

    const r = await h.post(`/artifacts/${INSTANCIA}/awaken`, { nonce: 'aw-1' });
    expect(r.status).toBe(200);
    expect(r.body.artifact.awakening).toBe(1);
    expect(r.body.wallet.gold).toBe(10_000 - passo.gold);
    expect(r.body.materials[NUCLEO]).toBe(5 - passo.materials[NUCLEO]!);
    expect((await h.ownershipRepository.listArtifacts('player-1'))[0]?.awakening).toBe(1);
  });

  it('sem recurso recusa e não cobra nada', async () => {
    const h = await harness({ gold: 0 });
    const r = await h.post(`/artifacts/${INSTANCIA}/awaken`, { nonce: 'aw-pobre' });
    expect(r.status).toBe(400);
    expect((await h.ownershipRepository.listArtifacts('player-1'))[0]?.awakening).toBe(0);
  });
});

describe('POST /artifacts/:id/imprint', () => {
  it('consome o fragmento DAQUELE artefato, resolvido pelo catálogo', async () => {
    const h = await harness();
    const passo = catalog.economyRules.artifactImprint![0]!;
    await h.economyRepository.setMaterials('player-1', { [FRAGMENTO]: passo.fragments });

    const r = await h.post(`/artifacts/${INSTANCIA}/imprint`, { nonce: 'im-1' });
    expect(r.status).toBe(200);
    expect(r.body.artifact.imprint).toBe(1);
    expect(r.body.materials[FRAGMENTO]).toBe(0);
  });

  it('sem fragmento recusa', async () => {
    const h = await harness();
    const r = await h.post(`/artifacts/${INSTANCIA}/imprint`, { nonce: 'im-0' });
    expect(r.status).toBe(400);
  });
});

describe('o artefato chega à batalha', () => {
  async function atkNaCampanha(h: Awaited<ReturnType<typeof harness>>, nonce: string): Promise<number> {
    const r = await h.post('/campaign/encounter-campanha-1/matches', {
      heroIds: [heroiDe('player-1', RURIK)],
      rulesVersion: (await import('@paths-beyond/core')).RULES_VERSION,
      nonce,
    });
    expect(r.status, JSON.stringify(r.body)).toBe(201);
    const unidade = r.body.visivel.units.find((u: any) => u.unitId === `player-${heroiDe('player-1', RURIK)}`);
    return unidade.stats.atk;
  }

  it('na campanha: o mesmo herói tem mais `atk` com o artefato equipado', async () => {
    const sem = await harness();
    const atkSem = await atkNaCampanha(sem, 'camp-sem');

    const com = await harness();
    await com.post(`/artifacts/${INSTANCIA}/equip`, { nonce: 'camp-eq', heroId: heroiDe('player-1', RURIK) });
    const atkCom = await atkNaCampanha(com, 'camp-com');

    expect(atkCom).toBeGreaterThan(atkSem);
  });

  it('na arena: o artefato do atacante E o do defensor entram na montagem', async () => {
    async function montar(equipar: boolean) {
      const h = await harness();
      await h.ownershipRepository.grant('player-2', HALLA);
      await h.heroRepository.createHero(buildStoredHero(catalog, 'player-2', HALLA));
      await h.ownershipRepository.grantArtifact('player-2', { id: 'art-def', artifactId: MACHADO, awakening: 0, imprint: 0 });
      if (equipar) {
        await h.post(`/artifacts/${INSTANCIA}/equip`, { nonce: 'ar-1', heroId: heroiDe('player-1', RURIK) });
        await h.post('/artifacts/art-def/equip', { nonce: 'ar-2', heroId: heroiDe('player-2', HALLA) }, OUTRO_TOKEN);
      }
      const mapId = Object.keys(catalog.maps)[0]!;
      await h.arenaDefenseRepository.saveDefense({
        ownerPlayerId: 'player-2',
        mapId,
        units: [{ heroId: heroiDe('player-2', HALLA), pos: { x: 5, y: 0 }, height: 0, aiArchetype: 'aggressive' }],
      } as never);
      const r = await assembleArenaBattle(h.deps as unknown as BattleRoutesOptions, 'player-1', [heroiDe('player-1', RURIK)], 'player-2');
      if (!r.ok) throw new Error(r.error);
      const atk = (unitId: string) => r.setup.units.find((u) => u.unitId === unitId)!.stats.atk;
      return { atacante: atk(heroiDe('player-1', RURIK)), defensor: atk(heroiDe('player-2', HALLA)) };
    }

    const sem = await montar(false);
    const com = await montar(true);
    expect(com.atacante).toBeGreaterThan(sem.atacante);
    expect(com.defensor).toBeGreaterThan(sem.defensor);
  });
});
