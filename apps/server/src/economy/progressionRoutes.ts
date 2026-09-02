import {
  ENHANCE_MILESTONES,
  applyImprint,
  attemptEnhance,
  awaken,
} from '@paths-beyond/core';
import type { FastifyPluginAsync } from 'fastify';
import { deriveSeed } from '../battle/ticket.js';
import type { EconomyRoutesOptions } from './routes.js';

// §10 (M14, sub-sessão 4/N) — as rotas de progressão: enhance, equipar, awakening e
// imprint. As quatro cobram recurso, e as quatro já têm a REGRA no core (M4 para o
// enhance; M14 1/N para awakening e imprint). Aqui só há autorização, ordem das operações
// e persistência — nenhuma decisão de jogo.
//
// Todas exigem `nonce` pela mesma razão que a masmorra e a batalha de arena: um reenvio de
// rede não pode cobrar duas vezes. O cliente não sabe se a primeira requisição chegou; o
// servidor sabe.

type ActionKind = 'enhance' | 'awaken' | 'imprint' | 'equip';

export const progressionRoutes: FastifyPluginAsync<EconomyRoutesOptions> = async (fastify, opts) => {
  async function claimAction(
    nonce: string | undefined,
    playerId: string,
    kind: ActionKind,
  ): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
    if (!nonce) return { ok: false, status: 400, error: 'nonce é obrigatório' };
    const existing = await opts.economyRepository.getAction(nonce);
    if (existing) return { ok: false, status: 409, error: 'esta ação já foi executada' };
    await opts.economyRepository.saveAction({
      nonce,
      playerId,
      kind,
      createdAt: new Date(opts.now()).toISOString(),
    });
    return { ok: true };
  }

  // §10 — "Awakening (0–6): multiplica a curva base e libera nós avançados de talento a
  // partir de 5." Consome material de chefe + ouro (decisão do usuário, M14 1/N).
  fastify.post('/heroes/:heroId/awaken', async (request, reply) => {
    if (!request.player) return reply.code(401).send({ error: 'missing player token' });
    const player = request.player;
    const heroId = (request.params as { heroId: string }).heroId;
    const body = request.body as { nonce?: string };

    const stored = await opts.heroRepository.getHeroById(heroId);
    if (!stored || stored.ownerPlayerId !== player.id) return reply.code(403).send({ error: 'esse herói não é seu' });

    const claim = await claimAction(body.nonce, player.id, 'awaken');
    if (!claim.ok) return reply.code(claim.status).send({ error: claim.error });

    const materials = await opts.economyRepository.getMaterials(player.id);
    const result = awaken({
      hero: stored.hero,
      wallet: { gold: player.gold, stones: player.stones, arenaMarks: player.arenaMarks },
      materials,
      steps: opts.catalog.economyRules.awakening,
    });
    if (!result.ok) return reply.code(400).send({ error: result.reason });

    await opts.heroRepository.updateHero({ ...stored, hero: result.hero });
    const wallet = await opts.repository.updateWallet(player.id, {
      gold: result.wallet.gold,
      stones: result.wallet.stones,
    });
    await opts.economyRepository.setMaterials(player.id, result.materials);

    return {
      hero: result.hero,
      wallet: { gold: wallet.gold, stones: wallet.stones, arenaMarks: wallet.arenaMarks },
      materials: result.materials,
    };
  });

  // §10 — "Imprint: duplicatas viram bônus permanente de stat." O fragmento é resolvido
  // pelo CATÁLOGO (`forCharacterId`, desde M18 2/N), não escolhido pelo cliente: aceitar um
  // id no corpo daria ao cliente a chance de propor o fragmento de outro personagem. O
  // motor recusaria — mas a rota nem deve oferecer a pergunta.
  fastify.post('/heroes/:heroId/imprint', async (request, reply) => {
    if (!request.player) return reply.code(401).send({ error: 'missing player token' });
    const player = request.player;
    const heroId = (request.params as { heroId: string }).heroId;
    const body = request.body as { nonce?: string };

    const stored = await opts.heroRepository.getHeroById(heroId);
    if (!stored || stored.ownerPlayerId !== player.id) return reply.code(403).send({ error: 'esse herói não é seu' });

    // M18 2/N — a busca é pelo PERSONAGEM. Um herói sem `characterId` não tem fragmento a
    // encontrar, e isso agora é dito em vez de virar um `find` que nunca acha.
    if (stored.hero.characterId === undefined) {
      return reply.code(400).send({ error: 'este herói não é um personagem e não tem imprint' });
    }
    const characterId = stored.hero.characterId;
    const fragment = Object.values(opts.catalog.materials).find(
      (material) => material.kind === 'heroFragment' && material.forCharacterId === characterId,
    );
    if (!fragment) {
      return reply.code(400).send({ error: 'este personagem não tem fragmento declarado no catálogo' });
    }

    const claim = await claimAction(body.nonce, player.id, 'imprint');
    if (!claim.ok) return reply.code(claim.status).send({ error: claim.error });

    const materials = await opts.economyRepository.getMaterials(player.id);
    const result = applyImprint({
      hero: stored.hero,
      materials,
      fragment,
      steps: opts.catalog.economyRules.imprint,
    });
    if (!result.ok) return reply.code(400).send({ error: result.reason });

    await opts.heroRepository.updateHero({ ...stored, hero: result.hero });
    await opts.economyRepository.setMaterials(player.id, result.materials);

    return { hero: result.hero, materials: result.materials };
  });

  // §7.3 — enhance. A chance de sucesso vem do dado (`enhance-rates`) e o custo é pedras +
  // ouro (decisão do usuário, M14 2/N). **Falhar cobra igual**: uma chance que não custa
  // nada não é chance, e §7.3 descreve a chance decrescente como o freio do sistema.
  fastify.post('/items/:itemId/enhance', async (request, reply) => {
    if (!request.player) return reply.code(401).send({ error: 'missing player token' });
    const player = request.player;
    const itemId = (request.params as { itemId: string }).itemId;
    const body = request.body as { nonce?: string; heroId?: string };

    // O item pode estar no inventário ou já equipado — enhance vale nos dois casos.
    const fromInventory = await opts.economyRepository.getItem(player.id, itemId);
    const heroWithItem = body.heroId ? await opts.heroRepository.getHeroById(body.heroId) : null;
    if (heroWithItem && heroWithItem.ownerPlayerId !== player.id) {
      return reply.code(403).send({ error: 'esse herói não é seu' });
    }
    const equipped = heroWithItem?.equippedItems.find((item) => item.id === itemId) ?? null;

    const item = fromInventory ?? equipped;
    if (!item) return reply.code(404).send({ error: 'item não encontrado' });

    // §7.3 — os 5 marcos (+0→+3 … +12→+15). O índice do custo é o marco que a tentativa
    // ataca; no último não há marco seguinte.
    const milestoneIndex = ENHANCE_MILESTONES.indexOf(item.enhance);
    const cost = opts.catalog.economyRules.enhance[milestoneIndex];
    if (!cost) return reply.code(400).send({ error: 'este item já está no enhance máximo' });

    if (player.gold < cost.gold) {
      return reply.code(400).send({ error: `ouro insuficiente: ${player.gold} de ${cost.gold}` });
    }
    if (player.stones < cost.stones) {
      return reply.code(400).send({ error: `pedras insuficientes: ${player.stones} de ${cost.stones}` });
    }

    const claim = await claimAction(body.nonce, player.id, 'enhance');
    if (!claim.ok) return reply.code(claim.status).send({ error: claim.error });

    // A seed sai do nonce por HMAC, como todo o resto: sem isso o cliente escolheria QUANDO
    // tentar, e a chance de §7.3 viraria decoração.
    const result = attemptEnhance({
      item,
      seed: deriveSeed(opts.ticketSecret, `${body.nonce}:enhance`),
      rates: opts.catalog.enhanceRates,
      substatWeights: opts.catalog.substatWeights,
    });

    const wallet = await opts.repository.updateWallet(player.id, {
      gold: player.gold - cost.gold,
      stones: player.stones - cost.stones,
    });

    if (fromInventory) {
      await opts.economyRepository.replaceItem(player.id, result.item);
    } else if (heroWithItem) {
      await opts.heroRepository.updateHero({
        ...heroWithItem,
        equippedItems: heroWithItem.equippedItems.map((equippedItem) =>
          equippedItem.id === itemId ? result.item : equippedItem,
        ),
      });
    }

    return {
      success: result.success,
      item: result.item,
      cost,
      wallet: { gold: wallet.gold, stones: wallet.stones, arenaMarks: wallet.arenaMarks },
    };
  });

  // Equipar o que dropou: o item sai do inventário e entra no slot; o que estava no slot
  // VOLTA para o inventário — nada some. É o passo do ciclo de aceite entre "drop" e
  // "subir de poder".
  fastify.post('/heroes/:heroId/equip', async (request, reply) => {
    if (!request.player) return reply.code(401).send({ error: 'missing player token' });
    const player = request.player;
    const heroId = (request.params as { heroId: string }).heroId;
    const body = request.body as { nonce?: string; itemId?: string };

    const stored = await opts.heroRepository.getHeroById(heroId);
    if (!stored || stored.ownerPlayerId !== player.id) return reply.code(403).send({ error: 'esse herói não é seu' });
    if (!body.itemId) return reply.code(400).send({ error: 'itemId é obrigatório' });

    const item = await opts.economyRepository.getItem(player.id, body.itemId);
    if (!item) return reply.code(404).send({ error: 'item não está no seu inventário' });

    const claim = await claimAction(body.nonce, player.id, 'equip');
    if (!claim.ok) return reply.code(claim.status).send({ error: claim.error });

    const replaced = stored.equippedItems.find((equipped) => equipped.slot === item.slot) ?? null;
    const updated = {
      ...stored,
      hero: { ...stored.hero, equipment: { ...stored.hero.equipment, [item.slot]: item.id } },
      equippedItems: [...stored.equippedItems.filter((equipped) => equipped.slot !== item.slot), item],
    };

    await opts.heroRepository.updateHero(updated);
    await opts.economyRepository.removeItem(player.id, item.id);
    if (replaced) await opts.economyRepository.addItems(player.id, [replaced]);

    return { hero: updated.hero, equippedItems: updated.equippedItems, unequipped: replaced };
  });
};
