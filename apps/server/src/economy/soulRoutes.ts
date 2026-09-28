import { craftSoul, equipSoul, recraftSoul } from '@paths-beyond/core';
import type { FastifyPluginAsync } from 'fastify';
import { deriveSeed } from '../battle/ticket.js';
import { ownedCharacterIds } from '../summon/ownership.js';
import type { EconomyRoutesOptions } from './routes.js';

// M39 4/N (D59/D61) — a Soul JOGÁVEL: listar, craftar, recraftar, equipar e desequipar.
//
// Nenhuma decisão de jogo aqui: o sorteio e a cobrança são `craftSoul`/`recraftSoul`, a trava de
// nível e de personagem é `equipSoul` — todos do core (2/N) — e os números vêm de
// `economy.json` (3/N). O que mora aqui é autorização, idempotência (nonce) e persistência.
//
// Craft, recraft e descartar (D64) usam o kind `soul`; equipar e desequipar reusam `equip`, como o artefato.
// A seed de cada sorteio sai do nonce por HMAC, como todo sorteio do servidor: sem o segredo, o
// cliente não escolhe o que sai.

type ActionKind = 'soul' | 'equip';

export const soulRoutes: FastifyPluginAsync<EconomyRoutesOptions> = async (fastify, opts) => {
  async function claimAction(nonce: string | undefined, playerId: string, kind: ActionKind) {
    if (!nonce) return { ok: false as const, status: 400, error: 'nonce é obrigatório' };
    if (await opts.economyRepository.getAction(nonce)) {
      return { ok: false as const, status: 409, error: 'esta ação já foi executada' };
    }
    await opts.economyRepository.saveAction({ nonce, playerId, kind, createdAt: new Date(opts.now()).toISOString() });
    return { ok: true as const };
  }

  // A Soul vem SEMPRE da conta de quem pede: o id da URL não autoriza nada sozinho.
  async function soulDoJogador(playerId: string, soulId: string) {
    return (await opts.ownershipRepository.listSouls(playerId)).find((s) => s.id === soulId) ?? null;
  }

  function regras() {
    const soul = opts.catalog.economyRules.soul;
    if (!soul) throw new Error('o catálogo não declara as regras da Soul (economy.json, bloco `soul`)');
    return soul;
  }

  const carteira = (p: { gold: number; stones: number; arenaMarks: number }) => ({ gold: p.gold, stones: p.stones, arenaMarks: p.arenaMarks });

  fastify.get('/me/souls', async (request, reply) => {
    if (!request.player) return reply.code(401).send({ error: 'missing player token' });
    return { souls: await opts.ownershipRepository.listSouls(request.player.id) };
  });

  fastify.post('/souls/craft', async (request, reply) => {
    if (!request.player) return reply.code(401).send({ error: 'missing player token' });
    const player = request.player;
    const body = request.body as { nonce?: string; characterId?: string };
    if (!body.nonce) return reply.code(400).send({ error: 'nonce é obrigatório' });
    if (!body.characterId) return reply.code(400).send({ error: 'characterId é obrigatório' });

    const def = opts.catalog.characterSouls[body.characterId];
    if (!def) return reply.code(404).send({ error: 'personagem fora do elenco' });
    // §9.4 — craftar para um personagem que a conta não tem seria posse de Soul sem dono jogável.
    const owned = await ownedCharacterIds(opts.ownershipRepository, opts.catalog, player.id);
    if (!owned.has(body.characterId)) return reply.code(403).send({ error: `você não possui: ${body.characterId}` });

    const materials = await opts.economyRepository.getMaterials(player.id);
    const result = craftSoul({
      id: `soul-${player.id}-${body.nonce}`,
      characterId: body.characterId,
      def,
      rules: regras(),
      wallet: carteira(player),
      materials,
      seed: deriveSeed(opts.ticketSecret, `${body.nonce}:soul`),
    });
    // Recusado antes do nonce: sem recurso, nada foi feito e a chave continua usável.
    if (!result.ok) return reply.code(400).send({ error: result.reason });

    const claim = await claimAction(body.nonce, player.id, 'soul');
    if (!claim.ok) return reply.code(claim.status).send({ error: claim.error });

    await opts.ownershipRepository.grantSoul(player.id, result.soul);
    const wallet = await opts.repository.updateWallet(player.id, { gold: result.wallet.gold, stones: result.wallet.stones });
    await opts.economyRepository.setMaterials(player.id, result.materials);

    return reply.code(201).send({ soul: result.soul, wallet: carteira(wallet), materials: result.materials });
  });

  fastify.post('/souls/:soulId/recraft', async (request, reply) => {
    if (!request.player) return reply.code(401).send({ error: 'missing player token' });
    const player = request.player;
    const soulId = (request.params as { soulId: string }).soulId;
    const body = request.body as { nonce?: string };
    if (!body.nonce) return reply.code(400).send({ error: 'nonce é obrigatório' });

    const soul = await soulDoJogador(player.id, soulId);
    if (!soul) return reply.code(404).send({ error: 'Soul não está na sua conta' });
    const def = opts.catalog.characterSouls[soul.soulOf];
    if (!def) return reply.code(500).send({ error: 'personagem da Soul fora do catálogo' });

    const materials = await opts.economyRepository.getMaterials(player.id);
    const result = recraftSoul({
      soul,
      def,
      rules: regras(),
      wallet: carteira(player),
      materials,
      seed: deriveSeed(opts.ticketSecret, `${body.nonce}:soul`),
    });
    if (!result.ok) return reply.code(400).send({ error: result.reason });

    const claim = await claimAction(body.nonce, player.id, 'soul');
    if (!claim.ok) return reply.code(claim.status).send({ error: claim.error });

    await opts.ownershipRepository.updateSoul(player.id, result.soul);
    const wallet = await opts.repository.updateWallet(player.id, { gold: result.wallet.gold, stones: result.wallet.stones });
    await opts.economyRepository.setMaterials(player.id, result.materials);

    return { soul: result.soul, wallet: carteira(wallet), materials: result.materials };
  });

  fastify.post('/souls/:soulId/equip', async (request, reply) => {
    if (!request.player) return reply.code(401).send({ error: 'missing player token' });
    const player = request.player;
    const soulId = (request.params as { soulId: string }).soulId;
    const body = request.body as { nonce?: string; heroId?: string };

    const soul = await soulDoJogador(player.id, soulId);
    if (!soul) return reply.code(404).send({ error: 'Soul não está na sua conta' });
    if (!body.heroId) return reply.code(400).send({ error: 'heroId é obrigatório' });

    const stored = await opts.heroRepository.getHeroById(body.heroId);
    if (!stored || stored.ownerPlayerId !== player.id) return reply.code(403).send({ error: 'esse herói não é seu' });

    // A trava de nível e de personagem é do core; recusada antes de gastar o nonce.
    const result = equipSoul({ hero: stored.hero, soul, rules: regras() });
    if (!result.ok) return reply.code(400).send({ error: result.reason });

    const claim = await claimAction(body.nonce, player.id, 'equip');
    if (!claim.ok) return reply.code(claim.status).send({ error: claim.error });

    // Uma instância, um herói — como o artefato (D56). Com um herói por personagem na conta isto
    // não dispara hoje, mas é o que impede a mesma Soul de ir à batalha duas vezes.
    for (const outro of await opts.heroRepository.listHeroesByOwner(player.id)) {
      if (outro.hero.id !== stored.hero.id && outro.hero.soul === soul.id) {
        await opts.heroRepository.updateHero({ ...outro, hero: { ...outro.hero, soul: null } });
      }
    }

    const updated = await opts.heroRepository.updateHero({ ...stored, hero: result.hero });
    return { hero: updated.hero };
  });

  fastify.post('/heroes/:heroId/soul/unequip', async (request, reply) => {
    if (!request.player) return reply.code(401).send({ error: 'missing player token' });
    const player = request.player;
    const heroId = (request.params as { heroId: string }).heroId;
    const body = request.body as { nonce?: string };

    const stored = await opts.heroRepository.getHeroById(heroId);
    if (!stored || stored.ownerPlayerId !== player.id) return reply.code(403).send({ error: 'esse herói não é seu' });

    const claim = await claimAction(body.nonce, player.id, 'equip');
    if (!claim.ok) return reply.code(claim.status).send({ error: claim.error });

    const updated = await opts.heroRepository.updateHero({ ...stored, hero: { ...stored.hero, soul: null } });
    return { hero: updated.hero };
  });

  // D64 — descartar. Sem reembolso (a spec não prevê nenhum). Soul EQUIPADA é recusada: apagá-la
  // deixaria o herói apontando para uma Soul que não existe, e a montagem de batalha falha alto
  // nesse caso. A recusa vem antes do nonce, como nas outras rotas.
  fastify.post('/souls/:soulId/discard', async (request, reply) => {
    if (!request.player) return reply.code(401).send({ error: 'missing player token' });
    const player = request.player;
    const soulId = (request.params as { soulId: string }).soulId;
    const body = request.body as { nonce?: string };
    if (!body.nonce) return reply.code(400).send({ error: 'nonce é obrigatório' });

    const soul = await soulDoJogador(player.id, soulId);
    if (!soul) return reply.code(404).send({ error: 'Soul não está na sua conta' });

    const comQuem = (await opts.heroRepository.listHeroesByOwner(player.id)).find((s) => s.hero.soul === soul.id);
    if (comQuem) return reply.code(409).send({ error: `a Soul está equipada em ${comQuem.hero.id}; desequipe antes` });

    const claim = await claimAction(body.nonce, player.id, 'soul');
    if (!claim.ok) return reply.code(claim.status).send({ error: claim.error });

    await opts.ownershipRepository.deleteSoul(player.id, soul.id);
    return { discarded: soul.id };
  });
};
