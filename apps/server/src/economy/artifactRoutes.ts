import { applyArtifactImprint, awakenArtifact, equipArtifact } from '@paths-beyond/core';
import type { FastifyPluginAsync } from 'fastify';
import type { EconomyRoutesOptions } from './routes.js';

// M38 4/N (D53/D56) — o artefato JOGÁVEL: listar, equipar, desequipar, despertar e dar imprint.
//
// Nenhuma decisão de jogo aqui: a trava por classe é `equipArtifact`, o custo do awakening é
// `awakenArtifact` com a tabela de `economy.json`, e o imprint é `applyArtifactImprint` — todos
// do core desde a 1/N. O que mora aqui é autorização, idempotência (nonce, como toda ação que
// cobra ou muda estado) e persistência.
//
// Os `kind` de ação reusam os do herói (`equip`, `awaken`, `imprint`): a pergunta que o nonce
// responde é a mesma, e o `CHECK` de `economy_actions` já os conhece.

type ActionKind = 'equip' | 'awaken' | 'imprint';

export const artifactRoutes: FastifyPluginAsync<EconomyRoutesOptions> = async (fastify, opts) => {
  async function claimAction(nonce: string | undefined, playerId: string, kind: ActionKind) {
    if (!nonce) return { ok: false as const, status: 400, error: 'nonce é obrigatório' };
    if (await opts.economyRepository.getAction(nonce)) {
      return { ok: false as const, status: 409, error: 'esta ação já foi executada' };
    }
    await opts.economyRepository.saveAction({ nonce, playerId, kind, createdAt: new Date(opts.now()).toISOString() });
    return { ok: true as const };
  }

  // O artefato vem SEMPRE da conta de quem pede: o id da URL não autoriza nada sozinho.
  async function instanciaDoJogador(playerId: string, instanceId: string) {
    return (await opts.ownershipRepository.listArtifacts(playerId)).find((a) => a.id === instanceId) ?? null;
  }

  fastify.get('/me/artifacts', async (request, reply) => {
    if (!request.player) return reply.code(401).send({ error: 'missing player token' });
    return { artifacts: await opts.ownershipRepository.listArtifacts(request.player.id) };
  });

  fastify.post('/artifacts/:instanceId/equip', async (request, reply) => {
    if (!request.player) return reply.code(401).send({ error: 'missing player token' });
    const player = request.player;
    const instanceId = (request.params as { instanceId: string }).instanceId;
    const body = request.body as { nonce?: string; heroId?: string };

    const instance = await instanciaDoJogador(player.id, instanceId);
    if (!instance) return reply.code(404).send({ error: 'artefato não está na sua conta' });
    const def = opts.catalog.artifacts[instance.artifactId];
    if (!def) return reply.code(500).send({ error: 'artefato fora do catálogo' });
    if (!body.heroId) return reply.code(400).send({ error: 'heroId é obrigatório' });

    const stored = await opts.heroRepository.getHeroById(body.heroId);
    if (!stored || stored.ownerPlayerId !== player.id) return reply.code(403).send({ error: 'esse herói não é seu' });

    // A trava por CLASSE é do core; recusada antes de gastar o nonce, como o saldo no summon.
    const result = equipArtifact({ hero: stored.hero, artifact: { def, instance } });
    if (!result.ok) return reply.code(400).send({ error: result.reason });

    const claim = await claimAction(body.nonce, player.id, 'equip');
    if (!claim.ok) return reply.code(claim.status).send({ error: claim.error });

    // D56 — equipar num herói um artefato que está em OUTRO herói MOVE o artefato: uma
    // instância, um herói. Sem isso a mesma cópia iria à batalha duas vezes.
    let movedFrom: string | null = null;
    for (const outro of await opts.heroRepository.listHeroesByOwner(player.id)) {
      if (outro.hero.id !== stored.hero.id && outro.hero.artifact === instance.id) {
        await opts.heroRepository.updateHero({ ...outro, hero: { ...outro.hero, artifact: null } });
        movedFrom = outro.hero.id;
      }
    }

    const updated = await opts.heroRepository.updateHero({ ...stored, hero: result.hero });
    return { hero: updated.hero, movedFrom };
  });

  fastify.post('/heroes/:heroId/artifact/unequip', async (request, reply) => {
    if (!request.player) return reply.code(401).send({ error: 'missing player token' });
    const player = request.player;
    const heroId = (request.params as { heroId: string }).heroId;
    const body = request.body as { nonce?: string };

    const stored = await opts.heroRepository.getHeroById(heroId);
    if (!stored || stored.ownerPlayerId !== player.id) return reply.code(403).send({ error: 'esse herói não é seu' });

    const claim = await claimAction(body.nonce, player.id, 'equip');
    if (!claim.ok) return reply.code(claim.status).send({ error: claim.error });

    const updated = await opts.heroRepository.updateHero({ ...stored, hero: { ...stored.hero, artifact: null } });
    return { hero: updated.hero };
  });

  // D53 — o awakening PRÓPRIO do artefato: `adventurer` vira `hero` em 3, todos viram `legend`
  // em 6. Ouro + `material-nucleo-de-artefato`, pela tabela de `economy.json`.
  fastify.post('/artifacts/:instanceId/awaken', async (request, reply) => {
    if (!request.player) return reply.code(401).send({ error: 'missing player token' });
    const player = request.player;
    const instanceId = (request.params as { instanceId: string }).instanceId;
    const body = request.body as { nonce?: string };

    const instance = await instanciaDoJogador(player.id, instanceId);
    if (!instance) return reply.code(404).send({ error: 'artefato não está na sua conta' });

    const materials = await opts.economyRepository.getMaterials(player.id);
    const result = awakenArtifact({
      instance,
      wallet: { gold: player.gold, stones: player.stones, arenaMarks: player.arenaMarks },
      materials,
      steps: opts.catalog.economyRules.artifactAwakening ?? [],
    });
    // Recusado antes do nonce: sem recurso, nada foi feito e a chave continua usável.
    if (!result.ok) return reply.code(400).send({ error: result.reason });

    const claim = await claimAction(body.nonce, player.id, 'awaken');
    if (!claim.ok) return reply.code(claim.status).send({ error: claim.error });

    await opts.ownershipRepository.updateArtifact(player.id, result.instance);
    const wallet = await opts.repository.updateWallet(player.id, { gold: result.wallet.gold, stones: result.wallet.stones });
    await opts.economyRepository.setMaterials(player.id, result.materials);

    return {
      artifact: result.instance,
      wallet: { gold: wallet.gold, stones: wallet.stones, arenaMarks: wallet.arenaMarks },
      materials: result.materials,
    };
  });

  // O imprint consome o fragmento DAQUELE artefato, resolvido pelo catálogo (`forArtifactId`)
  // e nunca escolhido pelo cliente — o mesmo cuidado da rota de imprint de herói.
  fastify.post('/artifacts/:instanceId/imprint', async (request, reply) => {
    if (!request.player) return reply.code(401).send({ error: 'missing player token' });
    const player = request.player;
    const instanceId = (request.params as { instanceId: string }).instanceId;
    const body = request.body as { nonce?: string };

    const instance = await instanciaDoJogador(player.id, instanceId);
    if (!instance) return reply.code(404).send({ error: 'artefato não está na sua conta' });
    const fragment = Object.values(opts.catalog.materials).find(
      (m) => m.kind === 'artifactFragment' && m.forArtifactId === instance.artifactId,
    );
    if (!fragment) return reply.code(400).send({ error: 'este artefato não tem fragmento declarado no catálogo' });

    const materials = await opts.economyRepository.getMaterials(player.id);
    const result = applyArtifactImprint({ instance, materials, fragment, steps: opts.catalog.economyRules.artifactImprint ?? [] });
    if (!result.ok) return reply.code(400).send({ error: result.reason });

    const claim = await claimAction(body.nonce, player.id, 'imprint');
    if (!claim.ok) return reply.code(claim.status).send({ error: claim.error });

    await opts.ownershipRepository.updateArtifact(player.id, result.instance);
    await opts.economyRepository.setMaterials(player.id, result.materials);

    return { artifact: result.instance, materials: result.materials };
  });
};
