import { loadCatalogFromDisk } from '@paths-beyond/content';
import { RULES_VERSION, resolveEnergy, simulate } from '@paths-beyond/core';
import { describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { createInMemoryRateLimiter } from '../src/battle/rateLimit.js';
import { CAMPOS_VISIVEIS_DO_INIMIGO } from '../src/battle/visao.js';
import { createDevIdentityValidator } from '../src/identity/devIdentity.js';
import {
  createMemoryArenaDefenseRepository,
  createMemoryCharacterOwnershipRepository,
  createMemoryEconomyRepository,
  createMemoryHeroRepository,
  createMemoryIdempotencyRepository,
  createMemoryMatchRepository,
  createMemoryPartyPresetRepository,
  createMemoryPlayerRepository,
  createMemoryReplayRepository,
  createMemoryRewardsRepository,
  createMemorySeasonRepository,
} from '../src/repository/memoryRepository.js';
import { abrirEJogar, jogarPartidaViva, type EstadoVisivelDeTeste } from './partidaViva.js';

// M36 2/N (D47) — A BATALHA VIVA, PONTA A PONTA, A PARTIR DE SERVIDOR VAZIO.
//
// **Os critérios de aceite do M36 que este arquivo prova:**
//   - campanha, masmorra e arena jogam ponta a ponta pelo caminho vivo, a partir de servidor
//     vazio, no idioma de `primeiraSessao.test.ts` (nenhuma linha escrita no banco à mão);
//   - nenhuma resposta de ROTA de batalha carrega o oculto — a prova por forma mora em
//     `visaoDoInimigo.test.ts`, e aqui ela é conferida sobre respostas de verdade;
//   - o replay de uma batalha viva reproduz o mesmo resultado que a batalha produziu;
//   - a reconexão do M22 sobrevive: cair no meio de uma batalha não a perde nem a repete.
//
// **E ele prova uma coisa a mais, que não está escrita como critério mas é o milestone
// inteiro:** o jogo é JOGÁVEL às cegas. Quem joga aqui é o piloto de `partidaViva.ts`, que
// decide vendo só posição, HP, AP, PP e iniciativa — sem `moveRange`, sem `duelRange`, sem
// script do inimigo. Se a informação que D47 deixou de pé não bastasse para jogar, este arquivo
// não passaria.

const TICKET_SECRET = 'segredo-da-batalha-viva';
const AGORA = Date.UTC(2026, 8, 1);
const MISSAO = 'encounter-campanha-1';

const catalog = loadCatalogFromDisk();
const MASMORRA = Object.values(catalog.dungeons).find((d) => !d.manualOnly && !d.requiresClearOf)!;

function servidorVazio() {
  let nonce = 0;
  return buildApp({
    repository: createMemoryPlayerRepository([]),
    heroRepository: createMemoryHeroRepository([]),
    arenaDefenseRepository: createMemoryArenaDefenseRepository(),
    partyPresetRepository: createMemoryPartyPresetRepository(),
    replayRepository: createMemoryReplayRepository(),
    matchRepository: createMemoryMatchRepository(),
    seasonRepository: createMemorySeasonRepository(),
    economyRepository: createMemoryEconomyRepository(),
    ownershipRepository: createMemoryCharacterOwnershipRepository(),
    rewardsRepository: createMemoryRewardsRepository(),
    idempotencyRepository: createMemoryIdempotencyRepository(),
    catalog,
    shopCatalog: {},
    rateLimiter: createInMemoryRateLimiter({ maxRequests: 5000, windowMs: 60_000 }),
    ticketSecret: TICKET_SECRET,
    identityValidator: createDevIdentityValidator(),
    now: () => AGORA,
    newNonce: () => `nonce-batalha-viva-${(nonce += 1)}`,
  });
}

type App = ReturnType<typeof buildApp>;

function jogador(app: App, identidade: string) {
  const cabecalho = { 'x-platform-ticket': `dev:${identidade}` };
  return {
    async post(url: string, payload: unknown = {}) {
      const r = await app.inject({ method: 'POST', url, headers: cabecalho, payload: payload as never });
      return { status: r.statusCode, body: r.json() as Record<string, unknown> };
    },
    async put(url: string, payload: unknown = {}) {
      const r = await app.inject({ method: 'PUT', url, headers: cabecalho, payload: payload as never });
      return { status: r.statusCode, body: r.json() as Record<string, unknown> };
    },
    async get(url: string) {
      const r = await app.inject({ method: 'GET', url, headers: cabecalho });
      return { status: r.statusCode, body: r.json() as Record<string, unknown> };
    },
  };
}

async function contaNova(app: App, identidade: string) {
  const eu = jogador(app, identidade);
  const sessao = await eu.post('/accounts/session');
  expect(sessao.status, 'sign-in criou a conta').toBe(200);
  return eu;
}

async function meusHeroIds(eu: ReturnType<typeof jogador>, quantos: number): Promise<readonly string[]> {
  const roster = await eu.get('/me/heroes');
  expect(roster.status).toBe(200);
  const heroes = roster.body as unknown as readonly { hero: { id: string } }[];
  return heroes.slice(0, quantos).map((h) => h.hero.id);
}

function vagasDaMissao(missaoId: string): number {
  return catalog.encounters.find((e) => e.id === missaoId)!.units.filter((u) => u.side === 'player').length;
}

/** Toda unidade inimiga de um estado visível, em qualquer lugar da resposta. */
function inimigasDe(visivel: EstadoVisivelDeTeste): readonly Record<string, unknown>[] {
  return visivel.units.filter((u) => u.side !== 'player') as unknown as readonly Record<string, unknown>[];
}

describe('M36 2/N — a CAMPANHA pelo caminho vivo, de servidor vazio', () => {
  it('abre a partida, joga comando a comando e o servidor fecha a batalha', async () => {
    const app = servidorVazio();
    const eu = await contaNova(app, 'campanha-viva');
    const heroIds = await meusHeroIds(eu, vagasDaMissao(MISSAO));

    const jogada = await abrirEJogar(eu.post, `/campaign/${MISSAO}/matches`, { heroIds, rulesVersion: RULES_VERSION });

    expect(jogada.aberturaStatus, JSON.stringify(jogada.abertura)).toBe(201);
    expect(jogada.comandos).toBeGreaterThan(0);
    // O desfecho é do SERVIDOR, e vem no comando que o produziu — não há mais submissão.
    expect(['victory', 'defeat']).toContain(jogada.outcome);
    expect(jogada.ultima?.outcome).toBe(jogada.outcome);
  });

  it('a vitória paga a primeira completude no comando que fecha a batalha, e não numa rota de submissão', async () => {
    const app = servidorVazio();
    const eu = await contaNova(app, 'campanha-premia');
    const heroIds = await meusHeroIds(eu, vagasDaMissao(MISSAO));

    // Repete até vencer, como o jogador faz. Derrota não paga — é o que torna aceitável a
    // primeira batalha ser difícil (mesma leitura de `primeiraSessao.test.ts`).
    let jogada = await abrirEJogar(eu.post, `/campaign/${MISSAO}/matches`, { heroIds, rulesVersion: RULES_VERSION });
    for (let i = 1; i < 8 && jogada.outcome !== 'victory'; i += 1) {
      expect((jogada.ultima?.liquidacao?.premiumAwarded as number) ?? 0, 'derrota não paga').toBe(0);
      jogada = await abrirEJogar(eu.post, `/campaign/${MISSAO}/matches`, { heroIds, rulesVersion: RULES_VERSION });
    }

    expect(jogada.outcome, 'a conta nova vence a primeira missão em até 8 tentativas').toBe('victory');
    expect(jogada.ultima?.liquidacao?.premiumAwarded).toBe(catalog.premiumRules.premiumRewards.missionFirstClear);

    const campanha = await eu.get('/campaign');
    const capitulos = campanha.body.chapters as readonly { missions: readonly { id: string; cleared: boolean }[] }[];
    const missao = capitulos.flatMap((c) => c.missions).find((m) => m.id === MISSAO);
    expect(missao?.cleared, 'o servidor marcou a missão como limpa').toBe(true);
  });
});

describe('M36 2/N — o inimigo desconhecido, conferido sobre RESPOSTAS DE ROTA', () => {
  it('nem a abertura, nem o comando, nem a reconexão carregam campo oculto de unidade inimiga', async () => {
    const app = servidorVazio();
    const eu = await contaNova(app, 'sem-vazamento');
    const heroIds = await meusHeroIds(eu, vagasDaMissao(MISSAO));

    const abertura = await eu.post(`/campaign/${MISSAO}/matches`, { heroIds, rulesVersion: RULES_VERSION });
    expect(abertura.status).toBe(201);
    const nonce = abertura.body.nonce as string;
    const visivelInicial = abertura.body.visivel as unknown as EstadoVisivelDeTeste;

    const permitido = new Set<string>(CAMPOS_VISIVEIS_DO_INIMIGO);
    const conferir = (visivel: EstadoVisivelDeTeste, onde: string) => {
      const inimigas = inimigasDe(visivel);
      expect(inimigas.length, `${onde}: há inimigo para conferir`).toBeGreaterThan(0);
      for (const inimiga of inimigas) {
        expect(Object.keys(inimiga).sort(), onde).toEqual([...permitido].sort());
      }
    };

    conferir(visivelInicial, 'abertura');

    // E também nos estados que viajam DENTRO do log da IA: é o caminho por onde um campo
    // esquecido vazaria sem ninguém olhar, porque ninguém pensa no `stateBefore`.
    for (const passo of (abertura.body.aberturaDaIa ?? []) as readonly { estadoAntes: EstadoVisivelDeTeste }[]) {
      conferir(passo.estadoAntes, 'abertura da IA');
    }

    const resposta = await eu.post(`/matches/${nonce}/commands`, {
      command: { t: 'wait', unitId: visivelInicial.units.find((u) => u.side === 'player')!.unitId },
    });
    expect(resposta.status, JSON.stringify(resposta.body)).toBe(200);
    conferir(resposta.body.visivel as unknown as EstadoVisivelDeTeste, 'comando');
    for (const passo of (resposta.body.passosDaIa ?? []) as readonly { estadoAntes: EstadoVisivelDeTeste }[]) {
      conferir(passo.estadoAntes, 'passo da IA');
    }

    const reconectado = await eu.get(`/matches/${nonce}`);
    expect(reconectado.status).toBe(200);
    conferir(reconectado.body.visivel as unknown as EstadoVisivelDeTeste, 'reconexão');
  });

  it('a unidade do PRÓPRIO jogador continua inteira — §1.1: ele lê o próprio compromisso', async () => {
    const app = servidorVazio();
    const eu = await contaNova(app, 'meu-lado-inteiro');
    const heroIds = await meusHeroIds(eu, vagasDaMissao(MISSAO));

    const abertura = await eu.post(`/campaign/${MISSAO}/matches`, { heroIds, rulesVersion: RULES_VERSION });
    const visivel = abertura.body.visivel as unknown as EstadoVisivelDeTeste;
    const minha = visivel.units.find((u) => u.side === 'player') as unknown as Record<string, unknown>;

    for (const campo of ['stats', 'knownSkills', 'tacticsScript', 'moveType', 'moveRange', 'duelRange']) {
      expect(minha[campo], `o jogador precisa de ${campo} do próprio lado`).toBeDefined();
    }
  });
});

describe('M36 2/N — a MASMORRA pelo caminho vivo', () => {
  it('a energia é cobrada ao ABRIR (D48), e a vitória entrega a recompensa no comando que fecha', async () => {
    const app = servidorVazio();
    const eu = await contaNova(app, 'masmorra-viva');
    const vagas = catalog.dungeonEncounters[MASMORRA.encounterId]!.units.filter((u) => u.side === 'player').length;
    const heroIds = await meusHeroIds(eu, vagas);

    // A energia guardada é do instante em que foi ESCRITA: `/me` devolve o estado cru, e quem o
    // reapura contra o agora é `resolveEnergy` (é o que toda rota de economia faz antes de
    // decidir). Comparar os dois lados já reapurados é a única leitura honesta.
    const reapurar = (corpo: Record<string, unknown>) =>
      resolveEnergy(corpo.energy as never, AGORA, catalog.economyRules.energy).stored;
    const energiaAntes = reapurar((await eu.get('/me')).body);

    const abertura = await eu.post(`/dungeons/${MASMORRA.id}/matches`, { heroIds, rulesVersion: RULES_VERSION });
    expect(abertura.status, JSON.stringify(abertura.body)).toBe(201);

    expect(reapurar((await eu.get('/me')).body), 'entrar custa energia, e agora entrar é abrir a partida').toBe(
      energiaAntes - MASMORRA.energyCost,
    );

    const jogada = await jogarPartidaViva(
      eu.post,
      abertura.body.nonce as string,
      abertura.body.visivel as unknown as EstadoVisivelDeTeste,
    );
    expect(['victory', 'defeat']).toContain(jogada.outcome);
    if (jogada.outcome === 'victory') {
      expect(jogada.ultima?.liquidacao?.rewards).toBeTruthy();
    } else {
      expect(jogada.ultima?.liquidacao?.rewards).toBeNull();
    }
  });

  it('não dá para abrir uma segunda partida enquanto a primeira corre — é o que faz o custo valer', async () => {
    const app = servidorVazio();
    const eu = await contaNova(app, 'uma-de-cada-vez');
    const vagas = catalog.dungeonEncounters[MASMORRA.encounterId]!.units.filter((u) => u.side === 'player').length;
    const heroIds = await meusHeroIds(eu, vagas);

    const primeira = await eu.post(`/dungeons/${MASMORRA.id}/matches`, { heroIds, rulesVersion: RULES_VERSION });
    expect(primeira.status).toBe(201);

    const segunda = await eu.post(`/dungeons/${MASMORRA.id}/matches`, { heroIds, rulesVersion: RULES_VERSION });
    expect(segunda.status).toBe(409);
    // E a recusa entrega o nonce da que já existe: quem pediu está reconectando, não errando.
    expect(segunda.body.nonce).toBe(primeira.body.nonce);

    // Nem por outra superfície: a trava é por JOGADOR, não por tipo de batalha.
    const capitulo = await eu.post(`/campaign/${MISSAO}/matches`, { heroIds, rulesVersion: RULES_VERSION });
    expect(capitulo.status).toBe(409);
  });

  it('desistir fecha a partida e não devolve o que foi pago', async () => {
    const app = servidorVazio();
    const eu = await contaNova(app, 'desiste');
    const vagas = catalog.dungeonEncounters[MASMORRA.encounterId]!.units.filter((u) => u.side === 'player').length;
    const heroIds = await meusHeroIds(eu, vagas);

    const abertura = await eu.post(`/dungeons/${MASMORRA.id}/matches`, { heroIds, rulesVersion: RULES_VERSION });
    const nonce = abertura.body.nonce as string;
    const energiaDepoisDeAbrir = ((await eu.get('/me')).body.energy as { stored: number }).stored;

    const desistencia = await eu.post(`/matches/${nonce}/forfeit`);
    expect(desistencia.status).toBe(200);
    expect(desistencia.body.forfeited).toBe(true);

    expect(((await eu.get('/me')).body.energy as { stored: number }).stored).toBe(energiaDepoisDeAbrir);
    // E o jogador volta a poder abrir: desistir é a saída, não uma prisão.
    const outra = await eu.post(`/dungeons/${MASMORRA.id}/matches`, { heroIds, rulesVersion: RULES_VERSION });
    expect(outra.status).toBe(201);
  });
});

describe('M36 2/N — a ARENA pelo caminho vivo', () => {
  async function comDefesa(app: App) {
    const defensor = await contaNova(app, 'defensor-vivo');
    const heroIds = await meusHeroIds(defensor, 2);
    const mapId = Object.keys(catalog.maps)[0]!;
    const defesa = await defensor.put('/me/defense', {
      mapId,
      units: heroIds.map((heroId, i) => ({ heroId, pos: { x: 4, y: i + 1 }, height: 0, aiArchetype: 'aggressive' })),
    });
    expect(defesa.status, JSON.stringify(defesa.body)).toBe(200);
    const eu = await defensor.get('/me');
    return { defensor, defenderPlayerId: eu.body.id as string };
  }

  it('o atacante joga a defesa pelo mesmo caminho, e ELO e marcas saem no fim', async () => {
    const app = servidorVazio();
    const { defenderPlayerId } = await comDefesa(app);
    const atacante = await contaNova(app, 'atacante-vivo');
    const attackerHeroIds = await meusHeroIds(atacante, 2);

    const jogada = await abrirEJogar(atacante.post, '/arena/matches', {
      attackerHeroIds,
      defenderPlayerId,
      rulesVersion: RULES_VERSION,
    });

    expect(jogada.aberturaStatus, JSON.stringify(jogada.abertura)).toBe(201);
    expect(['victory', 'defeat']).toContain(jogada.outcome);
    expect(jogada.ultima?.liquidacao?.elo).toBeDefined();
    expect(jogada.ultima?.liquidacao?.arenaMarks).toBeDefined();
  });

  it('o time do DEFENSOR chega redigido — em PvP não há catálogo que devolva o que foi escondido', async () => {
    const app = servidorVazio();
    const { defenderPlayerId } = await comDefesa(app);
    const atacante = await contaNova(app, 'atacante-cego');
    const attackerHeroIds = await meusHeroIds(atacante, 2);

    const abertura = await atacante.post('/arena/matches', {
      attackerHeroIds,
      defenderPlayerId,
      rulesVersion: RULES_VERSION,
    });
    expect(abertura.status).toBe(201);

    const visivel = abertura.body.visivel as unknown as EstadoVisivelDeTeste;
    const permitido = new Set<string>(CAMPOS_VISIVEIS_DO_INIMIGO);
    const inimigas = inimigasDe(visivel);
    expect(inimigas.length).toBeGreaterThan(0);
    for (const inimiga of inimigas) {
      expect(Object.keys(inimiga).sort()).toEqual([...permitido].sort());
    }
  });
});

describe('M36 2/N — o replay de uma batalha viva reproduz o que ela produziu', () => {
  it('reexecutar a receita gravada dá o mesmo desfecho, os mesmos rounds e as mesmas unidades finais', async () => {
    const app = servidorVazio();
    const eu = await contaNova(app, 'replay-vivo');
    const heroIds = await meusHeroIds(eu, vagasDaMissao(MISSAO));

    const jogada = await abrirEJogar(eu.post, `/campaign/${MISSAO}/matches`, { heroIds, rulesVersion: RULES_VERSION });
    expect(jogada.outcome).not.toBe('ongoing');

    const guardado = await eu.get(`/battles/${jogada.nonce}`);
    expect(guardado.status, JSON.stringify(guardado.body)).toBe(200);

    // O replay é `{rulesVersion, seed, initialState, commands}` (§3.4). Reexecutá-lo com
    // `simulate` é o caminho independente: o servidor construiu o resultado comando a comando,
    // e aqui ele é reconstruído em lote. Se os dois divergissem, §9.1 chamaria de bug crítico.
    const replay = guardado.body as unknown as {
      rulesVersion: string;
      seed: number;
      initialState: never;
      commands: never;
      result: { outcome: string; roundsPlayed: number; finalUnits: readonly unknown[] };
    };
    const reexecutado = simulate({
      rulesVersion: replay.rulesVersion,
      seed: replay.seed,
      initialState: replay.initialState,
      commands: replay.commands,
    });

    expect(reexecutado.outcome).toBe(replay.result.outcome);
    expect(reexecutado.roundsPlayed).toBe(replay.result.roundsPlayed);
    expect(reexecutado.finalUnits).toEqual(replay.result.finalUnits);
    expect(replay.result.outcome).toBe(jogada.outcome);
  });
});

describe('M36 2/N — a reconexão do M22 sobrevive à batalha viva', () => {
  it('cair no meio da batalha não a perde: `GET /matches/current` devolve a mesma partida, no mesmo ponto', async () => {
    const app = servidorVazio();
    const eu = await contaNova(app, 'reconecta');
    const heroIds = await meusHeroIds(eu, vagasDaMissao(MISSAO));

    const abertura = await eu.post(`/campaign/${MISSAO}/matches`, { heroIds, rulesVersion: RULES_VERSION });
    const nonce = abertura.body.nonce as string;
    const visivel = abertura.body.visivel as unknown as EstadoVisivelDeTeste;

    const resposta = await eu.post(`/matches/${nonce}/commands`, {
      command: { t: 'wait', unitId: visivel.units.find((u) => u.side === 'player')!.unitId },
    });
    expect(resposta.status).toBe(200);
    const depoisDoComando = resposta.body.visivel as EstadoVisivelDeTeste;

    // A queda: o cliente some. O servidor é quem sabe.
    const voltando = await eu.get('/matches/current');
    expect(voltando.status).toBe(200);
    expect(voltando.body.nonce).toBe(nonce);
    // Mesmo ponto, não um recomeço e não um passo a mais: o estado é DERIVADO da mesma receita.
    expect(voltando.body.visivel).toEqual(depoisDoComando);
  });

  it('e não a REPETE: reconectar LÊ, nunca avança, e comando recusado não entra no log', async () => {
    const app = servidorVazio();
    const eu = await contaNova(app, 'nao-repete');
    const heroIds = await meusHeroIds(eu, vagasDaMissao(MISSAO));

    const abertura = await eu.post(`/campaign/${MISSAO}/matches`, { heroIds, rulesVersion: RULES_VERSION });
    const nonce = abertura.body.nonce as string;
    const visivel = abertura.body.visivel as unknown as EstadoVisivelDeTeste;
    const minha = visivel.units.find((u) => u.side === 'player')!;

    const jogado = await eu.post(`/matches/${nonce}/commands`, { command: { t: 'wait', unitId: minha.unitId } });
    expect(jogado.status).toBe(200);

    // Reconectar três vezes seguidas: a leitura é pura. Se o estado fosse GUARDADO e não
    // derivado, ou se ler reaplicasse alguma coisa, é aqui que apareceria.
    const primeira = await eu.get('/matches/current');
    const segunda = await eu.get('/matches/current');
    const terceira = await eu.get(`/matches/${nonce}`);
    expect(primeira.body.visivel).toEqual(jogado.body.visivel);
    expect(segunda.body.visivel).toEqual(primeira.body.visivel);
    expect(terceira.body.visivel).toEqual(primeira.body.visivel);

    // E um comando que o motor recusa não entra no log: reconectar depois dele encontra
    // exatamente o mesmo ponto. Sem isso, um cliente instável encheria a partida de lixo.
    const recusado = await eu.post(`/matches/${nonce}/commands`, {
      command: { t: 'move', unitId: minha.unitId, path: [{ x: -1, y: -1 }] },
    });
    expect(recusado.status).toBe(400);
    expect((await eu.get('/matches/current')).body.visivel).toEqual(primeira.body.visivel);
  });

  it('sem batalha aberta, `GET /matches/current` é 404 — "não tenho" é diferente de "tenho uma vazia"', async () => {
    const app = servidorVazio();
    const eu = await contaNova(app, 'sem-batalha');
    const r = await eu.get('/matches/current');
    expect(r.status).toBe(404);
  });
});

describe('M36 2/N — o que o servidor recusa', () => {
  it('não dá para mover a peça do INIMIGO: a rota é aberta, e a checagem de lado é nova', async () => {
    const app = servidorVazio();
    const eu = await contaNova(app, 'peca-alheia');
    const heroIds = await meusHeroIds(eu, vagasDaMissao(MISSAO));

    const abertura = await eu.post(`/campaign/${MISSAO}/matches`, { heroIds, rulesVersion: RULES_VERSION });
    const visivel = abertura.body.visivel as unknown as EstadoVisivelDeTeste;
    const inimiga = visivel.units.find((u) => u.side !== 'player')!;

    const r = await eu.post(`/matches/${abertura.body.nonce as string}/commands`, {
      command: { t: 'wait', unitId: inimiga.unitId },
    });
    expect(r.status).toBe(403);
    expect(r.body.error).toContain('não é sua');
  });

  it('a partida de outra conta não se joga nem se lê', async () => {
    const app = servidorVazio();
    const dono = await contaNova(app, 'dono');
    const heroIds = await meusHeroIds(dono, vagasDaMissao(MISSAO));
    const abertura = await dono.post(`/campaign/${MISSAO}/matches`, { heroIds, rulesVersion: RULES_VERSION });
    const nonce = abertura.body.nonce as string;

    const intruso = await contaNova(app, 'intruso');
    expect((await intruso.get(`/matches/${nonce}`)).status).toBe(403);
    expect((await intruso.post(`/matches/${nonce}/commands`, { command: { t: 'wait', unitId: 'x' } })).status).toBe(403);
  });

  it('cliente de outra `rulesVersion` não abre partida — a tela de atualizar continua alcançável', async () => {
    const app = servidorVazio();
    const eu = await contaNova(app, 'versao-velha');
    const heroIds = await meusHeroIds(eu, vagasDaMissao(MISSAO));

    const r = await eu.post(`/campaign/${MISSAO}/matches`, { heroIds, rulesVersion: '0.0.1-antiga' });
    expect(r.status).toBe(409);
    expect(JSON.stringify(r.body)).toContain('rulesVersion');
  });

  it('batalha fechada não aceita mais comando', async () => {
    const app = servidorVazio();
    const eu = await contaNova(app, 'ja-acabou');
    const heroIds = await meusHeroIds(eu, vagasDaMissao(MISSAO));

    const jogada = await abrirEJogar(eu.post, `/campaign/${MISSAO}/matches`, { heroIds, rulesVersion: RULES_VERSION });
    expect(jogada.outcome).not.toBe('ongoing');

    const r = await eu.post(`/matches/${jogada.nonce}/commands`, { command: { t: 'wait', unitId: 'qualquer' } });
    expect(r.status).toBe(409);
  });
});
