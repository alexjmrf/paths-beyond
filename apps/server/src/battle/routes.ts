import crypto from 'node:crypto';
import {
  RULES_VERSION,
  buildBattleSetupFromHeroes,
  simulate,
  type BattleCommand,
  type Coord,
  type HeroPlacement,
  type MapAiArchetype,
} from '@paths-beyond/core';
import type { ContentCatalog } from '@paths-beyond/content';
import type { FastifyPluginAsync } from 'fastify';
import { computeEloUpdate } from '../matchmaking/elo.js';
import type { RateLimiter } from './rateLimit.js';
import type { ArenaDefenseRepository, HeroRepository, PlayerRepository, ReplayRepository } from '../repository/types.js';

// §9.1 — "o defensor monta um time de até 5 heróis."
const MAX_TEAM_SIZE = 5;

// §10 — "marcas de arena" é moeda de economia de servidor, não número de balanceamento
// de combate (mesmo tratamento já dado a DEFAULT_K_FACTOR/ELO_SEARCH_RANGE em
// matchmaking/elo.ts — não vem de packages/data). Vencedor ganha mais, perdedor ganha
// menos por participar (nunca zero — perder não deveria travar o jogador fora da loja).
const ARENA_MARKS_WIN = 10;
const ARENA_MARKS_LOSS = 3;

function generateSeed(): number {
  // §9.4 — "zero RNG no cliente: seed vem do servidor." crypto.randomInt (não
  // Math.random) porque isto é código de infraestrutura em apps/server, não simulação de
  // regra em packages/core — a proibição de Math.random é escopada a `packages/core`
  // (regra 1/CLAUDE.md), mas usar o gerador criptográfico do Node aqui é só bom senso.
  return crypto.randomInt(0, 0xffffffff);
}

interface SaveDefenseBody {
  readonly mapId?: string;
  readonly units?: readonly {
    readonly heroId?: string;
    readonly pos?: Coord;
    readonly height?: 0 | 1 | 2 | 3;
    readonly aiArchetype?: MapAiArchetype;
  }[];
}

interface CreateBattleBody {
  readonly attackerHeroIds?: readonly string[];
  readonly defenderPlayerId?: string;
  readonly commands?: readonly BattleCommand[];
  readonly rulesVersion?: string;
  // §9.4 — "nonce por partida": gerado pelo cliente, único por tentativa de batalha.
  // Dobra como id do replay persistido (ver ReplayRepository).
  readonly nonce?: string;
}

export interface BattleRoutesOptions {
  readonly repository: PlayerRepository;
  readonly heroRepository: HeroRepository;
  readonly arenaDefenseRepository: ArenaDefenseRepository;
  readonly replayRepository: ReplayRepository;
  readonly catalog: ContentCatalog;
  readonly rateLimiter: RateLimiter;
}

// Registrado como filho do MESMO escopo que já carrega `authPlugin` (app.ts) — não chama
// `authPlugin` de novo aqui: o hook `onRequest` de um plugin `fp()`-wrapped, uma vez
// vazado pro escopo pai, já vale automaticamente pra qualquer filho registrado dentro
// dele (encapsulação flui pra baixo livremente; só o vazamento pra CIMA precisa de
// `fp()`). Ver DECISIONS.md sobre o bug de encapsulação da sub-sessão 3.
export const battleRoutes: FastifyPluginAsync<BattleRoutesOptions> = async (fastify, opts) => {
  fastify.put('/me/defense', async (request, reply) => {
    if (!request.player) return reply.code(401).send({ error: 'missing player token' });
    const player = request.player;

    const body = request.body as SaveDefenseBody;
    const units = body.units ?? [];

    if (units.length === 0 || units.length > MAX_TEAM_SIZE) {
      return reply.code(400).send({ error: `defesa precisa ter entre 1 e ${MAX_TEAM_SIZE} unidades` });
    }
    if (!body.mapId || !opts.catalog.maps[body.mapId]) {
      return reply.code(400).send({ error: 'mapId desconhecido' });
    }
    if (!units.every((u) => u.heroId && u.pos && u.height !== undefined && u.aiArchetype)) {
      return reply.code(400).send({ error: 'cada unidade precisa de heroId/pos/height/aiArchetype' });
    }

    const heroIds = units.map((u) => u.heroId as string);
    const heroes = await opts.heroRepository.getHeroesByIds(heroIds);
    const ownsAll = heroIds.every((id) => heroes.some((h) => h.hero.id === id && h.ownerPlayerId === player.id));
    if (heroes.length !== heroIds.length || !ownsAll) {
      return reply.code(403).send({ error: 'algum heroId não pertence a você' });
    }

    const defense = await opts.arenaDefenseRepository.saveDefense({
      ownerPlayerId: player.id,
      mapId: body.mapId,
      units: units.map((u) => ({
        heroId: u.heroId as string,
        pos: u.pos as Coord,
        height: u.height as 0 | 1 | 2 | 3,
        aiArchetype: u.aiArchetype as MapAiArchetype,
      })),
    });

    return defense;
  });

  fastify.post('/battles', async (request, reply) => {
    if (!request.player) return reply.code(401).send({ error: 'missing player token' });
    const attacker = request.player;

    const body = request.body as CreateBattleBody;

    // §9.4 — "rate limiting": checado antes de qualquer trabalho, por jogador.
    if (!opts.rateLimiter.tryConsume(attacker.id)) {
      return reply.code(429).send({ error: 'muitas tentativas de batalha em pouco tempo' });
    }

    // §9.4 — "nonce por partida": sem nonce, ou nonce já usado, rejeita — previne reenvio
    // da mesma requisição rodar a batalha (e mexer no ELO) mais de uma vez.
    if (!body.nonce) {
      return reply.code(400).send({ error: 'nonce é obrigatório' });
    }
    if (await opts.replayRepository.getByNonce(body.nonce)) {
      return reply.code(409).send({ error: 'nonce já utilizado' });
    }

    // §9.4 — "versionamento: rulesVersion no replay; recusar replays de versão
    // diferente." Checado antes de qualquer outra coisa: uma versão de regras errada
    // invalida a requisição inteira, não só o resultado.
    if (body.rulesVersion !== RULES_VERSION) {
      return reply.code(409).send({ error: `rulesVersion incompatível (esperado ${RULES_VERSION})` });
    }

    const attackerHeroIds = body.attackerHeroIds ?? [];
    if (attackerHeroIds.length === 0 || attackerHeroIds.length > MAX_TEAM_SIZE) {
      return reply.code(400).send({ error: `time precisa ter entre 1 e ${MAX_TEAM_SIZE} heróis` });
    }

    // §9.4 — "cliente envia BattleCommand[]; servidor simula." Nunca aceitamos stat/hp do
    // corpo da requisição — só ids; os heróis reais vêm sempre do HeroRepository.
    const attackerHeroes = await opts.heroRepository.getHeroesByIds(attackerHeroIds);
    const attackerOwnsAll = attackerHeroIds.every((id) => attackerHeroes.some((h) => h.hero.id === id && h.ownerPlayerId === attacker.id));
    if (attackerHeroes.length !== attackerHeroIds.length || !attackerOwnsAll) {
      return reply.code(403).send({ error: 'algum heroId não pertence a você' });
    }

    const defense = body.defenderPlayerId ? await opts.arenaDefenseRepository.getDefenseByOwner(body.defenderPlayerId) : null;
    if (!defense) return reply.code(404).send({ error: 'o defensor não tem uma defesa configurada' });

    const arenaMap = opts.catalog.maps[defense.mapId];
    if (!arenaMap) return reply.code(500).send({ error: 'mapa da defesa não existe mais no catálogo' });

    const defenderHeroes = await opts.heroRepository.getHeroesByIds(defense.units.map((u) => u.heroId));
    if (defenderHeroes.length !== defense.units.length) {
      return reply.code(500).send({ error: 'defesa referencia herói inexistente' });
    }

    const placements: HeroPlacement[] = [];
    for (const [index, stored] of attackerHeroes.entries()) {
      const classDef = opts.catalog.classes[stored.hero.classId];
      if (!classDef) return reply.code(500).send({ error: `classe desconhecida: ${stored.hero.classId}` });
      // Posicionamento do atacante: corte de escopo desta sub-sessão (ver DECISIONS.md)
      // — mapas ainda não têm pontos de spawn declarados; time inteiro entra pela borda
      // esquerda, uma unidade por linha.
      placements.push({
        unitId: stored.hero.id,
        hero: stored.hero,
        classDef,
        equippedItems: stored.equippedItems,
        side: 'player',
        pos: { x: 0, y: index },
        height: 0,
      });
    }

    for (const defenseUnit of defense.units) {
      const stored = defenderHeroes.find((h) => h.hero.id === defenseUnit.heroId);
      if (!stored) return reply.code(500).send({ error: `defesa referencia herói inexistente: ${defenseUnit.heroId}` });
      const classDef = opts.catalog.classes[stored.hero.classId];
      if (!classDef) return reply.code(500).send({ error: `classe desconhecida: ${stored.hero.classId}` });
      placements.push({
        unitId: stored.hero.id,
        hero: stored.hero,
        classDef,
        equippedItems: stored.equippedItems,
        side: 'enemy',
        pos: defenseUnit.pos,
        height: defenseUnit.height,
        aiArchetype: defenseUnit.aiArchetype,
      });
    }

    const setup = buildBattleSetupFromHeroes({
      placements,
      map: arenaMap.grid,
      permadeath: 'classic', // §15 (decisões em aberto) — sugestão de default da própria spec
      winCondition: arenaMap.winCondition,
      effectDefs: opts.catalog.effects,
      initialValor: arenaMap.initialValor,
      itemSets: opts.catalog.itemSets,
      skillsCatalog: opts.catalog.skills,
      weaponDuelRanges: opts.catalog.weaponDuelRanges,
      baselineReactionSkillIds: opts.catalog.baselineReactionSkillIds,
    });

    const seed = generateSeed();
    const result = simulate({
      rulesVersion: RULES_VERSION,
      seed,
      initialState: setup,
      commands: body.commands ?? [],
    });

    // §9.1 — "ELO, temporadas de 14 dias." §10 — "marcas de arena" ganhas em toda
    // batalha concluída (não em 'ongoing' — comandos insuficientes pra terminar o
    // engajamento não devem mexer em rating nem em moeda de ninguém).
    let elo: { attacker: number; defender: number } | undefined;
    let arenaMarks: { attacker: number; defender: number } | undefined;
    if (result.outcome !== 'ongoing') {
      const defenderPlayer = await opts.repository.getPlayerById(defense.ownerPlayerId);
      if (defenderPlayer) {
        const winnerIsAttacker = result.outcome === 'victory';

        const update = computeEloUpdate(
          winnerIsAttacker ? attacker.elo : defenderPlayer.elo,
          winnerIsAttacker ? defenderPlayer.elo : attacker.elo,
        );
        const attackerElo = winnerIsAttacker ? update.winnerElo : update.loserElo;
        const defenderElo = winnerIsAttacker ? update.loserElo : update.winnerElo;
        await opts.repository.updateElo(attacker.id, attackerElo);
        await opts.repository.updateElo(defenderPlayer.id, defenderElo);
        elo = { attacker: attackerElo, defender: defenderElo };

        const attackerGain = winnerIsAttacker ? ARENA_MARKS_WIN : ARENA_MARKS_LOSS;
        const defenderGain = winnerIsAttacker ? ARENA_MARKS_LOSS : ARENA_MARKS_WIN;
        const attackerMarks = attacker.arenaMarks + attackerGain;
        const defenderMarks = defenderPlayer.arenaMarks + defenderGain;
        await opts.repository.updateArenaMarks(attacker.id, attackerMarks);
        await opts.repository.updateArenaMarks(defenderPlayer.id, defenderMarks);
        arenaMarks = { attacker: attackerMarks, defender: defenderMarks };
      }
    }

    // §9.4/roadmap M7 sub-sessão 9 — persiste o replay pra revisão/auditoria posterior.
    // A gravação em si (`ReplayRepository.save`, PK = nonce) também é a defesa real
    // contra reenvio; a checagem de `getByNonce` acima é só uma resposta de erro mais
    // rápida antes de gastar trabalho simulando de novo.
    await opts.replayRepository.save({
      nonce: body.nonce,
      rulesVersion: RULES_VERSION,
      seed,
      initialState: setup,
      commands: body.commands ?? [],
      result,
      attackerPlayerId: attacker.id,
      defenderPlayerId: defense.ownerPlayerId,
      createdAt: new Date().toISOString(),
    });

    return { seed, result, elo, arenaMarks };
  });

  fastify.get('/battles/:nonce', async (request, reply) => {
    if (!request.player) return reply.code(401).send({ error: 'missing player token' });
    const player = request.player;

    const { nonce } = request.params as { nonce: string };
    const replay = await opts.replayRepository.getByNonce(nonce);
    if (!replay) return reply.code(404).send({ error: 'replay não encontrado' });

    if (replay.attackerPlayerId !== player.id && replay.defenderPlayerId !== player.id) {
      return reply.code(403).send({ error: 'este replay não é seu' });
    }

    return replay;
  });
};
