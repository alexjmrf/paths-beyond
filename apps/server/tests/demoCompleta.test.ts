import { loadCatalogFromDisk, playFromSetup } from '@paths-beyond/content';
import { RULES_VERSION } from '@paths-beyond/core';
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

// §10/D21/D23 (M27, 2/N) — O CRITÉRIO DE ACEITE 3, INTEIRO: **uma conta que nunca gasta
// dinheiro real completa os três capítulos.**
//
// D21 fechou o jogo como F2P com moeda premium, e o roadmap do M27 é explícito sobre a
// consequência: ela "só pode ser medida quando o conteúdo da demo existir". Agora existe —
// trinta missões —, e este arquivo é a medição.
//
// **Por que não bastava `primeiraSessao.test.ts`.** Aquele prova a CORRENTE de uma sessão
// (capítulo → moeda → invocação → equipar → talento → arena) e para no capítulo 1. A pergunta
// deste é outra e só a demo inteira responde: a rampa fecha? Existe alguma missão, das trinta,
// em que a conta que nunca pagou empaca?
//
// **O que este arquivo NÃO precisa provar por asserção, porque é estrutural:** não existe rota
// de pagamento no servidor (§15 mantém integração de pagamento fora de escopo, e D21 acrescenta
// que numa loja de desktop quem cobra é a plataforma). Não há como esta conta gastar dinheiro
// real nem por engano. O que ele mede, então, é o que sobra e é o que importa: a demo inteira
// vencida pelo caminho gratuito, e a moeda premium ANDANDO PARA CIMA o tempo todo — ela é
// paga pela campanha, e nunca cobrada por ela.
//
// **Determinístico de ponta a ponta.** A seed de cada tentativa sai do nonce (`deriveSeed`), e
// o nonce é injetado por um contador — não pelo gerador aleatório de produção. Duas execuções
// deste arquivo jogam exatamente as mesmas batalhas, na mesma ordem, com o mesmo número de
// tentativas. Um teste de "a demo é vencível" que dependesse de sorte seria a pior espécie de
// teste intermitente: o que falha justamente quando o conteúdo está no limite.

const TICKET_SECRET = 'segredo-da-demo';
const AGORA = Date.UTC(2026, 5, 1);

const catalog = loadCatalogFromDisk();

// Teto de tentativas por missão. Não é regra: é o que transforma "esta missão é invencível"
// numa reprovação com nome, em vez de um teste que roda para sempre. A missão mais difícil da
// demo está em 28% (ver `demoDeTrintaMissoes.test.ts`), então 40 é folga larga — e o relatório
// no fim diz quantas tentativas cada missão de fato custou.
const TENTATIVAS_MAX = 40;

function servidorVazio() {
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
    rateLimiter: createInMemoryRateLimiter({ maxRequests: 100_000, windowMs: 60_000 }),
    ticketSecret: TICKET_SECRET,
    identityValidator: createDevIdentityValidator(),
    now: () => AGORA,
    newNonce: () => `nonce-demo-${(nonce += 1)}`,
  });
}

type App = ReturnType<typeof buildApp>;

function jogador(app: App, identidade: string) {
  const cabecalho = { 'x-platform-ticket': `dev:${identidade}` };
  return {
    async post(url: string, payload: Record<string, unknown> = {}) {
      const r = await app.inject({ method: 'POST', url, headers: cabecalho, payload });
      return { status: r.statusCode, body: r.json() as any };
    },
    async get(url: string) {
      const r = await app.inject({ method: 'GET', url, headers: cabecalho });
      return { status: r.statusCode, body: r.json() as any };
    },
  };
}

interface Heroi {
  readonly hero: { readonly id: string; readonly characterId: string };
}

// Quem vai para cada VAGA, na ordem em que a missão as declara. A ordem do array é contrato:
// `assembleChapterBattle` casa `stored[index]` com `slots[index]`, e `getHeroesByIds` devolve
// na ordem pedida. Mandar o roster em ordem alfabética colocaria o arcanista e o arqueiro na
// frente — os dois mais frágeis —, e o teste mediria uma escolha que nenhum jogador faria.
function timeParaMissao(heroes: readonly Heroi[], missaoId: string): readonly string[] {
  const missao = catalog.encounters.find((e) => e.id === missaoId)!;
  return missao.units
    .filter((unit) => unit.side === 'player')
    .map((vaga) => {
      const characterId = vaga.side === 'player' ? vaga.hero.characterId : undefined;
      const dono = heroes.find((h) => h.hero.characterId === characterId);
      expect(dono, `${missaoId}: a conta não tem quem preenche a vaga ${vaga.unitId}`).toBeDefined();
      return dono!.hero.id;
    });
}

describe('M27 — a demo inteira, por uma conta que nunca pagou', () => {
  it('as trinta missões, os três capítulos, sem uma linha escrita no banco à mão', async () => {
    const app = servidorVazio();
    const eu = jogador(app, 'jogador-da-demo');

    // O sign-in é o primeiro ato do jogo: é ele que cria a conta e entrega o núcleo de
    // história (M20). Nada antes dele existe.
    expect((await eu.post('/accounts/session')).status, 'sign-in criou a conta').toBe(200);
    const heroes = (await eu.get('/me/heroes')).body as Heroi[];
    const energiaInicial = (await eu.get('/me/economy')).body.energy as { stored: number; asOfMs: number };

    // A conta nasce sem moeda premium. Tudo que aparecer daqui para a frente foi ganho
    // jogando — e é essa a afirmação inteira do arquivo.
    expect((await eu.get('/me/roster')).body.premium, 'a conta nasce zerada').toBe(0);

    const relatorio: string[] = [];
    let premiumGanho = 0;
    let premiumAnterior = 0;

    // A ordem é a do catálogo: (posição do capítulo, posição da missão). É a ordem em que o
    // jogador encontra as missões na tela.
    for (const missao of catalog.encounters) {
      const time = timeParaMissao(heroes, missao.id);
      let tentativas = 0;
      let resultado: { status: number; body: any } | undefined;

      while (tentativas < TENTATIVAS_MAX) {
        tentativas += 1;
        const ticket = await eu.post(`/campaign/${missao.id}/ticket`, { heroIds: time });
        expect(ticket.status, `${missao.id}: ${JSON.stringify(ticket.body)}`).toBe(200);

        const jogada = playFromSetup(ticket.body.setup, ticket.body.seed, missao.id);
        resultado = await eu.post(`/campaign/${missao.id}/run`, {
          nonce: ticket.body.nonce,
          heroIds: time,
          commands: jogada.commandLog,
          rulesVersion: RULES_VERSION,
        });
        expect(resultado.status, `${missao.id}: ${JSON.stringify(resultado.body)}`).toBe(200);
        if (resultado.body.outcome === 'victory') break;

        // Perder é de graça, e é isso que torna aceitável uma missão em 28%: a campanha não
        // cobra energia e a derrota não tira nada. Se um dia passar a cobrar, reprova aqui.
        expect(resultado.body.premiumAwarded, `${missao.id}: derrota pagou`).toBe(0);
        expect(resultado.body.premium, `${missao.id}: derrota custou moeda`).toBe(premiumAnterior);
      }

      expect(
        resultado?.body.outcome,
        `${missao.id}: não venceu em ${TENTATIVAS_MAX} tentativas — a conta que nunca pagou empacou aqui`,
      ).toBe('victory');

      premiumGanho += resultado!.body.premiumAwarded as number;
      premiumAnterior = resultado!.body.premium as number;
      relatorio.push(`${missao.chapterId} o${String(missao.order).padStart(2)} ${missao.id.padEnd(38)} ${String(tentativas).padStart(2)} tentativa(s)  +${resultado!.body.premiumAwarded}`);
    }

    console.log('\nM27 — a demo jogada por uma conta nova\n' + relatorio.join('\n'));

    // ---- o estado que a TELA mostra -----------------------------------------------------
    const campanha = (await eu.get('/campaign')).body;
    expect(campanha.chapters).toHaveLength(3);
    for (const capitulo of campanha.chapters) {
      expect(capitulo.missions, `${capitulo.id}`).toHaveLength(10);
      expect(capitulo.cleared, `${capitulo.id} não fechou`).toBe(true);
      for (const m of capitulo.missions) expect(m.cleared, `${m.id}`).toBe(true);
    }

    // ---- a moeda: paga pela campanha, nunca cobrada por ela ------------------------------
    // 30 missões × 60 + 3 capítulos × 300 (D31). O número é derivado do catálogo e não escrito
    // aqui: quando a economia mudar, o teste acompanha em vez de reprovar pelo motivo errado.
    const esperado =
      30 * catalog.premiumRules.premiumRewards.missionFirstClear +
      3 * catalog.premiumRules.premiumRewards.chapterFirstClear;
    expect(premiumGanho, 'a demo inteira paga por missão e por capítulo').toBe(esperado);
    expect((await eu.get('/me/roster')).body.premium).toBe(esperado);

    // ---- e a campanha não cobrou energia -------------------------------------------------
    // "A energia e o summon aceleram e nunca destravam" — a metade da energia se mede assim:
    // trinta missões e as derrotas do caminho, e o medidor no mesmo lugar.
    expect((await eu.get('/me/economy')).body.energy, 'a campanha cobrou energia').toEqual(energiaInicial);
  });

  it('e as três conquistas de campanha ficam reivindicáveis — a segunda fonte gratuita', async () => {
    // A demo completa é o que torna "A Fortaleza Caiu" (3 capítulos) alcançável. Sem esta
    // asserção, uma conquista pedindo mais capítulos do que a demo tem passaria despercebida:
    // ela não quebra nada, só nunca acontece.
    const app = servidorVazio();
    const eu = jogador(app, 'jogador-das-conquistas');
    await eu.post('/accounts/session');
    const heroes = (await eu.get('/me/heroes')).body as Heroi[];

    for (const missao of catalog.encounters) {
      const time = timeParaMissao(heroes, missao.id);
      for (let i = 0; i < TENTATIVAS_MAX; i++) {
        const ticket = await eu.post(`/campaign/${missao.id}/ticket`, { heroIds: time });
        const jogada = playFromSetup(ticket.body.setup, ticket.body.seed, missao.id);
        const r = await eu.post(`/campaign/${missao.id}/run`, {
          nonce: ticket.body.nonce,
          heroIds: time,
          commands: jogada.commandLog,
          rulesVersion: RULES_VERSION,
        });
        if (r.body.outcome === 'victory') break;
      }
    }

    const premios = (await eu.get('/me/rewards')).body.rewards as { id: string; claimable: boolean }[];
    for (const id of ['achievement-primeiro-passo', 'achievement-a-estrada-aberta', 'achievement-a-fortaleza-caiu']) {
      const premio = premios.find((p) => p.id === id);
      expect(premio, `${id} não está na lista`).toBeDefined();
      expect(premio!.claimable, `${id} não ficou reivindicável com a demo inteira limpa`).toBe(true);
    }
  });
});
