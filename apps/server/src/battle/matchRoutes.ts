import { darExpDaVitoria, type SubidaDeNivel } from '../economy/experiencia.js';
import {
  RULES_VERSION,
  buildInitialStateLogged,
  consumeEntry,
  spendEnergy,
  type BattleCommand,
  type BattleSetup,
} from '@paths-beyond/core';
import type { ContentCatalog } from '@paths-beyond/content';
import type { FastifyPluginAsync, FastifyReply } from 'fastify';
import { assembleChapterBattle, findChapter } from '../campaign/routes.js';
import { assembleDungeonBattle, currentEnergy, rewardSeedFor, rollRewards } from '../economy/routes.js';
import { computeEloUpdate } from '../matchmaking/elo.js';
import type {
  ArenaDefenseRepository,
  CharacterOwnershipRepository,
  EconomyRepository,
  HeroRepository,
  MatchKind,
  MatchRepository,
  PartyPresetRepository,
  PlayerRepository,
  ReplayRepository,
  RewardsRepository,
  StoredMatch,
} from '../repository/types.js';
import type { Telemetria } from '../telemetry/telemetria.js';
import { rejectOnRulesVersion } from '../version.js';
import { characterIdsForMatchUnits } from './artIds.js';
import { ARENA_MARKS_LOSS, ARENA_MARKS_WIN, assembleArenaBattle } from './routes.js';
import { LADO_DO_DONO, aplicarComando, estadoDaPartida, resultadoDaPartida, type PassoDaIa } from './partida.js';
import { deriveSeed, generateNonce } from './ticket.js';
import { redigirEstado, type EstadoVisivel } from './visao.js';

// M36 2/N (D47) — AS ROTAS DA BATALHA VIVA. `ticket → joga tudo → run` morre aqui.
//
// **O modelo antigo, e por que ele caiu.** O `ticket` mandava o `BattleSetup` COMPLETO para o
// cliente, ele jogava a batalha inteira sozinho e a `run` reexecutava os comandos só para
// conferir o desfecho. Isso era honesto enquanto o inimigo era conhecido; com D47 virou
// impossível — o setup completo é exatamente o que não pode sair.
//
// **Um caminho, três superfícies.** Campanha, masmorra e arena abrem a mesma `matches`, mandam
// comando pela mesma rota e fecham pelo mesmo lugar. O que muda entre elas é o que se paga ao
// ABRIR e o que se recebe ao FECHAR — e é só isso que este arquivo trata por `kind`. Dois
// caminhos de duelo seriam duas chances de divergir, que é o que §9.1 chama de bug crítico.
//
// **O que o jogador PAGA mudou de lugar, e é decisão declarada (D48).** No modelo antigo a
// energia e a entrada de masmorra eram cobradas na submissão; abandonar um ticket era grátis.
// Na batalha viva não existe submissão: o desfecho acontece no comando que o produz. Então o
// custo passa para a ABERTURA, e o banco garante uma partida em andamento por jogador (índice
// único parcial, migration 0017). Sem as duas coisas juntas, abandonar uma masmorra que está
// indo mal e abrir outra sairia de graça — o custo viraria opcional. De quebra fecha o risco
// residual que o M13 registrou: procurar seed favorável agora custa energia.
//
// **Desistir não é perder.** `POST /matches/:nonce/forfeit` fecha a partida sem pagar nada e
// sem chamar `telemetria.missaoTerminada`: para o M34, desistir continua sendo ABANDONO, que é
// o sinal de "onde o jogador para". Contá-lo como derrota apagaria justamente o que se mede.

export interface MatchRoutesOptions {
  readonly repository: PlayerRepository;
  readonly heroRepository: HeroRepository;
  readonly arenaDefenseRepository: ArenaDefenseRepository;
  readonly ownershipRepository: CharacterOwnershipRepository;
  readonly economyRepository: EconomyRepository;
  readonly rewardsRepository: RewardsRepository;
  readonly partyPresetRepository: PartyPresetRepository;
  readonly replayRepository: ReplayRepository;
  readonly matchRepository: MatchRepository;
  readonly telemetria: Telemetria;
  readonly catalog: ContentCatalog;
  readonly ticketSecret: string;
  readonly now: () => number;
  readonly newNonce?: () => string;
}

interface AbrirBody {
  readonly heroIds?: readonly string[];
  readonly attackerHeroIds?: readonly string[];
  readonly defenderPlayerId?: string;
  readonly rulesVersion?: string;
}

interface ComandoBody {
  readonly command?: BattleCommand;
  readonly rulesVersion?: string;
}

/** O que o cliente recebe ao abrir uma partida ou ao reconectar nela. */
interface VistaDaPartida {
  readonly nonce: string;
  readonly kind: MatchKind;
  readonly refId: string;
  readonly rulesVersion: string;
  readonly outcome: StoredMatch['outcome'];
  readonly visivel: EstadoVisivel;
  readonly characterIdByUnitId: Readonly<Record<string, string>>;
  /** O turno de IA que acontece ANTES do primeiro comando — o cliente precisa dele para animar. */
  readonly aberturaDaIa: readonly PassoDaIa[];
  /**
   * Presente quando a batalha JÁ ACABOU na abertura. Não é hipótese: o turno de IA que precede o
   * primeiro comando é uma jogada de verdade, e num time de uma unidade só ele pode decidir a
   * partida antes de o jogador tocar em nada. Sem isto, essa batalha ficaria para sempre
   * `ongoing` no banco, sem pagar nem cobrar — e o jogador travado, porque é uma por vez.
   */
  readonly liquidacao?: Liquidacao;
}

async function vistaDaPartida(opts: MatchRoutesOptions, match: StoredMatch): Promise<VistaDaPartida> {
  const { state, aberturaDaIa } = estadoDaPartida(match);
  const heroes = await opts.heroRepository.getHeroesByIds(match.setup.units.map((u) => u.heroId));
  return {
    nonce: match.nonce,
    kind: match.kind,
    refId: match.refId,
    rulesVersion: match.rulesVersion,
    outcome: match.outcome,
    visivel: redigirEstado(state, LADO_DO_DONO),
    characterIdByUnitId: characterIdsForMatchUnits(
      match.setup.units,
      heroes.map((stored) => stored.hero),
      opts.catalog.enemies,
    ),
    aberturaDaIa,
  };
}

/**
 * A abertura, comum às três superfícies: recusa quem já tem partida em andamento, grava a linha
 * e devolve a vista. O que é específico de cada `kind` — o que se paga, o que se valida — já
 * aconteceu quando isto é chamado.
 */
async function abrirPartida(
  opts: MatchRoutesOptions,
  reply: FastifyReply,
  dados: { readonly playerId: string; readonly kind: MatchKind; readonly refId: string; readonly setup: BattleSetup },
): Promise<VistaDaPartida> {
  const nonce = (opts.newNonce ?? generateNonce)();
  const match = await opts.matchRepository.create({
    nonce,
    playerId: dados.playerId,
    kind: dados.kind,
    refId: dados.refId,
    rulesVersion: RULES_VERSION,
    // A seed continua DERIVADA do nonce por HMAC (M13 2/N, `ticket.ts`) em vez de sorteada: é
    // uma escrita a menos e mantém a propriedade de que o cliente não escolhe a própria seed.
    // O que mudou é que ela agora não sai daqui — `redigirEstado` não a leva (D47).
    seed: deriveSeed(opts.ticketSecret, nonce),
    setup: dados.setup,
    commands: [],
    outcome: 'ongoing',
    createdAt: new Date(opts.now()).toISOString(),
    finishedAt: null,
    forfeited: false,
  });

  void reply.code(201);

  // A batalha pode nascer decidida — ver `VistaDaPartida.liquidacao`. Fechá-la aqui é o mesmo
  // caminho do comando que fecha: `liquidar` não sabe (nem precisa saber) quem a chamou.
  const { state } = estadoDaPartida(match);
  if (state.outcome !== 'ongoing') {
    const fechada =
      (await opts.matchRepository.update(nonce, {
        commands: [],
        outcome: state.outcome,
        finishedAt: new Date(opts.now()).toISOString(),
        forfeited: false,
      })) ?? match;
    await gravarReplay(opts, fechada, state);
    return { ...(await vistaDaPartida(opts, fechada)), liquidacao: await liquidar(opts, fechada, state) };
  }

  return vistaDaPartida(opts, match);
}

/** O que a partida pagou ao fechar. Uma forma por superfície; ausente enquanto ela corre. */
interface Liquidacao {
  readonly premiumAwarded?: number;
  readonly premium?: number;
  readonly rewards?: unknown;
  readonly energy?: unknown;
  readonly wallet?: { readonly gold: number; readonly stones: number; readonly arenaMarks: number };
  readonly elo?: { readonly attacker: number; readonly defender: number };
  readonly arenaMarks?: { readonly attacker: number; readonly defender: number };
  // M39 1/N — o exp da vitória em instância PvE (a soma dos inimigos, pelo nível) e quem subiu.
  readonly exp?: number;
  readonly subidas?: readonly SubidaDeNivel[];
}

export const matchRoutes: FastifyPluginAsync<MatchRoutesOptions> = async (fastify, opts) => {
  // Uma partida em andamento por vez, checada ANTES de validar qualquer outra coisa: quem tem
  // uma batalha aberta e pede outra está reconectando ou se perdeu, e as duas precisam do nonce
  // da que já existe, não de um erro sobre heróis.
  async function recusarSeJaJoga(playerId: string, reply: FastifyReply): Promise<boolean> {
    const emAndamento = await opts.matchRepository.getOngoingByPlayer(playerId);
    if (!emAndamento) return false;
    void reply.code(409).send({ error: 'você já tem uma batalha em andamento', nonce: emAndamento.nonce });
    return true;
  }

  fastify.post('/campaign/:id/matches', async (request, reply) => {
    if (!request.player) return reply.code(401).send({ error: 'missing player token' });
    const player = request.player;
    const body = (request.body ?? {}) as AbrirBody;

    if (rejectOnRulesVersion(reply, body.rulesVersion)) return reply;

    const chapterId = (request.params as { id: string }).id;
    const encounter = findChapter(opts.catalog, chapterId);
    if (!encounter) return reply.code(404).send({ error: 'capítulo desconhecido' });
    if (await recusarSeJaJoga(player.id, reply)) return reply;

    const assembled = await assembleChapterBattle(opts, encounter, body.heroIds ?? [], player.id);
    if ('error' in assembled) return reply.code(400).send({ error: assembled.error });

    const vista = await abrirPartida(opts, reply, {
      playerId: player.id,
      kind: 'campaign',
      refId: encounter.id,
      setup: assembled.setup,
    });
    // M34 1/N — a tentativa abre aqui, pelo mesmo nonce que a fecha. O ticket saiu; o que ele
    // media continua sendo medido no instante equivalente.
    await opts.telemetria.missaoIniciada({ playerId: player.id, missionId: encounter.id, nonce: vista.nonce });
    return vista;
  });

  fastify.post('/dungeons/:id/matches', async (request, reply) => {
    if (!request.player) return reply.code(401).send({ error: 'missing player token' });
    const player = request.player;
    const body = (request.body ?? {}) as AbrirBody;
    const nowMs = opts.now();

    if (rejectOnRulesVersion(reply, body.rulesVersion)) return reply;

    const dungeonId = (request.params as { id: string }).id;
    const dungeon = opts.catalog.dungeons[dungeonId];
    if (!dungeon) return reply.code(404).send({ error: 'masmorra desconhecida' });
    if (await recusarSeJaJoga(player.id, reply)) return reply;

    const clears = new Set(await opts.economyRepository.listClears(player.id));
    if (dungeon.requiresClearOf && !clears.has(dungeon.requiresClearOf)) {
      return reply.code(403).send({ error: `precisa limpar ${dungeon.requiresClearOf} antes` });
    }

    const encounter = opts.catalog.dungeonEncounters[dungeon.encounterId];
    if (!encounter) return reply.code(500).send({ error: 'masmorra sem confronto declarado' });

    const assembled = await assembleDungeonBattle(opts, encounter, body.heroIds ?? [], player.id);
    if ('error' in assembled) return reply.code(400).send({ error: assembled.error });

    // D48 — o custo mudou de lugar: ele é cobrado ao ENTRAR. A ordem entre os dois é a mesma de
    // antes (entrada primeiro, energia depois), pelo mesmo motivo: gastar energia e então
    // descobrir que não há entrada seria cobrar por uma partida que não aconteceu.
    if (dungeon.entryLimit) {
      const stored = (await opts.economyRepository.getEntryState(player.id, dungeon.id)) ?? { used: 0, asOfMs: nowMs };
      const consumed = consumeEntry(stored, nowMs, dungeon.entryLimit);
      await opts.economyRepository.setEntryState(player.id, dungeon.id, consumed.state);
      if (!consumed.ok) return reply.code(403).send({ error: consumed.reason });
    }

    const spent = spendEnergy(player.energy, nowMs, opts.catalog.economyRules.energy, dungeon.energyCost);
    await opts.repository.updateEnergy(player.id, spent.energy);
    if (!spent.ok) return reply.code(403).send({ error: spent.reason, energy: spent.energy });

    return abrirPartida(opts, reply, {
      playerId: player.id,
      kind: 'dungeon',
      refId: dungeon.id,
      setup: assembled.setup,
    });
  });

  fastify.post('/arena/matches', async (request, reply) => {
    if (!request.player) return reply.code(401).send({ error: 'missing player token' });
    const attacker = request.player;
    const body = (request.body ?? {}) as AbrirBody;

    if (rejectOnRulesVersion(reply, body.rulesVersion)) return reply;
    if (await recusarSeJaJoga(attacker.id, reply)) return reply;

    const assembled = await assembleArenaBattle(opts, attacker.id, body.attackerHeroIds ?? [], body.defenderPlayerId);
    if (!assembled.ok) return reply.code(assembled.code).send({ error: assembled.error });

    return abrirPartida(opts, reply, {
      playerId: attacker.id,
      kind: 'arena',
      refId: assembled.defenderPlayerId,
      setup: assembled.setup,
    });
  });

  // A reconexão do M22, agora sem nonce guardado em disco no cliente: quem volta pergunta ao
  // servidor se tem batalha aberta, e o servidor é o único que sabe.
  fastify.get('/matches/current', async (request, reply) => {
    if (!request.player) return reply.code(401).send({ error: 'missing player token' });
    const match = await opts.matchRepository.getOngoingByPlayer(request.player.id);
    if (!match) return reply.code(404).send({ error: 'você não tem batalha em andamento' });
    return vistaDaPartida(opts, match);
  });

  fastify.get('/matches/:nonce', async (request, reply) => {
    if (!request.player) return reply.code(401).send({ error: 'missing player token' });
    const { nonce } = request.params as { nonce: string };
    const match = await opts.matchRepository.get(nonce);
    if (!match) return reply.code(404).send({ error: 'partida não encontrada' });
    if (match.playerId !== request.player.id) return reply.code(403).send({ error: 'esta partida não é sua' });
    return vistaDaPartida(opts, match);
  });

  // M36 4/N (D47) — o REPLAY na forma que o cliente reproduz: passos já redigidos.
  //
  // `GET /battles/:nonce` continua devolvendo o registro completo (setup dos dois lados, seed,
  // comandos) — é auditoria, e quem o abre é quem jogou. Mas o cliente não pode REMONTAR o
  // estado a partir dele: se ele simulasse o replay localmente, teria de volta, em memória, todo
  // o dado que D47 tirou da batalha ao vivo, e o esconder valeria só enquanto a partida corre.
  //
  // Então o servidor reproduz e redige, passo a passo — o mesmo cálculo que a partida fez.
  fastify.get('/battles/:nonce/log', async (request, reply) => {
    if (!request.player) return reply.code(401).send({ error: 'missing player token' });
    const { nonce } = request.params as { nonce: string };

    const match = await opts.matchRepository.get(nonce);
    if (!match) return reply.code(404).send({ error: 'partida não encontrada' });
    if (match.playerId !== request.player.id) return reply.code(403).send({ error: 'esta partida não é sua' });

    // M37 4/N — **a versão conferida é a da PARTIDA, não a que o cliente mandou.**
    //
    // Esta rota REEXECUTA a batalha a partir de `setup + seed + commands` contra o motor deste
    // servidor. Se ela foi gravada sob outra versão de regras, o que sai daqui não é o replay
    // dela: é uma partida nova, com as mesmas entradas e outro motor. As rotas que abrem e que
    // mandam comando recusam desde o M22; esta passava porque não recebe versão nenhuma do
    // cliente — e era justamente por isso que ninguém tinha olhado.
    if (rejectOnRulesVersion(reply, match.rulesVersion)) return reply;

    const inicial = buildInitialStateLogged(match.setup, match.seed);
    const passos: PassoDaIa[] = inicial.steps.map((passo) => ({
      command: passo.command,
      ...(passo.duelResult ? { duelResult: passo.duelResult } : {}),
      estadoAntes: redigirEstado(passo.stateBefore, LADO_DO_DONO),
    }));

    let state = inicial.state;
    const estadoInicial = redigirEstado(state, LADO_DO_DONO);

    for (const command of match.commands) {
      if (state.outcome !== 'ongoing') break;
      const jogada = aplicarComando(state, command, LADO_DO_DONO);
      if (!jogada.ok) break;
      // O comando do JOGADOR entra como passo, com o estado de antes: é dele que a animação
      // tira a geometria, exatamente como faz com os passos da IA.
      passos.push({
        command,
        ...(jogada.duelResult ? { duelResult: jogada.duelResult } : {}),
        estadoAntes: redigirEstado(state, LADO_DO_DONO),
      });
      passos.push(...jogada.passosDaIa);
      state = jogada.state;
    }

    const heroes = await opts.heroRepository.getHeroesByIds(match.setup.units.map((u) => u.heroId));
    return {
      nonce: match.nonce,
      rulesVersion: match.rulesVersion,
      outcome: state.outcome,
      characterIdByUnitId: characterIdsForMatchUnits(
        match.setup.units,
        heroes.map((stored) => stored.hero),
        opts.catalog.enemies,
      ),
      estadoInicial,
      passos,
    };
  });

  fastify.post('/matches/:nonce/commands', async (request, reply) => {
    if (!request.player) return reply.code(401).send({ error: 'missing player token' });
    const player = request.player;
    const body = (request.body ?? {}) as ComandoBody;

    if (!body.command) return reply.code(400).send({ error: 'command é obrigatório' });

    const { nonce } = request.params as { nonce: string };
    const match = await opts.matchRepository.get(nonce);
    if (!match) return reply.code(404).send({ error: 'partida não encontrada' });
    if (match.playerId !== player.id) return reply.code(403).send({ error: 'esta partida não é sua' });
    if (match.outcome !== 'ongoing') return reply.code(409).send({ error: 'esta batalha já terminou' });

    // §9.4 (M22 1/N) — a versão de regras, agora conferida contra a PARTIDA e não contra o corpo
    // da requisição. A versão do cliente já foi checada ao abrir; o que pode mudar no meio de uma
    // batalha é a do SERVIDOR (um deploy), e aí a partida gravada é de outro jogo. Exigir o campo
    // em cada comando seria repetir a cada clique uma resposta que já foi dada — e a checagem que
    // importa é justamente a que o cliente não tem como fazer.
    //
    // Se o cliente mandar a versão dele mesmo assim, ela continua valendo: quem manda e erra é
    // recusado, quem não manda é julgado pela partida.
    if (body.rulesVersion !== undefined && rejectOnRulesVersion(reply, body.rulesVersion)) return reply;
    if (rejectOnRulesVersion(reply, match.rulesVersion)) return reply;

    const { state } = estadoDaPartida(match);
    const jogada = aplicarComando(state, body.command, LADO_DO_DONO);
    if (!jogada.ok) return reply.code(jogada.code).send({ error: jogada.error });

    const comandos = [...match.commands, body.command];
    const terminou = jogada.state.outcome !== 'ongoing';
    const atualizada = await opts.matchRepository.update(nonce, {
      commands: comandos,
      outcome: jogada.state.outcome,
      finishedAt: terminou ? new Date(opts.now()).toISOString() : null,
      forfeited: false,
    });
    if (!atualizada) return reply.code(404).send({ error: 'partida não encontrada' });

    let liquidacao: Liquidacao | undefined;
    if (terminou) {
      await gravarReplay(opts, atualizada, jogada.state);
      liquidacao = await liquidar(opts, atualizada, jogada.state);
    }

    return {
      outcome: jogada.state.outcome,
      roundsPlayed: jogada.state.round,
      visivel: redigirEstado(jogada.state, LADO_DO_DONO),
      ...(jogada.duelResult ? { duelResult: jogada.duelResult } : {}),
      passosDaIa: jogada.passosDaIa,
      ...(liquidacao ? { liquidacao } : {}),
    };
  });

  // Desistir. Fecha a partida como derrota no tabuleiro, **sem liquidar nada** e sem fechar a
  // tentativa na telemetria: para o M34 isto é abandono, não derrota. O que já foi pago na
  // abertura (energia, entrada) não volta — é o que dá peso a entrar.
  fastify.post('/matches/:nonce/forfeit', async (request, reply) => {
    if (!request.player) return reply.code(401).send({ error: 'missing player token' });
    const { nonce } = request.params as { nonce: string };
    const match = await opts.matchRepository.get(nonce);
    if (!match) return reply.code(404).send({ error: 'partida não encontrada' });
    if (match.playerId !== request.player.id) return reply.code(403).send({ error: 'esta partida não é sua' });
    if (match.outcome !== 'ongoing') return reply.code(409).send({ error: 'esta batalha já terminou' });

    const fechada =
      (await opts.matchRepository.update(nonce, {
        commands: match.commands,
        outcome: 'defeat',
        finishedAt: new Date(opts.now()).toISOString(),
        forfeited: true,
      })) ?? match;

    // Grava o registro, não liquida: a batalha aconteceu, e ninguém paga nem recebe por ela.
    await gravarReplay(opts, fechada, estadoDaPartida(fechada).state);
    return { outcome: 'defeat' as const, forfeited: true };
  });
};

/**
 * O REGISTRO da batalha, gravado em todo fechamento — inclusive no de quem desistiu.
 *
 * Antes desta milestone só a arena guardava replay, e só quando a submissão chegava. Agora as
 * três superfícies guardam, e guardam também a batalha abandonada: ela aconteceu, e um acervo
 * que só tem as partidas terminadas é um acervo que não serve para entender onde alguém parou.
 *
 * `setup + seed + commands` é a receita inteira (§3.4), e `resultadoDaPartida` é o mesmo cálculo
 * que a partida fez — rever é reproduzir, não recontar. Numa partida abandonada o `result`
 * guarda o estado real do tabuleiro no instante em que se desistiu (`ongoing`), e não a derrota
 * administrativa que fechou a linha: são fatos diferentes, e os dois ficam registrados.
 */
async function gravarReplay(
  opts: MatchRoutesOptions,
  match: StoredMatch,
  state: ReturnType<typeof estadoDaPartida>['state'],
): Promise<void> {
  await opts.replayRepository.save({
    nonce: match.nonce,
    rulesVersion: match.rulesVersion,
    seed: match.seed,
    initialState: match.setup,
    commands: match.commands,
    result: resultadoDaPartida(state),
    attackerPlayerId: match.playerId,
    defenderPlayerId: match.kind === 'arena' ? match.refId : match.playerId,
    createdAt: new Date(opts.now()).toISOString(),
  });
}

/**
 * O fim da batalha, por superfície. É o corpo das antigas `run`, movido para o instante em que o
 * desfecho de fato acontece — o comando que o produziu. O que cada uma faz continua idêntico ao
 * que fazia; o que mudou é quem a chama.
 */
async function liquidar(
  opts: MatchRoutesOptions,
  match: StoredMatch,
  state: ReturnType<typeof estadoDaPartida>['state'],
): Promise<Liquidacao> {
  const player = await opts.repository.getPlayerById(match.playerId);
  if (!player) return {};
  const venceu = state.outcome === 'victory';

  if (match.kind === 'campaign') {
    await opts.telemetria.missaoTerminada({
      nonce: match.nonce,
      outcome: venceu ? 'victory' : 'defeat',
      rounds: state.round,
    });
    if (!venceu) return { premiumAwarded: 0, premium: player.premium };

    // A primeira completude paga; a segunda não. A checagem e a escrita numa operação só,
    // porque perguntar e depois escrever abriria a fresta em que duas submissões simultâneas
    // pagam duas vezes. Idêntico ao que `POST /campaign/:id/run` fazia (M18 4/N, D23).
    const primeira = await opts.rewardsRepository.markChapterCleared(player.id, match.refId);
    let premiumAwarded = primeira ? opts.catalog.premiumRules.premiumRewards.missionFirstClear : 0;
    if (primeira) {
      const encounter = findChapter(opts.catalog, match.refId);
      const cleared = new Set(await opts.rewardsRepository.listClearedChapters(player.id));
      const irmas = opts.catalog.encounters.filter((e) => e.chapterId === encounter?.chapterId);
      if (irmas.length > 0 && irmas.every((e) => cleared.has(e.id))) {
        premiumAwarded += opts.catalog.premiumRules.premiumRewards.chapterFirstClear;
      }
    }
    const atualizado =
      premiumAwarded > 0 ? await opts.repository.updatePremium(player.id, player.premium + premiumAwarded) : player;
    // M39 1/N — a vitória dá o exp dos inimigos da missão a cada herói que foi.
    const { exp, subidas } = await darExpDaVitoria(opts.catalog, opts.heroRepository, {
      playerId: match.playerId,
      kind: match.kind,
      refId: match.refId,
      heroIds: match.setup.units.filter((u) => u.side === 'player').map((u) => u.heroId),
    });
    return { premiumAwarded, premium: atualizado.premium, exp, subidas };
  }

  if (match.kind === 'dungeon') {
    const dungeon = opts.catalog.dungeons[match.refId];
    const energy = currentEnergy(player, opts.now(), opts.catalog);
    // Derrota gasta o que já foi pago na abertura e não paga nada — é o que faz "o time precisa
    // ser forte o bastante" ter consequência (decisão do usuário, M14 3/N).
    if (!dungeon || !venceu) return { rewards: null, energy };

    const rewards = rollRewards(opts.catalog, dungeon, rewardSeedFor(opts.ticketSecret, match.nonce), match.nonce);
    const wallet = await opts.repository.updateWallet(player.id, {
      gold: player.gold + rewards.gold,
      stones: player.stones + rewards.stones,
    });
    if (Object.keys(rewards.materials).length > 0) {
      const atuais = await opts.economyRepository.getMaterials(player.id);
      const somados: Record<string, number> = { ...atuais };
      for (const [materialId, amount] of Object.entries(rewards.materials)) {
        somados[materialId] = (somados[materialId] ?? 0) + amount;
      }
      await opts.economyRepository.setMaterials(player.id, somados);
    }
    if (rewards.items.length > 0) await opts.economyRepository.addItems(player.id, rewards.items);

    const clears = new Set(await opts.economyRepository.listClears(player.id));
    const primeiraVez = !clears.has(dungeon.id);
    await opts.economyRepository.markCleared(player.id, dungeon.id);
    let premiumAwarded = 0;
    if (primeiraVez) {
      premiumAwarded = opts.catalog.premiumRules.premiumRewards.dungeonFirstClear;
      await opts.repository.updatePremium(player.id, player.premium + premiumAwarded);
    }

    // M39 1/N — e o exp dos inimigos da masmorra, pelo mesmo caminho da campanha.
    const { exp, subidas } = await darExpDaVitoria(opts.catalog, opts.heroRepository, {
      playerId: match.playerId,
      kind: match.kind,
      refId: match.refId,
      heroIds: match.setup.units.filter((u) => u.side === 'player').map((u) => u.heroId),
    });
    return {
      rewards,
      energy,
      premiumAwarded,
      wallet: { gold: wallet.gold, stones: wallet.stones, arenaMarks: wallet.arenaMarks },
      exp,
      subidas,
    };
  }

  // Arena: ELO e marcas, como `POST /battles` fazia (M7 8/N + §10).
  const defensor = await opts.repository.getPlayerById(match.refId);
  if (!defensor) return {};

  const update = computeEloUpdate(venceu ? player.elo : defensor.elo, venceu ? defensor.elo : player.elo);
  const eloAtacante = venceu ? update.winnerElo : update.loserElo;
  const eloDefensor = venceu ? update.loserElo : update.winnerElo;
  await opts.repository.updateElo(player.id, eloAtacante);
  await opts.repository.updateElo(defensor.id, eloDefensor);

  const marcasAtacante = player.arenaMarks + (venceu ? ARENA_MARKS_WIN : ARENA_MARKS_LOSS);
  const marcasDefensor = defensor.arenaMarks + (venceu ? ARENA_MARKS_LOSS : ARENA_MARKS_WIN);
  await opts.repository.updateArenaMarks(player.id, marcasAtacante);
  await opts.repository.updateArenaMarks(defensor.id, marcasDefensor);

  return {
    elo: { attacker: eloAtacante, defender: eloDefensor },
    arenaMarks: { attacker: marcasAtacante, defender: marcasDefensor },
  };
}
