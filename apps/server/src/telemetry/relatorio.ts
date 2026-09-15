import type { ContentCatalog } from '@paths-beyond/content';
import type { MissionAttempt, TelemetryAccount } from '../repository/types.js';

// M34 3/N (D45) — o RELATÓRIO do playtest, como função pura.
//
// O aceite do M34 é "dá para responder, por número e não por impressão, onde os jogadores
// param na demo e quanto tempo cada missão leva". Este módulo é a resposta: recebe o que o
// repositório devolve (todas as tentativas, todas as contas) e o catálogo (para a ordem das
// missões), e devolve números e um texto. Nada aqui lê banco — o `cli` faz isso em uma linha —
// e é por isso que cada número se prova com dado semeado à mão.
//
// Medianas, não médias: uma tentativa deixada aberta a noite inteira e fechada de manhã
// arrastaria a média de uma missão de dois minutos para uma hora. A mediana conta o jogador
// típico, que é o que se quer saber.

export interface ResumoDaMissao {
  readonly missionId: string;
  readonly tentativas: number;
  readonly vitorias: number;
  readonly derrotas: number;
  readonly abandonos: number;
  readonly duracaoMedianaMs: number | null;
  readonly roundsMedianos: number | null;
  readonly contasQueTentaram: number;
  readonly contasQueVenceram: number;
}

export interface Parada {
  // `null` = a conta entrou e nunca venceu missão nenhuma.
  readonly missionId: string | null;
  readonly contas: number;
}

export interface Presenca {
  readonly medidas: number;
  readonly recusaram: number;
  readonly vistasEm1Dia: number;
  readonly vistasEm7Dias: number;
  readonly maisVelhas: number;
}

export interface ResumoDaTelemetria {
  readonly missoes: readonly ResumoDaMissao[];
  readonly paradas: readonly Parada[];
  readonly presenca: Presenca;
}

const DIA_MS = 24 * 60 * 60 * 1000;

// A ordem em que o jogador ENCONTRA as missões: capítulo por `order`, missão por `order`
// dentro dele. Ordenar por id daria um funil fora de ordem (`encounter-campanha-1` é a
// segunda missão do capítulo 1 desde a migração do M27).
export function ordemDasMissoes(catalog: ContentCatalog): readonly string[] {
  const ordemDoCapitulo = new Map(catalog.chapters.map((c) => [c.id, c.order]));
  return [...catalog.encounters]
    .sort(
      (a, b) =>
        (ordemDoCapitulo.get(a.chapterId) ?? Number.MAX_SAFE_INTEGER) - (ordemDoCapitulo.get(b.chapterId) ?? Number.MAX_SAFE_INTEGER) ||
        a.order - b.order ||
        a.id.localeCompare(b.id),
    )
    .map((e) => e.id);
}

function mediana(valores: readonly number[]): number | null {
  if (valores.length === 0) return null;
  const ordenados = [...valores].sort((a, b) => a - b);
  const meio = Math.floor(ordenados.length / 2);
  return ordenados.length % 2 === 1 ? ordenados[meio]! : (ordenados[meio - 1]! + ordenados[meio]!) / 2;
}

export function resumirTelemetria(entrada: {
  readonly tentativas: readonly MissionAttempt[];
  readonly contas: readonly TelemetryAccount[];
  readonly ordem: readonly string[];
  readonly agora: number;
}): ResumoDaTelemetria {
  const { tentativas, contas, ordem, agora } = entrada;
  const posicao = new Map(ordem.map((id, i) => [id, i]));

  // Missões fora do catálogo (conteúdo removido depois de jogado) entram no fim, para o
  // relatório não esconder dado que existe.
  const foraDoCatalogo = [...new Set(tentativas.map((t) => t.missionId).filter((id) => !posicao.has(id)))].sort();
  const todas = [...ordem, ...foraDoCatalogo];

  const missoes = todas.map((missionId): ResumoDaMissao => {
    const da = tentativas.filter((t) => t.missionId === missionId);
    const terminadas = da.filter((t) => t.finishedAt !== null);
    return {
      missionId,
      tentativas: da.length,
      vitorias: da.filter((t) => t.outcome === 'victory').length,
      derrotas: da.filter((t) => t.outcome === 'defeat').length,
      abandonos: da.length - terminadas.length,
      duracaoMedianaMs: mediana(terminadas.map((t) => t.finishedAt! - t.issuedAt)),
      roundsMedianos: mediana(terminadas.filter((t) => t.rounds !== null).map((t) => t.rounds!)),
      contasQueTentaram: new Set(da.map((t) => t.playerId)).size,
      contasQueVenceram: new Set(da.filter((t) => t.outcome === 'victory').map((t) => t.playerId)).size,
    };
  });

  // "Parou em": a missão mais adiante que a conta venceu. Quem recusou não entra — não há
  // dado dela, e contá-la como "parou antes da primeira" seria inventar.
  const medidas = contas.filter((c) => !c.optOut);
  const paradaPorConta = new Map<string, string | null>(medidas.map((c) => [c.playerId, null]));
  for (const t of tentativas) {
    if (t.outcome !== 'victory') continue;
    if (!paradaPorConta.has(t.playerId)) paradaPorConta.set(t.playerId, null);
    const atual = paradaPorConta.get(t.playerId) ?? null;
    const posAtual = atual === null ? -1 : (posicao.get(atual) ?? todas.indexOf(atual));
    const posNova = posicao.get(t.missionId) ?? todas.indexOf(t.missionId);
    if (posNova > posAtual) paradaPorConta.set(t.playerId, t.missionId);
  }
  const contagem = new Map<string | null, number>();
  for (const parada of paradaPorConta.values()) contagem.set(parada, (contagem.get(parada) ?? 0) + 1);
  const paradas: Parada[] = [null, ...todas]
    .filter((id) => contagem.has(id))
    .map((id) => ({ missionId: id, contas: contagem.get(id)! }));

  const presenca: Presenca = {
    medidas: medidas.length,
    recusaram: contas.length - medidas.length,
    vistasEm1Dia: medidas.filter((c) => c.lastSeenAt !== null && agora - c.lastSeenAt <= DIA_MS).length,
    vistasEm7Dias: medidas.filter((c) => c.lastSeenAt !== null && agora - c.lastSeenAt > DIA_MS && agora - c.lastSeenAt <= 7 * DIA_MS).length,
    maisVelhas: medidas.filter((c) => c.lastSeenAt === null || agora - c.lastSeenAt > 7 * DIA_MS).length,
  };

  return { missoes, paradas, presenca };
}

export function formatarDuracao(ms: number): string {
  const total = Math.round(ms / 1000);
  const minutos = Math.floor(total / 60);
  const segundos = total % 60;
  return minutos > 0 ? `${minutos}m${String(segundos).padStart(2, '0')}s` : `${segundos}s`;
}

export function gerarRelatorio(entrada: {
  readonly tentativas: readonly MissionAttempt[];
  readonly contas: readonly TelemetryAccount[];
  readonly catalog: ContentCatalog;
  readonly agora: number;
}): string {
  const { tentativas, contas, catalog, agora } = entrada;
  const resumo = resumirTelemetria({ tentativas, contas, ordem: ordemDasMissoes(catalog), agora });
  const nome = new Map(catalog.encounters.map((e) => [e.id, e.name]));
  const linhas: string[] = [];

  linhas.push(`Relatório do playtest — ${new Date(agora).toISOString()}`);
  linhas.push('');

  if (resumo.presenca.medidas === 0 && tentativas.length === 0) {
    linhas.push('Sem dado: nenhuma conta medida e nenhuma tentativa de missão registrada.');
    if (resumo.presenca.recusaram > 0) linhas.push(`(contas que recusaram: ${resumo.presenca.recusaram})`);
    return linhas.join('\n');
  }

  linhas.push('== Por missão (na ordem da campanha) ==');
  for (const m of resumo.missoes) {
    const rotulo = nome.get(m.missionId) ?? m.missionId;
    const duracao = m.duracaoMedianaMs === null ? '—' : formatarDuracao(m.duracaoMedianaMs);
    const rounds = m.roundsMedianos === null ? '—' : String(m.roundsMedianos);
    linhas.push(
      `${m.missionId}  (${rotulo})\n` +
        `    ${m.tentativas} tentativas, ${m.vitorias} vitórias, ${m.derrotas} derrotas, ${m.abandonos} abandonos` +
        ` · duração mediana ${duracao} · rounds medianos ${rounds}` +
        ` · contas: ${m.contasQueTentaram} tentaram, ${m.contasQueVenceram} venceram`,
    );
  }
  linhas.push('');

  linhas.push('== Onde as contas pararam (última missão vencida) ==');
  for (const p of resumo.paradas) {
    if (p.missionId === null) linhas.push(`    nenhuma missão vencida: ${p.contas}`);
    else linhas.push(`    ${p.missionId} (${nome.get(p.missionId) ?? p.missionId}): ${p.contas}`);
  }
  linhas.push('');

  const { presenca } = resumo;
  linhas.push('== Presença ==');
  linhas.push(`    contas medidas: ${presenca.medidas} · recusaram: ${presenca.recusaram}`);
  linhas.push(
    `    vistas nas últimas 24h: ${presenca.vistasEm1Dia} · entre 1 e 7 dias: ${presenca.vistasEm7Dias} · há mais de 7 dias ou nunca: ${presenca.maisVelhas}`,
  );

  return linhas.join('\n');
}
