import { loadCatalogFromDisk, playFromSetup } from '@paths-beyond/content';
import { RULES_VERSION, resolveAutoBattle } from '@paths-beyond/core';
import { describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { createInMemoryRateLimiter } from '../src/battle/rateLimit.js';
import { createDevIdentityValidator } from '../src/identity/devIdentity.js';
import {
  createMemoryArenaDefenseRepository,
  createMemoryPartyPresetRepository,
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
// **O ACHADO EM ABERTO DO M23, FECHADO EM M27 3/N.** O cabeçalho deste arquivo registrava um
// `400 {"error":"comando rejeitado: ..."}` que aparecia numa execução da suíte completa e não
// reproduzia em ~200 execuções dirigidas. O diagnóstico escrito na época estava certo — "a
// única origem possível é setup ou seed diferentes entre o ticket e a submissão" — e a origem
// era esta, na perna da masmorra, aqui neste arquivo:
//
//     resolveAutoBattle({ setup: ticketMasmorra.body.setup, seed: ticketMasmorra.body.seed })
//     ...
//     nonce: 'nonce-primeira-masmorra'   // <- um nonce ESCRITO À MÃO
//
// `POST /dungeons/:id/run` deriva a seed do nonce SUBMETIDO (`deriveSeed(secret, body.nonce)`,
// `economy/routes.ts`), e não do ticket. Planejar com a seed do ticket e submeter outro nonce
// é planejar numa batalha e ser verificado em outra. **Não é defeito do servidor:** o nonce é
// o ticket (M13, 2/N), e derivar do que o cliente mandou é o contrato.
//
// Por que era intermitente, e por que ~200 execuções dirigidas não pegaram: `generateNonce` é
// `crypto.randomUUID` e este arquivo não injetava `newNonce`, então a batalha do ticket mudava
// a cada execução enquanto a da verificação ficava presa na mesma. Às vezes os comandos ainda
// eram legais no outro tabuleiro e a corrente passava; às vezes viravam `400`; às vezes eram
// legais e perdiam, e a falha saía como `expected 'defeat' to be 'victory'`. Uma busca com
// seed FIXADA — que é o que as ~200 execuções eram — nunca encontraria isto: a seed fixa é
// justamente a condição que faz o defeito sumir.
//
// **As duas metades do conserto:** a submissão usa o nonce do ticket, e `servidorVazio()`
// injeta o contador de nonce, como `demoCompleta.test.ts` faz. O arquivo passou a jogar as
// mesmas batalhas em toda execução.

const TICKET_SECRET = 'segredo-da-primeira-sessao';
const AGORA = Date.UTC(2026, 5, 1);
const CAPITULO = 'encounter-campanha-1';
// M27 — a campanha ganhou duas camadas. `CAPITULO` acima continua sendo uma MISSÃO (o id
// não mudou na migração, e é ele que o servidor guarda como limpo); este é o capítulo dela.
const CAPITULO_1 = 'chapter-1';

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
  // O nonce é a SEED da batalha (`deriveSeed`). Com `crypto.randomUUID` solto, cada execução
  // deste arquivo joga uma masmorra diferente, e "o núcleo inicial vence a primeira masmorra"
  // deixa de ser uma afirmação sobre o conteúdo para virar uma aposta. Em produção continua
  // aleatório; aqui é um contador.
  let nonce = 0;
  return buildApp({
    repository: createMemoryPlayerRepository([]),
    heroRepository: createMemoryHeroRepository([]),
    arenaDefenseRepository: createMemoryArenaDefenseRepository(),
    partyPresetRepository: createMemoryPartyPresetRepository(),
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
    newNonce: () => `nonce-primeira-sessao-${(nonce += 1)}`,
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
async function venceCapitulo(
  eu: ReturnType<typeof jogador>,
  heroIds: readonly string[],
  missao = CAPITULO,
  tentativas = 8,
) {
  let ultima = await jogarCapitulo(eu, heroIds, missao);
  for (let i = 1; i < tentativas && ultima.body.outcome !== 'victory'; i += 1) {
    expect(ultima.body.premiumAwarded ?? 0, 'derrota não paga').toBe(0);
    ultima = await jogarCapitulo(eu, heroIds, missao);
  }
  return ultima;
}

// M27 2/N — quem joga pelo jogador aqui é o PILOTO, e não `resolveAutoBattle`.
//
// `resolveAutoBattle` decide por `decideMapAiCommand`, e nenhum dos cinco arquétipos de §9.1
// persegue objetivo de mapa: numa missão de `seize` ele mata todo mundo, fica parado a quatro
// tiles do tile alvo e roda até o teto de comandos. Como este arquivo é a prova de que uma
// conta nova ATRAVESSA a campanha, usar um jogador que não sabe tomar um objetivo mediria o
// arnês em vez do conteúdo — e foi assim que a 1/N leu 0/20 numa missão que dá 20/20.
//
// O capítulo 1 tem duas missões de `seize` desde a 2/N, então isto não é higiene: sem a troca,
// as duas seriam perdidas oito vezes seguidas e a corrente seguiria em frente sem reprovar,
// porque só a ÚLTIMA missão tem asserção de desfecho.
async function jogarCapitulo(eu: ReturnType<typeof jogador>, heroIds: readonly string[], missao = CAPITULO) {
  const ticket = await eu.post(`/campaign/${missao}/ticket`, { heroIds });
  expect(ticket.status, JSON.stringify(ticket.body)).toBe(200);
  const jogada = playFromSetup(ticket.body.setup, ticket.body.seed, missao);
  return eu.post(`/campaign/${missao}/run`, {
    nonce: ticket.body.nonce,
    heroIds,
    commands: jogada.commandLog,
    rulesVersion: RULES_VERSION,
  });
}

// Quem vai para cada VAGA, na ordem em que a missão as declara.
//
// A vaga nomeia um personagem (`characterId`), e mandar o roster em ordem alfabética coloca
// o arcanista e o arqueiro na frente — os dois mais frágeis. Medido nesta fatia: a mesma
// missão dá 20/20 com hero-jogador+clérigo e 0/20 com arcanista+arqueiro. O jogador escolhe
// olhando a tela; o teste escolhe lendo a missão, que é o mais perto disso que ele consegue.
//
// A ordem do array importa e é contrato: `assembleChapterBattle` casa `stored[index]` com
// `slots[index]`, e `getHeroesByIds` devolve na ordem pedida (ver `repository/types.ts`).
function timeParaMissao(
  heroes: readonly { hero: { id: string; characterId: string } }[],
  missaoId: string,
): readonly string[] {
  const missao = catalog.encounters.find((e) => e.id === missaoId)!;
  return missao.units
    .filter((unit) => unit.side === 'player')
    .map((vaga) => {
      const dono = heroes.find((h) => h.hero.characterId === (vaga.side === 'player' ? vaga.hero.characterId : ''));
      expect(dono, `${missaoId}: a conta não tem quem preenche a vaga ${vaga.unitId}`).toBeDefined();
      return dono!.hero.id;
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
    const heroIds = timeParaMissao(heroes, catalog.encounters.find((e) => e.chapterId === CAPITULO_1 && e.order === 1)!.id);
    // A masmorra aceita mais gente que o capítulo, mas também por vagas — e precisa do time
    // cheio: com um herói só ela é perdida, e perder gasta energia igual (decisão de M14).
    const timeCompleto = heroes.slice(0, VAGAS_DA_MASMORRA).map((h) => h.hero.id);

    // ---- 1. o capítulo 1, MISSÃO A MISSÃO ---------------------------------------------
    //
    // **Medido em M18/M23: 39 vitórias em 60 execuções (65%)** com a IA jogando pelo
    // jogador. A seed sai do nonce do ticket, então cada tentativa é uma batalha diferente —
    // e repetir é DE GRAÇA (a campanha não cobra energia, e a derrota não tira nada). O
    // teste faz o que o jogador faz: tenta de novo. Um humano lendo o preview de duelo
    // decide melhor que a IA de mapa, então 65% é o piso, não o teto.
    //
    // **M27 mudou a aritmética desta corrente, e o achado fica registrado:** até aqui UM
    // capítulo pagava 600 e bancava a invocação de 500 sozinho. Com o pagamento por missão
    // (60) mais o bônus de capítulo (300), a primeira invocação deixou de caber numa vitória
    // só — e isso é a decisão de D23 funcionando, não um defeito. O que banca a invocação
    // agora são DUAS fontes das quatro de M18 4/N trabalhando juntas: a campanha e a
    // conquista. Este teste passou a exercitar as duas, que é mais do que ele fazia.
    // Cada missão declara as próprias VAGAS (M18 5/N), e mandar mais heróis que vagas é
    // recusado — então o time sai do que a missão pede, e não de um número fixo.
    //
    // **A medição da 1/N estava errada, e a 2/N a refez — fica registrado porque o número
    // errado justificou uma decisão.** Ela usava `resolveAutoBattle` como jogador, e nenhum
    // dos cinco arquétipos de §9.1 persegue objetivo de mapa: numa missão de `seize` ele mata
    // todo mundo e roda até o teto de comandos. Foi assim que `encounter-campanha-2` apareceu
    // como 0/20 e virou "autorado para nível 10, e a party real é de nível 1" — duas
    // afirmações falsas: o núcleo inicial é **nível 10** (`characters/*.json`), e com o piloto
    // que persegue objetivo a missão dá **20/20 com a ficha da conta nova**.
    //
    // **Medido de novo em M27 2/N**, com o piloto e a ficha livre em 40 seeds fixas: o
    // capítulo 1 vai de 100% nas seis primeiras missões a 57% na mais difícil. A rampa das
    // trinta está em `packages/content/tests/demoDeTrintaMissoes.test.ts`, e o critério de
    // aceite 3 inteiro — a conta que nunca pagou fechando os três capítulos — em
    // `demoCompleta.test.ts`.
    const missoesDoCapitulo1 = catalog.encounters.filter((e) => e.chapterId === CAPITULO_1).map((e) => e.id);
    expect(missoesDoCapitulo1.length, 'o capítulo 1 tem dez missões').toBe(10);

    // Toda missão do capítulo é vencida, e não só a primeira — a asserção de desfecho ficava
    // só na última, e por isso uma missão perdida oito vezes no meio passava em silêncio.
    for (const missaoId of missoesDoCapitulo1) {
      const resultado = await venceCapitulo(eu, timeParaMissao(heroes, missaoId), missaoId);
      expect(resultado.body.outcome, `${missaoId}: ${JSON.stringify(resultado.body)}`).toBe('victory');
    }

    // ---- 1b. a conquista de "primeiro passo", que virou por MISSÃO em M27 --------------
    const premios = await eu.get('/me/rewards');
    const primeiroPasso = (premios.body.rewards as { id: string; claimable: boolean }[]).find(
      (r) => r.id === 'achievement-primeiro-passo',
    );
    expect(primeiroPasso?.claimable, 'limpar missão torna "Primeiro Passo" reivindicável').toBe(true);
    const reivindicado = await eu.post('/rewards/achievement-primeiro-passo/claim', {});
    expect(reivindicado.status, JSON.stringify(reivindicado.body)).toBe(200);

    // A primeira completude paga, e é ESSA moeda que banca a invocação. Nenhum número foi
    // posto no banco à mão.
    expect(reivindicado.body.premium).toBeGreaterThanOrEqual(catalog.premiumRules.summon.premiumCost);

    // ---- 2. a primeira invocação ------------------------------------------------------
    const invocacao = await eu.post('/summon', { nonce: 'nonce-primeiro-summon', bannerId: BANNER.id });
    expect(invocacao.status, JSON.stringify(invocacao.body)).toBe(200);
    expect(invocacao.body.premium).toBe(reivindicado.body.premium - catalog.premiumRules.summon.premiumCost);

    // ---- 3. um item, e equipá-lo -------------------------------------------------------
    // Equipamento não nasce com a conta: ele cai na masmorra, que custa energia — e a
    // energia é o único recurso que a conta nova já tem cheio.
    const ticketMasmorra = await eu.post(`/dungeons/${MASMORRA.id}/ticket`, { heroIds: timeCompleto });
    expect(ticketMasmorra.status, JSON.stringify(ticketMasmorra.body)).toBe(200);
    const jogada = resolveAutoBattle({ setup: ticketMasmorra.body.setup, seed: ticketMasmorra.body.seed });
    const run = await eu.post(`/dungeons/${MASMORRA.id}/run`, {
      // O nonce do TICKET, e não um escrito aqui: é dele que sai a seed que o servidor usa
      // para reexecutar. Ver o cabeçalho — este era o fio solto do M23.
      nonce: ticketMasmorra.body.nonce,
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

  // M26 3/N — a arte da campanha e da masmorra, contra o CATÁLOGO REAL.
  //
  // `battles.test.ts` prova a mesma costura com fixture sintética, e prova o que só a arena
  // tem (o time do defensor). O que só este arquivo prova é que os ids que o servidor manda
  // são os ids que o manifesto usa: numa fixture, 'enemy-tirano' é uma string qualquer; aqui
  // ele é uma entrada de `packages/data/unit-art/`.
  it('o ticket de capítulo e o de masmorra dizem quem é cada unidade, com ids do catálogo real', async () => {
    const app = servidorVazio();
    const eu = await contaNova(app, 'jogador-novo');
    const heroes = (await eu.get('/me/heroes')).body as { hero: { id: string; characterId: string } }[];

    const capitulo = await eu.post(`/campaign/${CAPITULO}/ticket`, { heroIds: [heroes[0]!.hero.id] });
    expect(capitulo.status, JSON.stringify(capitulo.body)).toBe(200);
    const mapa = capitulo.body.characterIdByUnitId as Record<string, string>;

    // Toda unidade do tabuleiro tem quem seja — o capítulo 1 não tem ficha sem personagem.
    const unidades = (capitulo.body.setup.units as { unitId: string }[]).map((u) => u.unitId);
    expect(Object.keys(mapa).sort()).toEqual([...unidades].sort());

    // O herói do jogador sai como PERSONAGEM e não como instância. É a linha inteira do bug:
    // `unitId` aqui é 'player-<id da instância>', que não é ninguém no manifesto.
    expect(mapa[`player-${heroes[0]!.hero.id}`]).toBe(heroes[0]!.hero.characterId);
    expect(Object.values(mapa)).not.toContain(heroes[0]!.hero.id);

    // E todo id que sai daqui é um id que o manifesto de arte conhece.
    for (const id of Object.values(mapa)) {
      expect(catalog.characters[id] ?? catalog.enemies[id], `${id} não está no catálogo`).toBeDefined();
    }

    const timeCompleto = heroes.slice(0, VAGAS_DA_MASMORRA).map((h) => h.hero.id);
    const masmorra = await eu.post(`/dungeons/${MASMORRA.id}/ticket`, { heroIds: timeCompleto });
    expect(masmorra.status, JSON.stringify(masmorra.body)).toBe(200);
    const mapaMasmorra = masmorra.body.characterIdByUnitId as Record<string, string>;
    expect(Object.keys(mapaMasmorra).length).toBeGreaterThan(0);
    for (const id of Object.values(mapaMasmorra)) {
      expect(catalog.characters[id] ?? catalog.enemies[id], `${id} não está no catálogo`).toBeDefined();
    }
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
