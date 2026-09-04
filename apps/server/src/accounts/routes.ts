import type { ContentCatalog } from '@paths-beyond/content';
import type { FastifyPluginAsync } from 'fastify';
import { authPlugin, PLATFORM_TICKET_HEADER } from '../auth.js';
import { registerRateLimit, type RateLimiter } from '../battle/rateLimit.js';
import type { IdentityValidator } from '../identity/types.js';
import { ensureOwnedHeroes } from '../summon/roster.js';
import type {
  ArenaDefenseRepository,
  CharacterOwnershipRepository,
  EconomyRepository,
  HeroRepository,
  PlayerRepository,
  ReplayRepository,
  IdempotencyRepository,
  RewardsRepository,
} from '../repository/types.js';

// §9.4 (M20) — o CICLO DE VIDA DA CONTA.
//
// O projeto nunca teve rota de criação: os jogadores eram semeados no banco. A M18 6/N
// resolveu o núcleo de quatro derivando-o preguiçosamente dentro de `GET /me/heroes` — certo
// para aquela fatia, e não uma resposta para "o que acontece quando alguém compra o jogo".
//
// **Decisão do M20: a criação é EXPLÍCITA, aqui, e em lugar nenhum mais.** O motivo, escrito
// como o roadmap pede: com sempre-online e dinheiro real, "quando a conta existe" precisa de
// uma resposta e um lugar só. Leitura que escreve é o que torna investigação difícil (um
// `GET` que cria linha não aparece como escrita em log nem em métrica), atrapalha rate
// limiting e transforma qualquer reprodução de bug numa mutação silenciosa.
//
// A propriedade que a 6/N queria continua de pé, e é o motivo de `ensureOwnedHeroes`
// continuar existindo: um personagem de história acrescentado amanhã é concedido no
// **sign-in seguinte** de cada conta. O que mudou é quem chama — o sign-in, nunca um `GET`.

export interface AccountRoutesOptions {
  readonly repository: PlayerRepository;
  readonly heroRepository: HeroRepository;
  readonly arenaDefenseRepository: ArenaDefenseRepository;
  readonly replayRepository: ReplayRepository;
  readonly economyRepository: EconomyRepository;
  readonly ownershipRepository: CharacterOwnershipRepository;
  readonly rewardsRepository: RewardsRepository;
  // M22 2/N — opcional pelo mesmo motivo que em `buildApp`: quem monta o app sem ela
  // continua funcionando como antes.
  readonly idempotencyRepository?: IdempotencyRepository;
  readonly identityValidator: IdentityValidator;
  // §9.4 (M22, 3/N) — este plugin tem escopo protegido PRÓPRIO (ele precisa existir fora do
  // escopo geral para poder criar a conta), então o hook do limitador registrado lá não o
  // alcança. Sem isto, `DELETE /me` — que apaga o jogador de sete repositórios — seria a
  // única rota que muda estado sem cota. Descoberto pelo teste de cobertura, não por leitura.
  readonly rateLimiter?: RateLimiter;
  readonly catalog: ContentCatalog;
  readonly newPlayerId?: () => string;
}

export const accountRoutes: FastifyPluginAsync<AccountRoutesOptions> = async (fastify, opts) => {
  // A ÚNICA rota fora do escopo protegido, e tem de ser: ela é o que faz a conta existir, e
  // exigir uma conta para criá-la seria um ciclo.
  fastify.post('/accounts/session', async (request, reply) => {
    const ticket = request.headers[PLATFORM_TICKET_HEADER];
    if (typeof ticket !== 'string' || ticket.length === 0) {
      return reply.code(401).send({ error: 'missing platform ticket' });
    }

    const identity = await opts.identityValidator.validate(ticket);
    if (!identity) return reply.code(401).send({ error: 'invalid platform ticket' });

    const existente = await opts.repository.getPlayerByPlatformIdentity(identity.provider, identity.platformId);
    const player =
      existente ??
      (await opts.repository.createPlayer({
        // O id interno é do PROJETO e não da plataforma: um jogador que muda de plataforma
        // um dia não deve exigir reescrever a chave estrangeira de dez tabelas. O default
        // deriva da identidade porque é legível em log; injetável para o teste fixar.
        id: opts.newPlayerId?.() ?? identity.platformId,
        platformProvider: identity.provider,
        platformId: identity.platformId,
        // A plataforma nem sempre devolve nome no mesmo passo da validação (a Steam não
        // devolve). Um nome derivado é melhor que um campo vazio na tela.
        displayName: identity.displayName ?? `Jogador ${identity.platformId.slice(-4)}`,
      }));

    // Reconciliação idempotente: dá o núcleo a quem acabou de nascer, e a quem já existia
    // mas ainda não tem um personagem de história acrescentado depois. É o mesmo
    // `ensureOwnedHeroes` da 6/N — o que mudou é que ele é chamado aqui, e não num `GET`.
    await ensureOwnedHeroes(opts.heroRepository, opts.ownershipRepository, opts.catalog, player.id);

    return { ...player, created: existente === null };
  });

  // As duas rotas abaixo EXIGEM conta, então o escopo delas registra a autenticação por
  // conta própria — `accountRoutes` mora fora do escopo protegido do `app.ts` por causa do
  // sign-in, e um filho não herda o hook de um tio.
  fastify.register(async (protegidas) => {
    await protegidas.register(authPlugin, {
      repository: opts.repository,
      identityValidator: opts.identityValidator,
    });

    // M22 3/N — a cota vale aqui também: `DELETE /me` apaga o jogador de sete repositórios,
    // e um escopo que autentica por conta própria precisa limitar por conta própria.
    if (opts.rateLimiter) registerRateLimit(protegidas, opts.rateLimiter);

    // §9.4 (M20) — exportação da conta. Deixa de ser opcional quando existe conta de
    // verdade: é o que permite ao jogador levar o próprio estado embora, e é o que se manda
    // a quem pergunta "o que vocês guardam de mim".
    protegidas.get('/me/export', async (request, reply) => {
      if (!request.player) return reply.code(401).send({ error: 'missing platform ticket' });
      const player = request.player;

      const [heroes, materials, items, clears, acquired, claims, chapters, defense] = await Promise.all([
        opts.heroRepository.listHeroesByOwner(player.id),
        opts.economyRepository.getMaterials(player.id),
        opts.economyRepository.listItems(player.id),
        opts.economyRepository.listClears(player.id),
        opts.ownershipRepository.listAcquired(player.id),
        opts.rewardsRepository.listClaims(player.id),
        opts.rewardsRepository.listClearedChapters(player.id),
        opts.arenaDefenseRepository.getDefenseByOwner(player.id),
      ]);

      return {
        player,
        heroes,
        economy: { materials, items, clears },
        acquiredCharacters: acquired,
        rewards: { claims, clearedChapters: chapters },
        arenaDefense: defense,
      };
    });

    // §9.4 (M20) — exclusão de conta.
    //
    // A ORDEM importa e não é estética: as tabelas que referenciam `players` têm chave
    // estrangeira, então o jogador só pode sair depois de tudo que aponta para ele. Isso dá
    // uma propriedade boa de graça — esquecer um repositório não deixa lixo em silêncio,
    // deixa a exclusão inteira reprovar por integridade.
    protegidas.delete('/me', async (request, reply) => {
      if (!request.player) return reply.code(401).send({ error: 'missing platform ticket' });
      const playerId = request.player.id;

      await opts.economyRepository.deletePlayerData(playerId);
      await opts.ownershipRepository.deletePlayerData(playerId);
      await opts.rewardsRepository.deletePlayerData(playerId);
      // M22 2/N — as respostas guardadas por nonce também apontam para o jogador, e apagar
      // a conta sem elas reprovaria por integridade referencial.
      await opts.idempotencyRepository?.deletePlayerData(playerId);
      await opts.replayRepository.deleteReplaysOfPlayer(playerId);
      await opts.arenaDefenseRepository.deleteDefenseByOwner(playerId);
      await opts.heroRepository.deleteHeroesByOwner(playerId);
      const apagado = await opts.repository.deletePlayer(playerId);

      return { deleted: apagado };
    });
  });
};
