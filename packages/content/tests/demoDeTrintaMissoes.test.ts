import { describe, expect, it } from 'vitest';
import { loadCatalogFromDisk } from '../src/loadCatalogFromDisk.js';
import { COMMAND_BUDGET, comFichaInicial, playthrough } from '../src/campaignPilot.js';

// M27, 2/N — A DEMO: três capítulos, dez missões cada, e a rampa MEDIDA.
//
// **Por que este arquivo existe e `campanha.test.ts` não bastava.** Aquele afirma, para cada
// missão, "o piloto vence na seed 42". Com seis missões isso era razoável; com trinta e uma
// rampa de dificuldade, é a asserção errada — ela não distingue "a missão é jogável" de "a
// missão é fácil", e obriga toda missão da demo a ser vencível de primeira. Uma campanha em
// que o piloto ganha sempre é um corredor, não um jogo.
//
// **A pergunta certa é a taxa, e ela é EXATA.** O piloto é determinístico e as seeds abaixo
// são fixas, então o número de vitórias de cada missão é um valor reproduzível, não uma
// amostra: este arquivo não tem nada de estatístico e não oscila entre execuções. Ele só
// falha quando o conteúdo muda — que é exatamente quando alguém precisa olhar.
//
// **A ficha é a da CONTA NOVA, não a da vaga autorada** (`comFichaInicial`). É o critério de
// aceite 3 do M27 ao pé da letra: quem nunca gastou dinheiro real completa os três capítulos.
// A vaga autorada tem talento alocado a dedo; a conta nova, não.
//
// A banda, aprovada pelo usuário nesta sub-sessão a partir da medição:
//
//  - **Piso de 25% por missão.** Abaixo disso a conta nova trava numa missão e a demo passa a
//    depender de progressão que só o pagamento acelera — que é justamente o que o critério 3
//    proíbe. Repetir é de graça (a campanha não cobra energia e a derrota não tira nada), mas
//    "de graça" não é "infinito": 25% é ~4 tentativas por missão.
//  - **Teto por CAPÍTULO: cada um tem ao menos uma missão em 60% ou menos.** Sem ele, afrouxar
//    o conteúdo até a demo inteira virar 100% passaria no piso e ninguém reprovaria.
//
// É a mesma forma piso+teto do critério do M8, e pela mesma razão: um só dos dois deixa passar
// o defeito do outro lado. O que este arquivo NÃO faz é aplicar os NÚMEROS do M8 (40-60%) a
// uma missão de campanha — lá é uma matriz entre composições simétricas de arena, e uma missão
// de PvE em 40% significaria o jogador perdendo metade da demo.
//
// O piloto é o PISO do que um humano faz: ele não escolhe skill, não gasta Valor e não lança
// skill de mapa. Missão que ele vence em 30% das seeds, um humano vence bem mais.

const catalog = loadCatalogFromDisk();

// Quarenta seeds fixas. Não são "aleatórias": são a amostra que esta fatia mediu, e mudá-las
// muda os números de todas as missões de uma vez — por isso elas são conteúdo do teste.
const SEEDS = Array.from({ length: 40 }, (_, i) => (i + 1) * 7919);

const PISO_PCT = 25;
const TETO_DO_CAPITULO_PCT = 60;

interface Medicao {
  readonly missao: string;
  readonly capitulo: string;
  readonly ordem: number;
  readonly vitorias: number;
  readonly pct: number;
}

function medir(): readonly Medicao[] {
  return catalog.encounters.map((encounter) => {
    const daContaNova = comFichaInicial(catalog, encounter);
    let vitorias = 0;
    for (const seed of SEEDS) {
      const { state, commands } = playthrough(catalog, daContaNova, seed);
      // Teto de comandos estourado não é derrota: é objetivo inalcançável, e o teste tem de
      // dizer isso em vez de deixar passar como "missão difícil".
      expect(commands, `${encounter.id} na seed ${seed} estourou o teto de comandos`).toBeLessThan(COMMAND_BUDGET);
      if (state.outcome === 'victory') vitorias += 1;
    }
    return {
      missao: encounter.id,
      capitulo: encounter.chapterId,
      ordem: encounter.order,
      vitorias,
      pct: Math.round((vitorias / SEEDS.length) * 100),
    };
  });
}

const medicoes = medir();

describe('M27 — a demo tem a forma que D23 recortou', () => {
  it('são três capítulos', () => {
    expect(catalog.chapters).toHaveLength(3);
  });

  it('cada capítulo tem exatamente dez missões, e a demo tem trinta', () => {
    for (const capitulo of catalog.chapters) {
      const missoes = catalog.encounters.filter((e) => e.chapterId === capitulo.id);
      expect(missoes.length, `${capitulo.id}`).toBe(10);
    }
    expect(catalog.encounters).toHaveLength(30);
  });

  it('a party cresce de 1 até 4 e nunca encolhe ao longo da campanha inteira', () => {
    // O catálogo já vem ordenado por (posição do capítulo, posição da missão). A propriedade
    // atravessa a fronteira do capítulo de propósito: a última missão do capítulo 1 não pode
    // pedir mais gente que a primeira do 2.
    const vagas = catalog.encounters.map((e) => e.units.filter((u) => u.side === 'player').length);
    expect(vagas[0], 'a demo começa com uma vaga').toBe(1);
    expect(Math.max(...vagas), '4 é o teto — o núcleo de história (D14)').toBe(4);
    for (let i = 1; i < vagas.length; i++) {
      expect(vagas[i]! >= vagas[i - 1]!, `a party encolheu em ${catalog.encounters[i]!.id}`).toBe(true);
    }
  });

  it('as cinco condições de vitória de §5.7 aparecem na demo', () => {
    const condicoes = new Set(
      catalog.encounters.map((e) => (e.winCondition ?? catalog.maps[e.mapId]!.winCondition).t),
    );
    for (const esperada of ['rout', 'seize', 'defend', 'surviveRounds', 'escort']) {
      expect([...condicoes], `§5.7 — ${esperada}`).toContain(esperada);
    }
  });
});

describe('M27 — a rampa: as trinta missões são jogáveis pela conta que nunca pagou', () => {
  it('a medição cobre as trinta missões', () => {
    expect(medicoes).toHaveLength(30);
  });

  it.each(medicoes.map((m) => [`${m.capitulo}/${m.ordem} ${m.missao}`, m] as const))(
    '%s: fica no piso de 25%%',
    (_rotulo, m) => {
      expect(m.pct, `${m.missao}: ${m.vitorias}/${SEEDS.length}`).toBeGreaterThanOrEqual(PISO_PCT);
    },
  );

  it.each(catalog.chapters.map((c) => [c.id, c.id] as const))(
    '%s: tem pelo menos uma missão em 60%% ou menos — capítulo que se ganha sempre é corredor',
    (_rotulo, chapterId) => {
      const doCapitulo = medicoes.filter((m) => m.capitulo === chapterId);
      const maisDificil = Math.min(...doCapitulo.map((m) => m.pct));
      expect(maisDificil, `${chapterId}: a missão mais difícil está em ${maisDificil}%`).toBeLessThanOrEqual(
        TETO_DO_CAPITULO_PCT,
      );
    },
  );

  it('a rampa medida, para quem for afinar conteúdo depois', () => {
    // Não é asserção: é o relatório que as duas acima resumem. Sem ele, uma reprovação diz
    // "esta missão caiu abaixo do piso" e não mostra o que aconteceu com as outras 29.
    const linhas = medicoes.map(
      (m) =>
        `${m.capitulo} o${String(m.ordem).padStart(2)} ${m.missao.padEnd(38)} ${String(m.vitorias).padStart(2)}/${
          SEEDS.length
        }  ${String(m.pct).padStart(3)}%`,
    );
    console.log('\nM27 — rampa da demo (piloto, ficha de conta nova, 40 seeds fixas)\n' + linhas.join('\n'));
    expect(medicoes.every((m) => m.pct >= PISO_PCT)).toBe(true);
  });
});
