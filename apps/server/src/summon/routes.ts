import { resolveEnergy, type EnergyState } from '@paths-beyond/core';
import type { BannerContent, ContentCatalog } from '@paths-beyond/content';
import {
  INITIAL_CHOICE,
  INITIAL_PITY,
  INITIAL_TOKEN,
  advanceChoice,
  advanceToken,
  pityScopeOf,
  redeemChoice,
  resolvePendingToken,
  rollSummon,
  tokenOutcome,
  type BannerDef,
  type ChoiceState,
  type SummonOutcome,
  type TokenState,
} from '@paths-beyond/gacha';
import type { FastifyPluginAsync } from 'fastify';
import { deriveSeed } from '../battle/ticket.js';
import type {
  CharacterOwnershipRepository,
  EconomyRepository,
  HeroRepository,
  Player,
  PlayerRepository,
} from '../repository/types.js';
import { ownedCharacterIds, storyCharacterIds } from './ownership.js';
import { buildStoredHero } from './roster.js';

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
  readonly heroRepository: HeroRepository;
  readonly catalog: ContentCatalog;
  readonly ticketSecret: string;
  readonly now: () => number;
}

interface SummonBody {
  readonly nonce?: string;
  readonly bannerId?: string;
}

interface ChoiceBody {
  readonly nonce?: string;
  readonly bannerId?: string;
  readonly choiceId?: string;
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

  // M38 3/N (D54) — o rotativo "fica ativo por um tempo e depois sai". A janela é dado; quem
  // lê o relógio é o servidor. O genérico está sempre ativo.
  function ativo(banner: BannerContent, nowMs: number): boolean {
    if (banner.kind === 'generic') return true;
    return Date.parse(banner.activeFrom) <= nowMs && nowMs < Date.parse(banner.activeUntil);
  }

  // O que o jogador já tem, nas duas formas que a rolagem pergunta.
  async function posse(playerId: string): Promise<{ owned: ReadonlySet<string>; ownedArtifacts: string[] }> {
    const owned = await ownedCharacterIds(opts.ownershipRepository, opts.catalog, playerId);
    const ownedArtifacts = (await opts.ownershipRepository.listArtifacts(playerId)).map((a) => a.artifactId);
    return { owned, ownedArtifacts };
  }

  // Entrega um desfecho: personagem vira posse E instância; artefato vira instância; duplicata
  // (dos dois) vira fragmento. Um só lugar, porque a rolagem, o token e a escolha entregam
  // pelas mesmas regras.
  async function entregar(playerId: string, outcome: SummonOutcome): Promise<void> {
    if (outcome.kind === 'character') {
      await opts.ownershipRepository.grant(playerId, outcome.characterId);
      // §10/D14 (M18, 6/N) — posse E instância, na mesma requisição. Conceder sem criar o
      // herói entregaria ao jogador um nome no roster e nada para levar ao mapa.
      await opts.heroRepository.createHero(buildStoredHero(opts.catalog, playerId, outcome.characterId));
      return;
    }
    if (outcome.kind === 'artifact') {
      // D53 — uma instância por (jogador, definição), nascendo em awakening e imprint 0.
      await opts.ownershipRepository.grantArtifact(playerId, {
        id: `artefato-${playerId}-${outcome.artifactId}`,
        artifactId: outcome.artifactId,
        awakening: 0,
        imprint: 0,
      });
      return;
    }
    // Duplicata: vira fragmento DO PRÓPRIO personagem ou artefato, que é o que alimenta o
    // imprint. O id do material vem do banner (o motor não pode derivá-lo — regra 4).
    const materials = await opts.economyRepository.getMaterials(playerId);
    const fragmentId = outcome.fragmentMaterialId;
    await opts.economyRepository.setMaterials(playerId, { ...materials, [fragmentId]: (materials[fragmentId] ?? 0) + 1 });
  }

  // O token pendente é pago quando o destaque entra na conta por QUALQUER caminho, inclusive
  // depois de o banner sair de rotação. Roda depois de toda entrega.
  async function pagarTokensPendentes(playerId: string): Promise<SummonOutcome[]> {
    const pagos: SummonOutcome[] = [];
    for (const { bannerId, state } of await opts.ownershipRepository.listPendingTokens(playerId)) {
      const banner = opts.catalog.banners[bannerId];
      // Banner que saiu do CATÁLOGO não tem mais destaque a conferir: o token espera.
      if (!banner || banner.kind !== 'rotatingCharacter') continue;
      const { owned, ownedArtifacts } = await posse(playerId);
      const r = resolvePendingToken(state, owned.has(banner.featuredCharacterId));
      if (!r.grant) continue;
      const outcome = tokenOutcome(banner.token, ownedArtifacts);
      await entregar(playerId, outcome);
      await opts.ownershipRepository.setToken(playerId, bannerId, r.state);
      pagos.push(outcome);
    }
    return pagos;
  }

  fastify.get('/summon/banners', async (request, reply) => {
    if (!request.player) return reply.code(401).send({ error: 'missing player token' });
    const player = request.player;
    const nowMs = opts.now();

    // D50 (M37, 2/N) — a tela recebe os DOIS andares: os dois limiares e os dois contadores.
    // M38 3/N — e, por tipo, o que cada banner tem de próprio: a curva, o destaque, a janela,
    // o token do rotativo de personagem e a escolha do genérico. Informação do catálogo e da
    // conta do próprio jogador, não do inimigo: nada aqui esbarra em D47.
    const banners = await Promise.all(
      Object.values(opts.catalog.banners)
        .filter((banner) => ativo(banner, nowMs))
        .sort((a, b) => a.id.localeCompare(b.id))
        .map(async (banner) => {
          const base = {
            id: banner.id,
            kind: banner.kind,
            name: banner.name,
            pityThresholds: banner.pityThresholds,
            // D56 — a tela mostra SEMPRE a taxa base; a curva de soft pity fica escondida no
            // servidor (decisão do usuário). Só o número da base atravessa.
            baseRate: banner.softPity.baseRate,
            premiumCost: opts.catalog.premiumRules.summon.premiumCost,
            rollsSince: (await opts.ownershipRepository.getPity(player.id, pityScopeOf(banner))) ?? INITIAL_PITY,
            // A entrada viaja na forma do dado — `characterId` OU `artifactId` —, que é também a
            // que a tela do M18 já lê: o cliente de hoje continua lendo o pool de personagens.
            pool: banner.pool.map((entry) =>
              entry.artifactId !== undefined
                ? { artifactId: entry.artifactId, rank: entry.rank, weight: entry.weight }
                : { characterId: entry.characterId, rank: entry.rank, weight: entry.weight },
            ),
          };
          if (banner.kind === 'generic') {
            const choice = (await opts.ownershipRepository.getChoice(player.id, banner.id)) ?? INITIAL_CHOICE;
            return { ...base, choice: { every: banner.choiceEvery, ...choice } };
          }
          const janela = { activeFrom: banner.activeFrom, activeUntil: banner.activeUntil };
          if (banner.kind === 'rotatingArtifact') return { ...base, ...janela, featuredId: banner.featuredArtifactId };
          const token = (await opts.ownershipRepository.getToken(player.id, banner.id)) ?? INITIAL_TOKEN;
          return {
            ...base,
            ...janela,
            featuredId: banner.featuredCharacterId,
            token: { threshold: banner.token.threshold, artifactId: banner.token.artifactId, ...token },
          };
        }),
    );

    return { premium: player.premium, banners };
  });

  fastify.post('/summon', async (request, reply) => {
    if (!request.player) return reply.code(401).send({ error: 'missing player token' });
    const player = request.player;
    const body = request.body as SummonBody;

    const banner = body.bannerId ? opts.catalog.banners[body.bannerId] : undefined;
    if (!banner) return reply.code(404).send({ error: 'banner desconhecido' });
    // M38 3/N — fora da janela, o rotativo não rola. Recusado ANTES de cobrar e de reservar o
    // nonce, pelo mesmo motivo do saldo.
    if (!ativo(banner, opts.now())) return reply.code(409).send({ error: 'banner fora de rotação' });

    const cost = opts.catalog.premiumRules.summon.premiumCost;
    // Cobrado ANTES de reservar o nonce: recusar por saldo não deve queimar a chave de
    // idempotência, senão o jogador que juntar a moeda não consegue reusar o mesmo nonce.
    if (player.premium < cost) {
      return reply.code(400).send({ error: 'moeda premium insuficiente' });
    }

    const claimed = await claim(body.nonce, player.id, 'summon');
    if (!claimed.ok) return reply.code(claimed.status).send({ error: claimed.error });

    const antes = await posse(player.id);
    const scope = pityScopeOf(banner);
    const pity = (await opts.ownershipRepository.getPity(player.id, scope)) ?? INITIAL_PITY;

    const result = rollSummon({
      banner: banner as BannerDef,
      owned: [...antes.owned],
      ownedArtifacts: antes.ownedArtifacts,
      pity,
      // A seed é DERIVADA do nonce por HMAC (ver battle/ticket.ts): sem o segredo, o
      // cliente não tem como procurar um nonce que produza a rolagem que ele quer. O
      // sufixo mantém o stream separado do da batalha que usasse o mesmo nonce.
      seed: deriveSeed(opts.ticketSecret, `${body.nonce!}:summon`),
      rollId: `${player.id}:${banner.id}:${body.nonce!}`,
    });

    // M38 3/N (D54) — o pity é guardado por TIPO de banner.
    await opts.ownershipRepository.setPity(player.id, scope, result.pity);
    const updatedPlayer = await opts.repository.updatePremium(player.id, player.premium - cost);
    await entregar(player.id, result.outcome);

    const tokenGrants: SummonOutcome[] = [];
    let token: TokenState | undefined;
    let choice: ChoiceState | undefined;

    if (banner.kind === 'rotatingCharacter') {
      // O token de 1,5·P conta rolagens NAQUELE banner, com a posse DEPOIS desta rolagem:
      // quem tira o destaque na própria 135ª recebe o token nela.
      const depois = await posse(player.id);
      const atual = (await opts.ownershipRepository.getToken(player.id, banner.id)) ?? INITIAL_TOKEN;
      const avanco = advanceToken(atual, banner.token.threshold, depois.owned.has(banner.featuredCharacterId));
      await opts.ownershipRepository.setToken(player.id, banner.id, avanco.state);
      token = avanco.state;
      if (avanco.grant) {
        const outcome = tokenOutcome(banner.token, depois.ownedArtifacts);
        await entregar(player.id, outcome);
        tokenGrants.push(outcome);
      }
    }

    if (banner.kind === 'generic') {
      // D54/D55 — o contador da escolha é PRÓPRIO: anda em toda rolagem, qualquer que seja o
      // desfecho, e só zera ao conceder.
      const atual = (await opts.ownershipRepository.getChoice(player.id, banner.id)) ?? INITIAL_CHOICE;
      choice = advanceChoice(atual, banner.choiceEvery);
      await opts.ownershipRepository.setChoice(player.id, banner.id, choice);
    }

    tokenGrants.push(...(await pagarTokensPendentes(player.id)));
    if (banner.kind === 'rotatingCharacter') {
      token = (await opts.ownershipRepository.getToken(player.id, banner.id)) ?? token;
    }

    return {
      outcome: result.outcome,
      premium: updatedPlayer.premium,
      // D50 — qual garantia disparou, se alguma. Vai no resultado e não no desfecho porque
      // uma garantia pode terminar em duplicata: ela promete o rank, não a novidade.
      guaranteed: result.guaranteed,
      rollsSince: result.pity,
      // M38 3/N — o que o token entregou nesta resposta (o deste banner, ou um pendente de
      // outro que esta rolagem destravou), e o estado do token e da escolha deste banner.
      tokenGrants,
      ...(token ? { token } : {}),
      ...(choice ? { choice } : {}),
    };
  });

  // M38 3/N (D54/D55) — o resgate da escolha do genérico: qualquer `hero` do pool dele,
  // personagem ou artefato. Não cobra moeda; consome uma escolha pendente.
  fastify.post('/summon/choice', async (request, reply) => {
    if (!request.player) return reply.code(401).send({ error: 'missing player token' });
    const player = request.player;
    const body = request.body as ChoiceBody;

    const banner = body.bannerId ? opts.catalog.banners[body.bannerId] : undefined;
    if (!banner) return reply.code(404).send({ error: 'banner desconhecido' });
    if (banner.kind !== 'generic') return reply.code(400).send({ error: 'a escolha só existe no banner genérico' });
    if (!body.choiceId) return reply.code(400).send({ error: 'choiceId é obrigatório' });

    const estado = (await opts.ownershipRepository.getChoice(player.id, banner.id)) ?? INITIAL_CHOICE;
    const { owned, ownedArtifacts } = await posse(player.id);
    const resgate = redeemChoice(banner, estado, body.choiceId, [...owned], ownedArtifacts);
    // Recusado ANTES de reservar o nonce, pelo mesmo motivo do saldo no summon.
    if (!resgate.ok) {
      return resgate.reason === 'sem-escolha'
        ? reply.code(409).send({ error: 'nenhuma escolha pendente' })
        : reply.code(400).send({ error: 'escolha fora do pool de heroes do genérico' });
    }

    const claimed = await claim(body.nonce, player.id, 'summon');
    if (!claimed.ok) return reply.code(claimed.status).send({ error: claimed.error });

    await opts.ownershipRepository.setChoice(player.id, banner.id, resgate.state);
    await entregar(player.id, resgate.outcome);
    const tokenGrants = await pagarTokensPendentes(player.id);

    return { outcome: resgate.outcome, choice: resgate.state, tokenGrants };
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
