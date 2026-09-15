import { loadCatalogFromDisk } from '@paths-beyond/content';
import { describe, expect, it } from 'vitest';
import { gerarRelatorio, ordemDasMissoes, resumirTelemetria } from '../src/telemetry/relatorio.js';
import type { MissionAttempt, TelemetryAccount } from '../src/repository/types.js';

// M34 3/N (D45) — o RELATÓRIO do playtest: número, não impressão.
//
// O aceite pede que se responda "onde os jogadores param na demo e quanto tempo cada missão
// leva" por número. O relatório é uma função pura sobre o que o repositório devolve (todas as
// tentativas, todas as contas), e é ela que se testa: com um dado semeado à mão, cada número
// do texto tem de bater com o que se calcula de cabeça. A leitura do banco fica no `cli`,
// que é uma linha.
//
// Três respostas, na ordem em que se pergunta: POR MISSÃO (tentativas, vitórias, derrotas,
// abandonos, duração mediana, rounds medianos), o FUNIL (quantas contas chegaram a cada
// missão e quantas a venceram; a última missão vencida por conta é "onde ela parou") e a
// PRESENÇA (contas vistas nos últimos 1/7 dias, mais velhas, e quantas recusaram).

const catalog = loadCatalogFromDisk();
const AGORA = Date.UTC(2026, 8, 15, 12, 0, 0);
const DIA = 24 * 60 * 60 * 1000;

const [M1, M2, M3] = ordemDasMissoes(catalog).slice(0, 3) as [string, string, string];

function tentativa(
  playerId: string,
  missionId: string,
  nonce: string,
  issuedAt: number,
  fim?: { depoisDe: number; outcome: 'victory' | 'defeat'; rounds: number },
): MissionAttempt {
  return {
    playerId,
    missionId,
    nonce,
    issuedAt,
    finishedAt: fim ? issuedAt + fim.depoisDe : null,
    outcome: fim?.outcome ?? null,
    rounds: fim?.rounds ?? null,
  };
}

// Três contas: "ana" limpa M1 e M2 e abandona M3; "bia" perde M1 duas vezes e vence na
// terceira, e para; "caio" recusou (linha de conta, nenhuma tentativa); "dora" só entrou.
const TENTATIVAS: readonly MissionAttempt[] = [
  tentativa('ana', M1, 'a1', AGORA - 10 * DIA, { depoisDe: 60_000, outcome: 'victory', rounds: 3 }),
  tentativa('ana', M2, 'a2', AGORA - 9 * DIA, { depoisDe: 120_000, outcome: 'victory', rounds: 5 }),
  tentativa('ana', M3, 'a3', AGORA - 8 * DIA),
  tentativa('bia', M1, 'b1', AGORA - 3 * DIA, { depoisDe: 30_000, outcome: 'defeat', rounds: 2 }),
  tentativa('bia', M1, 'b2', AGORA - 3 * DIA + 1, { depoisDe: 90_000, outcome: 'defeat', rounds: 4 }),
  tentativa('bia', M1, 'b3', AGORA - 2 * DIA, { depoisDe: 180_000, outcome: 'victory', rounds: 6 }),
];

const CONTAS: readonly TelemetryAccount[] = [
  { playerId: 'ana', optOut: false, lastSeenAt: AGORA - 8 * DIA },
  { playerId: 'bia', optOut: false, lastSeenAt: AGORA - 2 * DIA },
  { playerId: 'caio', optOut: true, lastSeenAt: null },
  { playerId: 'dora', optOut: false, lastSeenAt: AGORA - 60 * 60 * 1000 },
];

describe('a ordem das missões vem do catálogo', () => {
  it('capítulo por `order`, missão por `order` dentro dele — a ordem em que o jogador as encontra', () => {
    const ordem = ordemDasMissoes(catalog);
    expect(ordem).toHaveLength(catalog.encounters.length);
    // A primeira missão do jogo é a de `order: 1` do capítulo de `order: 1` — e NÃO a
    // "encounter-campanha-1", que é a segunda do capítulo 1 desde a migração do M27. Ordenar
    // por id daria um funil fora de ordem.
    const primeira = catalog.encounters.find((e) => e.id === ordem[0])!;
    expect(primeira.chapterId).toBe('chapter-1');
    expect(primeira.order).toBe(1);
    expect(ordem[1]).toBe('encounter-campanha-1');
    const ultima = catalog.encounters.find((e) => e.id === ordem[ordem.length - 1])!;
    expect(ultima.chapterId).toBe('chapter-3');
  });
});

describe('o resumo por missão', () => {
  const resumo = resumirTelemetria({ tentativas: TENTATIVAS, contas: CONTAS, ordem: ordemDasMissoes(catalog), agora: AGORA });

  it('conta tentativas, vitórias, derrotas e abandonos', () => {
    const m1 = resumo.missoes.find((m) => m.missionId === M1)!;
    expect(m1).toMatchObject({ tentativas: 4, vitorias: 2, derrotas: 2, abandonos: 0 });
    const m3 = resumo.missoes.find((m) => m.missionId === M3)!;
    expect(m3).toMatchObject({ tentativas: 1, vitorias: 0, derrotas: 0, abandonos: 1 });
  });

  it('a duração mediana só conta tentativas terminadas, e é mediana e não média', () => {
    // M1 terminadas: 60 s, 30 s, 90 s, 180 s → ordenadas 30, 60, 90, 180 → mediana 75 s.
    const m1 = resumo.missoes.find((m) => m.missionId === M1)!;
    expect(m1.duracaoMedianaMs).toBe(75_000);
    expect(m1.roundsMedianos).toBe(3.5);
    // M3 só tem abandono: sem duração.
    expect(resumo.missoes.find((m) => m.missionId === M3)!.duracaoMedianaMs).toBeNull();
  });

  it('as missões saem na ordem do catálogo, inclusive as que ninguém tentou (zeradas)', () => {
    expect(resumo.missoes.map((m) => m.missionId)).toEqual(ordemDasMissoes(catalog));
    const nuncaTentada = resumo.missoes[resumo.missoes.length - 1]!;
    expect(nuncaTentada).toMatchObject({ tentativas: 0, vitorias: 0, duracaoMedianaMs: null });
  });
});

describe('o funil — onde os jogadores param', () => {
  const resumo = resumirTelemetria({ tentativas: TENTATIVAS, contas: CONTAS, ordem: ordemDasMissoes(catalog), agora: AGORA });

  it('por missão: quantas contas a tentaram e quantas a venceram', () => {
    const m1 = resumo.missoes.find((m) => m.missionId === M1)!;
    expect(m1).toMatchObject({ contasQueTentaram: 2, contasQueVenceram: 2 });
    const m2 = resumo.missoes.find((m) => m.missionId === M2)!;
    expect(m2).toMatchObject({ contasQueTentaram: 1, contasQueVenceram: 1 });
  });

  it('"parou em": a última missão vencida de cada conta; quem nunca venceu parou antes da primeira', () => {
    expect(resumo.paradas).toEqual([
      { missionId: null, contas: 1 }, // dora: entrou e nunca venceu (caio recusou, não conta)
      { missionId: M1, contas: 1 }, // bia
      { missionId: M2, contas: 1 }, // ana
    ]);
  });
});

describe('a presença', () => {
  const resumo = resumirTelemetria({ tentativas: TENTATIVAS, contas: CONTAS, ordem: ordemDasMissoes(catalog), agora: AGORA });

  it('contas medidas, recusas e as faixas de "último visto"', () => {
    expect(resumo.presenca).toEqual({ medidas: 3, recusaram: 1, vistasEm1Dia: 1, vistasEm7Dias: 1, maisVelhas: 1 });
  });
});

describe('o texto', () => {
  it('é legível e traz cada número do resumo', () => {
    const texto = gerarRelatorio({ tentativas: TENTATIVAS, contas: CONTAS, catalog, agora: AGORA });
    expect(texto).toContain('Relatório do playtest');
    expect(texto).toContain(`${M1}`);
    expect(texto).toMatch(/4 tentativas.*2 vitórias.*2 derrotas.*0 abandonos/);
    expect(texto).toContain('1m15s'); // a mediana da M1
    expect(texto).toContain('recusaram: 1');
    expect(texto).toContain('nenhuma missão vencida: 1');
  });

  it('sem dado nenhum, diz isso em vez de imprimir zeros como se fossem resultado', () => {
    const texto = gerarRelatorio({ tentativas: [], contas: [], catalog, agora: AGORA });
    expect(texto).toContain('nenhuma conta medida');
  });
});
