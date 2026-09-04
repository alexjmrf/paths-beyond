import { loadCatalogFromDisk } from '@paths-beyond/content';
import { RULES_VERSION, resolveAutoBattle } from '@paths-beyond/core';
import { describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { createInMemoryRateLimiter } from '../src/battle/rateLimit.js';
import { createDevIdentityValidator } from '../src/identity/devIdentity.js';
import {
  createMemoryArenaDefenseRepository,
  createMemoryCharacterOwnershipRepository,
  createMemoryEconomyRepository,
  createMemoryHeroRepository,
  createMemoryIdempotencyRepository,
  createMemoryPlayerRepository,
  createMemoryReplayRepository,
  createMemoryRewardsRepository,
  createMemorySeasonRepository,
} from '../src/repository/memoryRepository.js';

// §1.1/§9.4 (M23) — A PRIMEIRA SESSÃO DE UM JOGADOR DE VERDADE.
//
// **O critério de aceite 1, ao pé da letra:** uma conta criada do zero joga o capítulo 1, faz
// o primeiro summon, equipa, aloca talento e entra na arena — **sem ninguém tocar no banco**.
//
// Isso não é o mesmo que os testes que já existem. Todos eles partem de conta SEMEADA: um
// `createMemoryPlayerRepository([{ ...jogador pronto, premium: 5000, energia cheia }])` que
// nenhum jogador de verdade recebe. Aqui a lista de jogadores começa **vazia**, e tudo que a
// conta tem foi ganho pelas rotas — inclusive a moeda que paga a invocação.
//
// É por isso que este arquivo é a prova e os outros não são: se a corrente tiver um elo que
// só funciona com o banco preparado à mão, ela arrebenta aqui.
//
// **UM ACHADO EM ABERTO, registrado aqui porque esconder seria pior.** Numa execução da suíte
// completa (2026-09-04) um dos passos foi recusado com
// `400 {"error":"comando rejeitado: atacante já agiu neste round"}`. Isso significa que o
// servidor, ao REEXECUTAR, partiu de um estado diferente daquele que o ticket entregou — e
// §9.1 chama divergência disso de bug crítico. `resolveAutoBattle` só registra comandos que
// FORAM aplicados, então a lista submetida é limpa por construção; a única origem possível é
// setup ou seed diferentes entre o ticket e a submissão.
//
// Procurado depois em ~200 execuções dirigidas — 80 capítulos, 60 arenas, 60 masmorras e 120
// correntes inteiras, todas com seed fixada — **e não reproduziu**. Fica como fio solto, com
// a mensagem de cada asserção carregando o corpo da resposta: na próxima vez que acontecer, a
// falha diz em qual passo foi.

const TICKET_SECRET = 'segredo-da-primeira-sessao';
const AGORA = Date.UTC(2026, 5, 1);
const CAPITULO = 'encounter-campanha-1';

const catalog = loadCatalogFromDisk();
const BANNER = Object.values(catalog.banners)[0]!;
// A masmorra de EQUIPAMENTO, e a escolha é a do jogador: equipar exige um item, e item cai
// em masmorra de `focus: 'gear'`. As outras três abertas a uma conta nova pagam ouro,
// pedras e material — nenhuma delas dá o que equipar.
const MASMORRA = Object.values(catalog.dungeons).find(
  (d) => !d.manualOnly && !d.requiresClearOf && d.focus === 'gear',
)!;
// Masmorra também é por VAGAS, e a primeira tem duas. Ler do conteúdo em vez de escrever o
// número aqui: quando o conteúdo mudar, o teste acompanha em vez de reprovar por um motivo
// que não é o dele.
const VAGAS_DA_MASMORRA = catalog.dungeonEncounters[MASMORRA.encounterId]!.units.filter(
  (unit) => unit.side === 'player',
).length;

// Um servidor como o de produção, com uma diferença que é o ponto do arquivo: **nenhum
// jogador cadastrado**.
function servidorVazio() {
  return buildApp({
    repository: createMemoryPlayerRepository([]),
    heroRepository: createMemoryHeroRepository([]),
    arenaDefenseRepository: createMemoryArenaDefenseRepository(),
    replayRepository: createMemoryReplayRepository(),
    seasonRepository: createMemorySeasonRepository(),
    economyRepository: createMemoryEconomyRepository(),
    ownershipRepository: createMemoryCharacterOwnershipRepository(),
    rewardsRepository: createMemoryRewardsRepository(),
    idempotencyRepository: createMemoryIdempotencyRepository(),
    catalog,
    shopCatalog: {},
    rateLimiter: createInMemoryRateLimiter({ maxRequests: 1000, windowMs: 60_000 }),
    ticketSecret: TICKET_SECRET,
    identityValidator: createDevIdentityValidator(),
    now: () => AGORA,
  });
}

type App = ReturnType<typeof buildApp>;

function jogador(app: App, identidade: string) {
  const ticket = `dev:${identidade}`;
  const cabecalho = { 'x-platform-ticket': ticket };

  return {
    async post(url: string, payload: Record<string, unknown> = {}) {
      const r = await app.inject({ method: 'POST', url, headers: cabecalho, payload });
      return { status: r.statusCode, body: r.json() as any };
    },
    async put(url: string, payload: Record<string, unknown> = {}) {
      const r = await app.inject({ method: 'PUT', url, headers: cabecalho, payload });
      return { status: r.statusCode, body: r.json() as any };
    },
    async get(url: string) {
      const r = await app.inject({ method: 'GET', url, headers: cabecalho });
      return { status: r.statusCode, body: r.json() as any };
    },
  };
}

// O sign-in é o primeiro ato do jogo: é ele que cria a conta e entrega o núcleo de história
// (M20). Nada antes dele existe.
async function contaNova(app: App, identidade: string) {
  const eu = jogador(app, identidade);
  const sessao = await eu.post('/accounts/session');
  expect(sessao.status, 'sign-in criou a conta').toBe(200);
  return eu;
}

// Repete até vencer, como o jogador faz — e afirma, no caminho, que a derrota não custou
// nada. É essa gratuidade que torna aceitável a primeira batalha ser difícil; se um dia ela
// passar a cobrar, este teste é o que reprova.
async function venceCapitulo(eu: ReturnType<typeof jogador>, heroIds: readonly string[], tentativas = 8) {
  let ultima = await jogarCapitulo(eu, heroIds);
  for (let i = 1; i < tentativas && ultima.body.outcome !== 'victory'; i += 1) {
    expect(ultima.body.premiumAwarded ?? 0, 'derrota não paga').toBe(0);
    ultima = await jogarCapitulo(eu, heroIds);
  }
  return ultima;
}

async function jogarCapitulo(eu: ReturnType<typeof jogador>, heroIds: readonly string[]) {
  const ticket = await eu.post(`/campaign/${CAPITULO}/ticket`, { heroIds });
  expect(ticket.status, JSON.stringify(ticket.body)).toBe(200);
  const jogada = resolveAutoBattle({ setup: ticket.body.setup, seed: ticket.body.seed });
  return eu.post(`/campaign/${CAPITULO}/run`, {
    nonce: ticket.body.nonce,
    heroIds,
    commands: jogada.commands,
    rulesVersion: RULES_VERSION,
  });
}

describe('a primeira sessão, de uma conta que não existia', () => {
  it('o sign-in cria a conta e entrega o núcleo de história — sem tocar no banco', async () => {
    const app = servidorVazio();
    const eu = await contaNova(app, 'jogador-novo');

    const heroes = await eu.get('/me/heroes');
    const roster = await eu.get('/me/roster');

    // O núcleo de quatro (D14): é com ele que o capítulo 1 é jogável.
    expect(heroes.body.length).toBeGreaterThan(0);
    expect(roster.body.characters.length).toBeGreaterThanOrEqual(4);
    // E a conta nasce SEM moeda premium: tudo que vier depois foi ganho jogando.
    expect(roster.body.premium).toBe(0);
  });

  it('a corrente inteira: capítulo 1 → moeda → invocação → equipar → talento → arena', async () => {
    const app = servidorVazio();
    const eu = await contaNova(app, 'jogador-novo');
    const heroes = (await eu.get('/me/heroes')).body as { hero: { id: string; characterId: string } }[];
    // **O capítulo 1 tem UMA vaga** (a campanha é por vagas desde o M18 5/N): a primeira
    // batalha do jogo é um herói contra o cenário, e o jogador não escolhe mais que isso.
    const heroIds = [heroes[0]!.hero.id];
    // A masmorra aceita mais gente que o capítulo, mas também por vagas — e precisa do time
    // cheio: com um herói só ela é perdida, e perder gasta energia igual (decisão de M14).
    const timeCompleto = heroes.slice(0, VAGAS_DA_MASMORRA).map((h) => h.hero.id);

    // ---- 1. o capítulo 1 -------------------------------------------------------------
    //
    // **Medido nesta fatia: 39 vitórias em 60 execuções (65%)** com a IA jogando pelo
    // jogador. A seed sai do nonce do ticket, então cada tentativa é uma batalha diferente —
    // e repetir é DE GRAÇA (a campanha não cobra energia, e a derrota não tira nada). O
    // teste faz o que o jogador faz: tenta de novo. Um humano lendo o preview de duelo
    // decide melhor que a IA de mapa, então 65% é o piso, não o teto.
    const capitulo = await venceCapitulo(eu, heroIds);
    expect(capitulo.body.outcome).toBe('victory');

    // A primeira completude paga, e é ESSA moeda que banca a invocação. Nenhum número foi
    // posto no banco à mão.
    expect(capitulo.body.premium).toBeGreaterThanOrEqual(catalog.premiumRules.summon.premiumCost);

    // ---- 2. a primeira invocação ------------------------------------------------------
    const invocacao = await eu.post('/summon', { nonce: 'nonce-primeiro-summon', bannerId: BANNER.id });
    expect(invocacao.status, JSON.stringify(invocacao.body)).toBe(200);
    expect(invocacao.body.premium).toBe(capitulo.body.premium - catalog.premiumRules.summon.premiumCost);

    // ---- 3. um item, e equipá-lo -------------------------------------------------------
    // Equipamento não nasce com a conta: ele cai na masmorra, que custa energia — e a
    // energia é o único recurso que a conta nova já tem cheio.
    const ticketMasmorra = await eu.post(`/dungeons/${MASMORRA.id}/ticket`, { heroIds: timeCompleto });
    expect(ticketMasmorra.status, JSON.stringify(ticketMasmorra.body)).toBe(200);
    const jogada = resolveAutoBattle({ setup: ticketMasmorra.body.setup, seed: ticketMasmorra.body.seed });
    const run = await eu.post(`/dungeons/${MASMORRA.id}/run`, {
      nonce: 'nonce-primeira-masmorra',
      heroIds: timeCompleto,
      commands: jogada.commands,
      rulesVersion: RULES_VERSION,
    });
    expect(run.status, JSON.stringify(run.body)).toBe(200);
    expect(run.body.outcome, 'o núcleo inicial vence a primeira masmorra').toBe('victory');

    const economia = await eu.get('/me/economy');
    const item = economia.body.inventory?.[0];
    expect(item, 'a masmorra entregou pelo menos um item ao inventário').toBeDefined();

    const equipou = await eu.post(`/heroes/${heroIds[0]}/equip`, {
      nonce: 'nonce-primeiro-equip',
      itemId: item.id,
    });
    expect(equipou.status, JSON.stringify(equipou.body)).toBe(200);

    // ---- 4. alocar um talento ----------------------------------------------------------
    // A árvore é do PERSONAGEM (M17) e o orçamento é fixo: a conta nova já pode alocar.
    const heroi = heroes[0]!.hero;
    const arvore = catalog.characterTalentTrees[heroi.characterId];
    expect(arvore, 'o personagem do núcleo tem árvore autorada').toBeDefined();
    const primeiroNo = arvore!.nodes[0]!;

    const talentos = await eu.put(`/heroes/${heroi.id}/talents`, {
      talents: { [primeiroNo.id]: 1 },
    });
    expect(talentos.status, JSON.stringify(talentos.body)).toBe(200);

    // ---- 5. a arena ---------------------------------------------------------------------
    // O oponente também é uma conta criada do zero, que montou defesa. Duas contas novas e
    // um servidor vazio: é a arena inteira sem uma linha de SQL escrita à mão.
    const outro = await contaNova(app, 'jogador-defensor');
    const heroesDoOutro = (await outro.get('/me/heroes')).body as { hero: { id: string } }[];
    const defesa = await outro.put('/me/defense', {
      mapId: Object.keys(catalog.maps)[0],
      units: [{ heroId: heroesDoOutro[0]!.hero.id, pos: { x: 1, y: 1 }, height: 0, aiArchetype: 'aggressive' }],
    });
    expect(defesa.status, JSON.stringify(defesa.body)).toBe(200);

    const oponente = await eu.get('/matchmaking/opponent');
    expect(oponente.status, 'o matchmaking achou a defesa do outro jogador').toBe(200);

    const ticketArena = await eu.post('/battles/ticket', {
      attackerHeroIds: heroIds,
      defenderPlayerId: oponente.body.playerId,
    });
    expect(ticketArena.status, JSON.stringify(ticketArena.body)).toBe(200);

    // O jogador joga a batalha; submeter sem comando nenhum devolveria `ongoing`, que é o
    // servidor dizendo "ninguém fez nada" — e não um desfecho.
    const jogadaArena = resolveAutoBattle({ setup: ticketArena.body.setup, seed: ticketArena.body.seed });
    const arena = await eu.post('/battles', {
      attackerHeroIds: heroIds,
      defenderPlayerId: oponente.body.playerId,
      commands: jogadaArena.commands,
      rulesVersion: RULES_VERSION,
      nonce: ticketArena.body.nonce,
    });

    // Ganhar ou perder é do balanceamento; o que este teste afirma é que a partida
    // ACONTECEU — a conta do zero chegou até a arena e submeteu uma batalha de verdade.
    expect(arena.status, JSON.stringify(arena.body)).toBe(200);
    expect(['victory', 'defeat']).toContain(arena.body.result.outcome);
  });

  it('a conquista de "limpe o primeiro capítulo" é reivindicável logo depois — e paga', async () => {
    // Faz parte de "sem instrução fora do jogo": a primeira fonte de moeda que o jogador
    // encontra precisa estar acessível pelas telas dele, não por conhecimento externo.
    const app = servidorVazio();
    const eu = await contaNova(app, 'jogador-conquista');
    const heroes = (await eu.get('/me/heroes')).body as { hero: { id: string } }[];

    await venceCapitulo(eu, [heroes[0]!.hero.id]);

    const premios = await eu.get('/me/rewards');
    const primeiroPasso = premios.body.rewards.find((r: any) => r.id === 'achievement-primeiro-passo');
    expect(primeiroPasso.claimable).toBe(true);

    const reivindicou = await eu.post('/rewards/achievement-primeiro-passo/claim');
    expect(reivindicou.status).toBe(200);
    expect(reivindicou.body.premiumAwarded).toBeGreaterThan(0);
  });
});
