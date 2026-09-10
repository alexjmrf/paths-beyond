import type { ContentCatalog, RewardCondition } from '@paths-beyond/content';
import type { FastifyPluginAsync } from 'fastify';
import type {
  CharacterOwnershipRepository,
  EconomyRepository,
  HeroRepository,
  PlayerRepository,
  RewardsRepository,
} from '../repository/types.js';
import { ownedCharacterIds } from '../summon/ownership.js';
import { countFullyClearedChapters, isWithinWindow, meetsCondition, type AccountSnapshot } from './conditions.js';

// §10 (M18, sub-sessão 4/N) — as duas fontes AUTORADAS da moeda premium: conquistas e
// eventos. As outras duas (primeira completude de capítulo e de masmorra) são pagas no
// próprio caminho da batalha, porque é lá que se sabe que ela aconteceu.
//
// Conquista e evento compartilham rota, repositório e idempotência, e isso não é economia:
// é que a decisão do usuário fez de um evento **um achievement com janela** — a única
// diferença é o relógio, e duas implementações da mesma coisa divergiriam.

export interface RewardsRoutesOptions {
  readonly repository: PlayerRepository;
  readonly heroRepository: HeroRepository;
  readonly ownershipRepository: CharacterOwnershipRepository;
  readonly economyRepository: EconomyRepository;
  readonly rewardsRepository: RewardsRepository;
  readonly catalog: ContentCatalog;
  readonly now: () => number;
}

// O retrato da conta contra o qual toda condição é avaliada. Montado UMA vez por
// requisição e passado adiante: a alternativa (cada condição consultando o que precisa)
// faria uma tela com dez conquistas bater no banco dezenas de vezes para responder a mesma
// pergunta.
async function snapshot(opts: RewardsRoutesOptions, playerId: string, elo: number): Promise<AccountSnapshot> {
  const [chapters, dungeons, owned, heroes] = await Promise.all([
    opts.rewardsRepository.listClearedChapters(playerId),
    opts.economyRepository.listClears(playerId),
    ownedCharacterIds(opts.ownershipRepository, opts.catalog, playerId),
    opts.heroRepository.listHeroesByOwner(playerId),
  ]);

  // M27 — `chapters` aqui é a lista de MISSÕES limpas (o repositório guarda o id do que foi
  // limpo, e o que foi limpo virou missão). As duas contagens saem dela, e a de capítulos
  // passa pelo catálogo: ver `countFullyClearedChapters`.
  const missoesLimpas = new Set(chapters);
  return {
    chaptersCleared: countFullyClearedChapters(opts.catalog.chapters, opts.catalog.encounters, missoesLimpas),
    missionsCleared: missoesLimpas.size,
    dungeonsCleared: dungeons.length,
    charactersOwned: owned.size,
    bestImprint: heroes.reduce((best, stored) => Math.max(best, stored.hero.imprint), 0),
    bestAwakening: heroes.reduce((best, stored) => Math.max(best, stored.hero.awakening), 0),
    elo,
  };
}

interface RewardView {
  readonly id: string;
  readonly kind: 'achievement' | 'event';
  readonly name: string;
  readonly description: string;
  readonly premium: number;
  readonly claimed: boolean;
  readonly claimable: boolean;
  // Só em evento: se a janela está aberta agora. O cliente precisa distinguir "ainda não
  // cumpri" de "perdi a janela", e derivar isso lá exigiria o relógio do cliente — que é
  // justamente o que não decide nada neste projeto.
  readonly windowOpen?: boolean;
  // §9.4 (M21, 3/N) — só em conquista: o espelho na plataforma e se ela está CUMPRIDA.
  //
  // **`earned` é cumprimento, não reivindicação** (decisão do usuário): a conquista da
  // plataforma diz o que o jogador FEZ; reivindicar é só pegar a moeda. Quem cumpriu e
  // ainda não passou na tela de prêmios já a desbloqueia — que é a mesma retroatividade
  // que a 4/N do M18 desenhou para a moeda.
  //
  // Vem calculado do servidor e não derivado no cliente pelo mesmo motivo de sempre: quem
  // sabe se a condição está cumprida é quem tem o banco. O cliente só encaminha a string
  // para a plataforma.
  readonly platform?: { readonly id: string; readonly earned: boolean };
}

export const rewardsRoutes: FastifyPluginAsync<RewardsRoutesOptions> = async (fastify, opts) => {
  function conditionMet(condition: RewardCondition | undefined, account: AccountSnapshot): boolean {
    return condition === undefined || meetsCondition(condition, account);
  }

  fastify.get('/me/rewards', async (request, reply) => {
    if (!request.player) return reply.code(401).send({ error: 'missing player token' });
    const player = request.player;

    const nowMs = opts.now();
    const account = await snapshot(opts, player.id, player.elo);
    const claimed = new Set(await opts.rewardsRepository.listClaims(player.id));

    const achievements: RewardView[] = Object.values(opts.catalog.achievements).map((achievement) => {
      const met = meetsCondition(achievement.condition, account);
      return {
        id: achievement.id,
        kind: 'achievement',
        name: achievement.name,
        description: achievement.description,
        premium: achievement.premium,
        claimed: claimed.has(achievement.id),
        claimable: !claimed.has(achievement.id) && met,
        // Uma conquista já reivindicada continua cumprida: o que ela conta aconteceu, e
        // pegar a moeda não desfaz. Sem isso, quem reivindicasse antes de a plataforma
        // estar disponível nunca a veria no perfil.
        platform: { id: achievement.platformId, earned: met || claimed.has(achievement.id) },
      };
    });

    const events: RewardView[] = Object.values(opts.catalog.events).map((event) => {
      const open = isWithinWindow(event, nowMs);
      return {
        id: event.id,
        kind: 'event',
        name: event.name,
        description: event.description,
        premium: event.premium,
        claimed: claimed.has(event.id),
        claimable: !claimed.has(event.id) && open && conditionMet(event.condition, account),
        windowOpen: open,
      };
    });

    return {
      premium: player.premium,
      account,
      rewards: [...achievements, ...events].sort((a, b) => a.id.localeCompare(b.id)),
    };
  });

  fastify.post('/rewards/:id/claim', async (request, reply) => {
    if (!request.player) return reply.code(401).send({ error: 'missing player token' });
    const player = request.player;
    const rewardId = (request.params as { id: string }).id;

    const achievement = opts.catalog.achievements[rewardId];
    const event = opts.catalog.events[rewardId];
    if (!achievement && !event) return reply.code(404).send({ error: 'prêmio desconhecido' });

    const nowMs = opts.now();
    const account = await snapshot(opts, player.id, player.elo);

    if (event && !isWithinWindow(event, nowMs)) {
      return reply.code(403).send({ error: 'fora da janela do evento' });
    }

    const condition = achievement ? achievement.condition : event!.condition;
    if (!conditionMet(condition, account)) {
      return reply.code(403).send({ error: 'condição não cumprida' });
    }

    // A reivindicação vem DEPOIS das checagens e é a checagem-e-escrita numa operação só:
    // se ela devolve `false`, alguém já pagou este prêmio — inclusive uma requisição
    // simultânea do próprio jogador.
    const first = await opts.rewardsRepository.claim(player.id, rewardId);
    if (!first) return reply.code(409).send({ error: 'este prêmio já foi reivindicado' });

    const premium = achievement ? achievement.premium : event!.premium;
    const updated = await opts.repository.updatePremium(player.id, player.premium + premium);

    return { rewardId, premiumAwarded: premium, premium: updated.premium };
  });
};
