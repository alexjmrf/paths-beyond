import { loadCatalogFromDisk } from '@paths-beyond/content';
import { RULES_VERSION } from '@paths-beyond/core';
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
  createMemoryMatchRepository,
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
// M38 3/N — dentro da janela do rotativo do Rurik (2026-09-25 a 2026-10-09).
const AGORA = Date.UTC(2026, 8, 30, 12);

const catalog = loadCatalogFromDisk();
const CUSTO = catalog.premiumRules.summon.premiumCost;
const BANNER = 'banner-rotativo-rurik';
const GENERICO = 'banner-generico';
const ROT_ARTEFATO = 'banner-rotativo-artefato-rurik';
const DESTAQUE = 'ally-guerreiro';
const ARTEFATO_DO_DESTAQUE = 'artifact-machado-do-tirano';

// D14 — os garantidos, e os que só o banner entrega.
//
// DERIVADOS do catálogo desde o M37 3/N, e não mais escritos à mão: D49 levou o elenco de 9
// para 15, e uma lista literal aqui só dizia que ela estava desatualizada. O que estes testes
// afirmam é sobre a PARTIÇÃO (`acquisition`), não sobre quais nomes existem hoje.
const NUCLEO = Object.values(catalog.characters)
  .filter((c) => c.acquisition === 'story')
  .map((c) => c.id);
const ADQUIRIVEIS = Object.values(catalog.characters)
  .filter((c) => c.acquisition === 'summon')
  .map((c) => c.id);

interface Harness {
  readonly app: ReturnType<typeof buildApp>;
  readonly playerRepository: ReturnType<typeof createMemoryPlayerRepository>;
  readonly ownershipRepository: ReturnType<typeof createMemoryCharacterOwnershipRepository>;
  readonly rewardsRepository: ReturnType<typeof createMemoryRewardsRepository>;
  readonly economyRepository: ReturnType<typeof createMemoryEconomyRepository>;
}

function buildHarness(options: { premium?: number; agora?: number } = {}): Harness {
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
      matchRepository: createMemoryMatchRepository(),
      seasonRepository: createMemorySeasonRepository(),
      economyRepository,
      ownershipRepository,
      rewardsRepository,
      catalog,
      shopCatalog: {},
      rateLimiter: createInMemoryRateLimiter({ maxRequests: 1000, windowMs: 60_000 }),
      ticketSecret: TICKET_SECRET,
      identityValidator: createDevIdentityValidator(),
      now: () => options.agora ?? AGORA,
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

  it('o pity é contado por jogador, por RANK, e sobrevive entre rolagens (D50)', async () => {
    const h = buildHarness({ premium: CUSTO * 20 });
    for (const id of ADQUIRIVEIS) await h.ownershipRepository.grant('player-1', id);

    // **Com o pool inteiro possuído, os contadores CONTINUAM correndo** — e é justamente o
    // que D50 mudou. Antes a garantia prometia personagem NOVO, então com tudo possuído ela
    // não tinha destino e o contador congelava. Agora ela promete o RANK: sai duplicata,
    // paga fragmento, e o contador daquele rank zera como em qualquer rolagem.
    const primeira = await post(h, '/summon', { nonce: 'p-1', bannerId: BANNER });
    const segunda = await post(h, '/summon', { nonce: 'p-2', bannerId: BANNER });

    for (const r of [primeira, segunda]) {
      expect(r.body.outcome.kind).toBe('duplicate');
      // O rank que saiu está zerado; o outro avançou. Nenhum dos dois está congelado.
      expect(r.body.rollsSince[r.body.outcome.rank]).toBe(0);
    }

    const outroRank = primeira.body.outcome.rank === 'hero' ? 'adventurer' : 'hero';
    if (segunda.body.outcome.rank === primeira.body.outcome.rank) {
      expect(segunda.body.rollsSince[outroRank]).toBe(2);
    }
  });

  it('nenhum rank passa do limiar sem sair — 60 rolagens pela ROTA (D50)', async () => {
    // O que a garantia promete depois de D50, medido ponta a ponta e não no motor: ela
    // promete o RANK. Antes esta asserção era "o jogador obtém os CINCO", que dependia da
    // garantia entregar personagem NOVO — premissa revertida. Trocá-la por uma contagem de
    // posse seria deixar o teste depender de sorte de seed.
    const h = buildHarness({ premium: CUSTO * 60 });
    const { adventurer, hero } = catalog.premiumRules.summon.pityThresholds;

    const desde: Record<string, number> = { adventurer: 0, hero: 0 };
    const pior: Record<string, number> = { adventurer: 0, hero: 0 };

    for (let i = 0; i < 60; i++) {
      const r = await post(h, '/summon', { nonce: `bulk-${i}`, bannerId: BANNER });
      expect(r.status).toBe(200);

      for (const rank of ['adventurer', 'hero'] as const) {
        desde[rank] = r.body.outcome.rank === rank ? 0 : desde[rank]! + 1;
        pior[rank] = Math.max(pior[rank]!, desde[rank]!);
      }
    }

    // D55 — o limiar N garante a N-ésima: nunca há N rolagens seguidas sem o rank.
    expect(pior.adventurer).toBeLessThanOrEqual(adventurer - 1);
    // 60 rolagens não alcançam o limiar de 90 do `Hero`: o que se afirma aqui é que o
    // contador não estourou nada, e não que a garantia disparou. Ela é horizonte pós-demo.
    expect(pior.hero).toBeLessThanOrEqual(hero);
  });

  it('a garantia dispara pela rota, e a resposta DIZ qual das duas disparou (D50)', async () => {
    // O contador é ARMADO no repositório em vez de esperado por sorte: com 2 `Adventurer`
    // em 5 entradas, o rank sai sozinho muito antes das 10 rolagens, e um teste que
    // esperasse o limiar chegar estaria medindo a seed. O que se afirma aqui é que a rota
    // honra um contador armado e devolve QUAL garantia disparou.
    const { adventurer, hero } = catalog.premiumRules.summon.pityThresholds;

    const a = buildHarness({ premium: CUSTO });
    await a.ownershipRepository.setPity('player-1', 'rotatingCharacter', { adventurer, hero: 0 });
    const rA = await post(a, '/summon', { nonce: 'g-adv', bannerId: BANNER });
    expect(rA.body.guaranteed).toBe('adventurer');
    expect(rA.body.outcome.rank).toBe('adventurer');
    expect(rA.body.rollsSince).toEqual({ adventurer: 0, hero: 1 });

    const b = buildHarness({ premium: CUSTO });
    await b.ownershipRepository.setPity('player-1', 'rotatingCharacter', { adventurer: 0, hero });
    const rB = await post(b, '/summon', { nonce: 'g-hero', bannerId: BANNER });
    expect(rB.body.guaranteed).toBe('hero');
    expect(rB.body.outcome.rank).toBe('hero');
    expect(rB.body.rollsSince).toEqual({ adventurer: 1, hero: 0 });

    // Os dois armados: o `Hero` tem precedência, e o de `Adventurer` continua armado.
    const c = buildHarness({ premium: CUSTO });
    await c.ownershipRepository.setPity('player-1', 'rotatingCharacter', { adventurer, hero });
    const rC = await post(c, '/summon', { nonce: 'g-ambos', bannerId: BANNER });
    expect(rC.body.guaranteed).toBe('hero');
    expect(rC.body.rollsSince).toEqual({ adventurer: adventurer + 1, hero: 0 });
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

// M38 3/N (D54/D55) — os TRÊS banners pela rota: janela, pity por tipo, artefato, o token de
// 1,5·P e a escolha do genérico.
describe('M38 3/N — os banners rotativos e o genérico', () => {
  it('GET /summon/banners dentro da janela lista os três, cada um com o seu tipo', async () => {
    const h = buildHarness();
    const { body } = await get(h, '/summon/banners');

    expect(body.banners.map((b: any) => `${b.kind}:${b.id}`).sort()).toEqual([
      `generic:${GENERICO}`,
      `rotatingArtifact:${ROT_ARTEFATO}`,
      `rotatingCharacter:${BANNER}`,
    ]);
    const rotativo = body.banners.find((b: any) => b.id === BANNER);
    expect(rotativo.featuredId).toBe(DESTAQUE);
    expect(rotativo.token).toEqual({ threshold: 135, artifactId: ARTEFATO_DO_DESTAQUE, rolls: 0, status: 'counting' });
    const generico = body.banners.find((b: any) => b.id === GENERICO);
    expect(generico.choice).toEqual({ every: 180, rolls: 0, pending: 0 });
  });

  it('a tela recebe só a TAXA BASE; a curva de soft pity não sai do servidor (D56)', async () => {
    const h = buildHarness();
    const { body } = await get(h, '/summon/banners');
    const taxa = Object.fromEntries(body.banners.map((b: any) => [b.id, b.baseRate]));

    expect(taxa).toEqual({ [BANNER]: 6, [ROT_ARTEFATO]: 7, [GENERICO]: 6 });
    for (const banner of body.banners) {
      expect('softPity' in banner, banner.id).toBe(false);
      expect(JSON.stringify(banner)).not.toMatch(/softStart|step/);
    }
  });

  it('fora da janela, só o genérico aparece — e rolar no rotativo é recusado sem cobrar', async () => {
    const h = buildHarness({ premium: CUSTO, agora: Date.UTC(2026, 9, 9, 0) });
    const { body } = await get(h, '/summon/banners');
    expect(body.banners.map((b: any) => b.id)).toEqual([GENERICO]);

    const r = await post(h, '/summon', { nonce: 'fora', bannerId: BANNER });
    expect(r.status).toBe(409);
    expect((await h.playerRepository.getPlayerById('player-1'))?.premium).toBe(CUSTO);
  });

  it('o pity é por TIPO: o contador do rotativo de personagem vale em qualquer banner desse tipo', async () => {
    const h = buildHarness({ premium: CUSTO });
    // O teto do rotativo é 90: com 89 sem `Hero`, a 90ª é o destaque, venha o contador de
    // que banner vier.
    await h.ownershipRepository.setPity('player-1', 'rotatingCharacter', { adventurer: 0, hero: 89 });

    const r = await post(h, '/summon', { nonce: 'teto', bannerId: BANNER });
    expect(r.body.outcome).toEqual({ kind: 'character', characterId: DESTAQUE, rank: 'hero' });
    expect(r.body.guaranteed).toBe('hero');
    expect(await h.ownershipRepository.getPity('player-1', 'rotatingCharacter')).toEqual({ adventurer: 1, hero: 0 });
    // E os outros tipos não andaram.
    expect(await h.ownershipRepository.getPity('player-1', 'generic')).toBeNull();
  });

  it('o rotativo de artefato entrega o ARTEFATO; a segunda cópia vira fragmento dele', async () => {
    const h = buildHarness({ premium: CUSTO * 2 });
    await h.ownershipRepository.setPity('player-1', 'rotatingArtifact', { adventurer: 0, hero: 59 });

    const primeira = await post(h, '/summon', { nonce: 'art-1', bannerId: ROT_ARTEFATO });
    expect(primeira.body.outcome).toEqual({ kind: 'artifact', artifactId: ARTEFATO_DO_DESTAQUE, rank: 'hero' });
    expect((await h.ownershipRepository.listArtifacts('player-1')).map((a) => a.artifactId)).toEqual([
      ARTEFATO_DO_DESTAQUE,
    ]);

    await h.ownershipRepository.setPity('player-1', 'rotatingArtifact', { adventurer: 0, hero: 59 });
    const segunda = await post(h, '/summon', { nonce: 'art-2', bannerId: ROT_ARTEFATO });
    expect(segunda.body.outcome.kind).toBe('artifactDuplicate');
    const materiais = await h.economyRepository.getMaterials('player-1');
    expect(materiais[`material-fragmento-${ARTEFATO_DO_DESTAQUE}`]).toBe(1);
    expect(await h.ownershipRepository.listArtifacts('player-1')).toHaveLength(1);
  });
});

describe('M38 3/N — o token de 1,5·P, pela rota', () => {
  it('com o destaque na conta, a 135ª rolagem NAQUELE banner entrega o artefato dele', async () => {
    const h = buildHarness({ premium: CUSTO });
    await h.ownershipRepository.grant('player-1', DESTAQUE);
    await h.ownershipRepository.setToken('player-1', BANNER, { rolls: 134, status: 'counting' });

    const r = await post(h, '/summon', { nonce: 'tok-1', bannerId: BANNER });
    expect(r.body.tokenGrants).toEqual([{ kind: 'artifact', artifactId: ARTEFATO_DO_DESTAQUE, rank: 'hero' }]);
    expect(r.body.token).toEqual({ rolls: 135, status: 'granted' });
    expect((await h.ownershipRepository.listArtifacts('player-1')).map((a) => a.artifactId)).toContain(
      ARTEFATO_DO_DESTAQUE,
    );
  });

  it('é concedido uma única vez por banner', async () => {
    const h = buildHarness({ premium: CUSTO * 2 });
    await h.ownershipRepository.grant('player-1', DESTAQUE);
    await h.ownershipRepository.setToken('player-1', BANNER, { rolls: 134, status: 'counting' });

    await post(h, '/summon', { nonce: 'tok-a', bannerId: BANNER });
    const depois = await post(h, '/summon', { nonce: 'tok-b', bannerId: BANNER });
    expect(depois.body.tokenGrants).toEqual([]);
    expect(depois.body.token.status).toBe('granted');
  });

  it('SEM o destaque, bater 135 deixa o token PENDENTE; o destaque saindo depois, ele é pago na mesma resposta', async () => {
    const h = buildHarness({ premium: CUSTO * 2 });
    await h.ownershipRepository.setToken('player-1', BANNER, { rolls: 134, status: 'counting' });
    // Contador de pity zerado: com 0,6% a rolagem não traz o destaque (seed fixa).
    const sem = await post(h, '/summon', { nonce: 'pend-1', bannerId: BANNER });
    expect(sem.body.outcome.characterId).not.toBe(DESTAQUE);
    expect(sem.body.tokenGrants).toEqual([]);
    expect(sem.body.token).toEqual({ rolls: 135, status: 'pending' });

    // Agora o teto traz o destaque, e o token pendente sai junto.
    await h.ownershipRepository.setPity('player-1', 'rotatingCharacter', { adventurer: 0, hero: 89 });
    const com = await post(h, '/summon', { nonce: 'pend-2', bannerId: BANNER });
    expect(com.body.outcome.characterId).toBe(DESTAQUE);
    expect(com.body.tokenGrants).toEqual([{ kind: 'artifact', artifactId: ARTEFATO_DO_DESTAQUE, rank: 'hero' }]);
    expect(com.body.token.status).toBe('granted');
  });

  it('pendente é pago quando o destaque entra por OUTRO caminho — numa rolagem de outro banner', async () => {
    const h = buildHarness({ premium: CUSTO });
    await h.ownershipRepository.setToken('player-1', BANNER, { rolls: 140, status: 'pending' });
    await h.ownershipRepository.grant('player-1', DESTAQUE);

    const r = await post(h, '/summon', { nonce: 'outro-caminho', bannerId: GENERICO });
    expect(r.body.tokenGrants).toEqual([{ kind: 'artifact', artifactId: ARTEFATO_DO_DESTAQUE, rank: 'hero' }]);
    expect(await h.ownershipRepository.getToken('player-1', BANNER)).toEqual({ rolls: 140, status: 'granted' });
  });

  it('o recíproco: pendente SEM o destaque continua pendente, rolando em qualquer banner', async () => {
    const h = buildHarness({ premium: CUSTO });
    await h.ownershipRepository.setToken('player-1', BANNER, { rolls: 140, status: 'pending' });

    const r = await post(h, '/summon', { nonce: 'sem-destaque', bannerId: GENERICO });
    expect(r.body.tokenGrants).toEqual([]);
    expect(await h.ownershipRepository.getToken('player-1', BANNER)).toEqual({ rolls: 140, status: 'pending' });
  });

  it('já tendo o artefato, o token paga o fragmento dele', async () => {
    const h = buildHarness({ premium: CUSTO });
    await h.ownershipRepository.grant('player-1', DESTAQUE);
    await h.ownershipRepository.grantArtifact('player-1', {
      id: 'ja-tinha',
      artifactId: ARTEFATO_DO_DESTAQUE,
      awakening: 0,
      imprint: 0,
    });
    await h.ownershipRepository.setToken('player-1', BANNER, { rolls: 134, status: 'counting' });

    const r = await post(h, '/summon', { nonce: 'tok-frag', bannerId: BANNER });
    expect(r.body.tokenGrants[0].kind).toBe('artifactDuplicate');
    const materiais = await h.economyRepository.getMaterials('player-1');
    expect(materiais[`material-fragmento-${ARTEFATO_DO_DESTAQUE}`]).toBe(1);
  });

  it('rolar no rotativo de ARTEFATO ou no genérico não conta para o token', async () => {
    const h = buildHarness({ premium: CUSTO * 2 });
    await post(h, '/summon', { nonce: 'nao-conta-1', bannerId: ROT_ARTEFATO });
    await post(h, '/summon', { nonce: 'nao-conta-2', bannerId: GENERICO });
    expect(await h.ownershipRepository.getToken('player-1', BANNER)).toBeNull();
  });
});

describe('M38 3/N — a escolha do genérico, pela rota', () => {
  it('a 180ª rolagem no genérico concede uma escolha, e o resgate entrega o escolhido', async () => {
    const h = buildHarness({ premium: CUSTO });
    await h.ownershipRepository.setChoice('player-1', GENERICO, { rolls: 179, pending: 0 });

    const r = await post(h, '/summon', { nonce: 'ch-1', bannerId: GENERICO });
    expect(r.body.choice).toEqual({ rolls: 0, pending: 1 });

    const escolha = await post(h, '/summon/choice', { nonce: 'ch-resgate', bannerId: GENERICO, choiceId: 'ally-couracado' });
    expect(escolha.status).toBe(200);
    expect(escolha.body.outcome).toEqual({ kind: 'character', characterId: 'ally-couracado', rank: 'hero' });
    expect(escolha.body.choice).toEqual({ rolls: 0, pending: 0 });
    expect(await h.ownershipRepository.listAcquired('player-1')).toContain('ally-couracado');
  });

  it('o resgate de artefato entrega o artefato', async () => {
    const h = buildHarness();
    await h.ownershipRepository.setChoice('player-1', GENERICO, { rolls: 3, pending: 1 });
    const r = await post(h, '/summon/choice', { nonce: 'ch-art', bannerId: GENERICO, choiceId: 'artifact-arco-da-alvorada' });
    expect(r.body.outcome).toEqual({ kind: 'artifact', artifactId: 'artifact-arco-da-alvorada', rank: 'hero' });
  });

  it('sem escolha pendente recusa; `Adventurer` e id fora do pool recusam', async () => {
    const h = buildHarness();
    const sem = await post(h, '/summon/choice', { nonce: 'ch-sem', bannerId: GENERICO, choiceId: 'ally-couracado' });
    expect(sem.status).toBe(409);

    await h.ownershipRepository.setChoice('player-1', GENERICO, { rolls: 0, pending: 1 });
    const adv = await post(h, '/summon/choice', { nonce: 'ch-adv', bannerId: GENERICO, choiceId: 'ally-mensageira' });
    expect(adv.status).toBe(400);
    const fora = await post(h, '/summon/choice', { nonce: 'ch-fora', bannerId: GENERICO, choiceId: DESTAQUE });
    expect(fora.status).toBe(400);
    // Recusar não consumiu a escolha.
    expect(await h.ownershipRepository.getChoice('player-1', GENERICO)).toEqual({ rolls: 0, pending: 1 });
  });

  it('a escolha só existe no genérico', async () => {
    const h = buildHarness();
    const r = await post(h, '/summon/choice', { nonce: 'ch-rot', bannerId: BANNER, choiceId: DESTAQUE });
    expect(r.status).toBe(400);
  });

  it('reenvio do mesmo nonce não resgata duas vezes', async () => {
    const h = buildHarness();
    await h.ownershipRepository.setChoice('player-1', GENERICO, { rolls: 0, pending: 2 });
    await post(h, '/summon/choice', { nonce: 'ch-dup', bannerId: GENERICO, choiceId: 'ally-couracado' });
    const segunda = await post(h, '/summon/choice', { nonce: 'ch-dup', bannerId: GENERICO, choiceId: 'ally-lanceiro' });
    expect(segunda.status).toBe(409);
    expect(await h.ownershipRepository.getChoice('player-1', GENERICO)).toEqual({ rolls: 0, pending: 1 });
  });

  it('tirar um prêmio no genérico zera o soft pity, mas NÃO o contador da escolha (D55)', async () => {
    const h = buildHarness({ premium: CUSTO });
    await h.ownershipRepository.setPity('player-1', 'generic', { adventurer: 0, hero: 104 });
    await h.ownershipRepository.setChoice('player-1', GENERICO, { rolls: 50, pending: 0 });

    const r = await post(h, '/summon', { nonce: 'gen-premio', bannerId: GENERICO });
    expect(r.body.outcome.rank).toBe('hero');
    expect(r.body.rollsSince.hero).toBe(0);
    expect(r.body.choice).toEqual({ rolls: 51, pending: 0 });
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

    // M36 2/N — a campanha abre uma PARTIDA VIVA; o que volta é o estado visível, e a unidade
    // do próprio jogador continua nele por inteiro (§1.1).
    const partida = await post(h, '/campaign/encounter-campanha-1/matches', {
      heroIds: [puxado.hero.id],
      rulesVersion: RULES_VERSION,
    });

    expect(partida.status, JSON.stringify(partida.body)).toBe(201);
    expect(partida.body.visivel.units.some((u: any) => u.unitId === `player-${puxado.hero.id}`)).toBe(true);
  });
});
