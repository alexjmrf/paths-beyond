import { resolveEnergy, type EnergyState } from '@paths-beyond/core';
import type { ContentCatalog } from '@paths-beyond/content';
import { INITIAL_PITY, rollSummon, type BannerDef } from '@paths-beyond/gacha';
import type { FastifyPluginAsync } from 'fastify';
import { deriveSeed } from '../battle/ticket.js';
import type {
  CharacterOwnershipRepository,
  EconomyRepository,
  Player,
  PlayerRepository,
} from '../repository/types.js';
import { ownedCharacterIds, storyCharacterIds } from './ownership.js';

// §10 (M18, sub-sessão 3/N) — a aquisição de personagens.
//
// O que este arquivo NÃO faz: decidir. Quem sai do banner, se a garantia de pity vale e o
// que a duplicata devolve são perguntas de `packages/gacha`; quanto custa é de
// `packages/data`. Aqui só há I/O, autorização e a ordem das operações — o mesmo recorte
// de `economy/routes.ts`.
//
// A seed sai do nonce por HMAC, como todo sorteio do projeto desde M13 2/N: sem isso o
// cliente escolheria QUANDO invocar até sair o que ele quer. E a idempotência reusa o
// `EconomyActionRecord` de M14 4/N em vez de inventar mecanismo novo — o problema é
// literalmente o mesmo (reenvio de rede não pode cobrar duas vezes).

export interface SummonRoutesOptions {
  readonly repository: PlayerRepository;
  readonly economyRepository: EconomyRepository;
  readonly ownershipRepository: CharacterOwnershipRepository;
  readonly catalog: ContentCatalog;
  readonly ticketSecret: string;
  readonly now: () => number;
}

interface SummonBody {
  readonly nonce?: string;
  readonly bannerId?: string;
}

interface EnergyPurchaseBody {
  readonly nonce?: string;
}

export const summonRoutes: FastifyPluginAsync<SummonRoutesOptions> = async (fastify, opts) => {
  async function claim(
    nonce: string | undefined,
    playerId: string,
    kind: 'summon' | 'energy',
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

  // O roster do jogador: quem ele tem, quem existe, e o que falta. É a resposta que o
  // cliente precisa para montar uma party e para desenhar a tela de invocação — e é a
  // primeira vez no projeto que "quem o jogador tem" é uma pergunta respondível.
  fastify.get('/me/roster', async (request, reply) => {
    if (!request.player) return reply.code(401).send({ error: 'missing player token' });
    const player = request.player;

    const owned = await ownedCharacterIds(opts.ownershipRepository, opts.catalog, player.id);
    const story = new Set(storyCharacterIds(opts.catalog));

    return {
      premium: player.premium,
      characters: Object.values(opts.catalog.characters)
        .map((character) => ({
          id: character.id,
          name: character.name,
          classId: character.classId,
          acquisition: character.acquisition,
          owned: owned.has(character.id),
          // Redundante com `acquisition`, e de propósito: a tela precisa distinguir
          // "tenho porque é de todo mundo" de "tenho porque puxei", e derivar isso no
          // cliente seria a regra de D14 vivendo em dois lugares.
          fromStory: story.has(character.id),
        }))
        .sort((a, b) => a.id.localeCompare(b.id)),
    };
  });

  fastify.get('/summon/banners', async (request, reply) => {
    if (!request.player) return reply.code(401).send({ error: 'missing player token' });
    const player = request.player;

    const banners = await Promise.all(
      Object.values(opts.catalog.banners).map(async (banner) => ({
        id: banner.id,
        name: banner.name,
        pityThreshold: banner.pityThreshold,
        premiumCost: opts.catalog.premiumRules.summon.premiumCost,
        rollsSinceNew: (await opts.ownershipRepository.getPity(player.id, banner.id)) ?? INITIAL_PITY.rollsSinceNew,
        pool: banner.pool.map((entry) => ({ characterId: entry.characterId, weight: entry.weight })),
      })),
    );

    return { premium: player.premium, banners };
  });

  fastify.post('/summon', async (request, reply) => {
    if (!request.player) return reply.code(401).send({ error: 'missing player token' });
    const player = request.player;
    const body = request.body as SummonBody;

    const banner = body.bannerId ? opts.catalog.banners[body.bannerId] : undefined;
    if (!banner) return reply.code(404).send({ error: 'banner desconhecido' });

    const cost = opts.catalog.premiumRules.summon.premiumCost;
    // Cobrado ANTES de reservar o nonce: recusar por saldo não deve queimar a chave de
    // idempotência, senão o jogador que juntar a moeda não consegue reusar o mesmo nonce.
    if (player.premium < cost) {
      return reply.code(400).send({ error: 'moeda premium insuficiente' });
    }

    const claimed = await claim(body.nonce, player.id, 'summon');
    if (!claimed.ok) return reply.code(claimed.status).send({ error: claimed.error });

    const owned = await ownedCharacterIds(opts.ownershipRepository, opts.catalog, player.id);
    const pity = {
      rollsSinceNew: (await opts.ownershipRepository.getPity(player.id, banner.id)) ?? INITIAL_PITY.rollsSinceNew,
    };

    const result = rollSummon({
      banner: banner as BannerDef,
      owned: [...owned],
      pity,
      // A seed é DERIVADA do nonce por HMAC (ver battle/ticket.ts): sem o segredo, o
      // cliente não tem como procurar um nonce que produza a rolagem que ele quer. O
      // sufixo mantém o stream separado do da batalha que usasse o mesmo nonce.
      seed: deriveSeed(opts.ticketSecret, `${body.nonce!}:summon`),
      rollId: `${player.id}:${banner.id}:${body.nonce!}`,
    });

    await opts.ownershipRepository.setPity(player.id, banner.id, result.pity.rollsSinceNew);

    const updatedPlayer = await opts.repository.updatePremium(player.id, player.premium - cost);

    if (result.outcome.kind === 'character') {
      await opts.ownershipRepository.grant(player.id, result.outcome.characterId);
      return {
        outcome: result.outcome,
        premium: updatedPlayer.premium,
        rollsSinceNew: result.pity.rollsSinceNew,
      };
    }

    // Duplicata: vira fragmento DO PRÓPRIO personagem, que é o que alimenta o `imprint`
    // de §10. O id do material vem do banner (o motor não pode derivá-lo — regra 4).
    const materials = await opts.economyRepository.getMaterials(player.id);
    const fragmentId = result.outcome.fragmentMaterialId;
    await opts.economyRepository.setMaterials(player.id, {
      ...materials,
      [fragmentId]: (materials[fragmentId] ?? 0) + 1,
    });

    return {
      outcome: result.outcome,
      premium: updatedPlayer.premium,
      rollsSinceNew: result.pity.rollsSinceNew,
    };
  });

  // D17 — o segundo sumidouro da moeda premium: "comprar energia extra para farmar mais".
  fastify.post('/energy/purchase', async (request, reply) => {
    if (!request.player) return reply.code(401).send({ error: 'missing player token' });
    const player = request.player;
    const body = request.body as EnergyPurchaseBody;

    const { premiumCost, energy: ganho } = opts.catalog.premiumRules.energyPurchase;
    if (player.premium < premiumCost) {
      return reply.code(400).send({ error: 'moeda premium insuficiente' });
    }

    const claimed = await claim(body.nonce, player.id, 'energy');
    if (!claimed.ok) return reply.code(claimed.status).send({ error: claimed.error });

    // A energia guardada é sempre reapurada contra o agora antes de somar: o valor no
    // banco é do instante em que foi escrito, não de agora. Mesmo cuidado de
    // `economy/routes.ts`.
    const nowMs = opts.now();
    const atual = resolveEnergy(player.energy, nowMs, opts.catalog.economyRules.energy);

    // A compra passa POR CIMA do teto de conta, de propósito: o teto existe para limitar o
    // farm de graça (§10, "energia de conta limita o farm diário"), e o sumidouro que D17
    // criou não teria função nenhuma se a compra fosse aparada por ele — quem está com a
    // barra cheia é justamente quem quer comprar.
    const energy: EnergyState = { stored: atual.stored + ganho, asOfMs: nowMs };
    await opts.repository.updateEnergy(player.id, energy);
    const updatedPlayer = await opts.repository.updatePremium(player.id, player.premium - premiumCost);

    return { energy, premium: updatedPlayer.premium };
  });
};

// Reexportado para o teste e para quem monta o app: o tipo do `Player` mudou nesta fatia.
export type { Player };
