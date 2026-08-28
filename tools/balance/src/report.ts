import type { Id } from '@paths-beyond/core';
import type { BattleOutcomeRecord } from './runTournament.js';

export interface PairingCell {
  readonly attackerWins: number;
  readonly defenderWins: number;
  readonly ongoing: number;
  readonly total: number;
  readonly attackerWinratePct: number;
}

export interface CompGlobalStats {
  readonly compId: Id;
  readonly wins: number;
  readonly total: number;
  readonly winratePct: number;
}

export interface BalanceReport {
  readonly matrix: Readonly<Record<Id, Readonly<Record<Id, PairingCell>>>>;
  readonly globalWinrates: readonly CompGlobalStats[];
  readonly medianSpd: number;
  readonly winningBuildsAboveMedianPct: number;
  // §6.5 — a janela de assistências. Enquanto as composições tinham 1 unidade cada, ela não
  // podia disparar em nenhuma das partidas do torneio: não havia aliado para assistir. O
  // relatório media, então, um jogo mais simples que o real. Estes três números são o que
  // transforma "agora deve disparar" em medição — e o que permite ver, numa rodada futura, se
  // uma mudança de alcance ou de custo em PP secou a mecânica sem ninguém perceber.
  readonly totalAssists: number;
  readonly battlesWithAssistPct: number;
  readonly assistsPerBattle: number;
  // §04-duelo.md §6.7 — "se mais de 60% das builds vencedoras tiverem spd acima da
  // mediana, o sistema falhou."
  readonly spdAlertTriggered: boolean;
  // §9.5 — "nenhuma composição acima de 65% de winrate global."
  readonly overpoweredComps: readonly Id[];
  // §9.5 (revisado) — o critério original só tinha teto. Uma composição em 31% é tão
  // inviável quanto uma em 70% é opressora: ninguém a leva para a arena, e o roster
  // efetivo encolhe. A faixa saudável é 40-60%.
  readonly underpoweredComps: readonly Id[];
  // §9.5 (revisado) — confrontos decididos antes da primeira jogada. Em 2000 partidas com
  // variância de dano e rolagem de crítico, chegar a 0% ou 100% significa que o resultado
  // não depende de NADA além da composição: nem do script tático, nem do posicionamento,
  // nem da seed. Em PvE isso é sabor; em arena é o metajogo virando pedra-papel-tesoura
  // resolvido na tela de seleção, e a mecânica-assinatura do jogo deixando de existir
  // nesses pares.
  readonly hardCounters: readonly HardCounter[];
}

export interface HardCounter {
  readonly attackerId: Id;
  readonly defenderId: Id;
  readonly attackerWinratePct: number;
  readonly total: number;
}

const WINRATE_ALERT_THRESHOLD_PCT = 65;
const WINRATE_FLOOR_THRESHOLD_PCT = 40;
// Um confronto é "counter absoluto" quando praticamente nenhuma partida escapa do
// resultado esperado. Não usamos 0/100 exatos de propósito: 99,5% já é um confronto que
// o jogador nunca vai disputar de verdade.
const HARD_COUNTER_MARGIN_PCT = 0.5;
const HARD_COUNTER_MIN_SAMPLE = 200;
const SPD_ABOVE_MEDIAN_ALERT_THRESHOLD_PCT = 60;

function median(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return ((sorted[mid - 1] as number) + (sorted[mid] as number)) / 2;
  }
  return sorted[mid] as number;
}

export function buildReport(records: readonly BattleOutcomeRecord[]): BalanceReport {
  const matrix: Record<Id, Record<Id, PairingCell>> = {};
  const winsByComp = new Map<Id, number>();
  const totalByComp = new Map<Id, number>();

  for (const record of records) {
    matrix[record.attackerCompId] ??= {};
    const existing = matrix[record.attackerCompId]![record.defenderCompId] ?? {
      attackerWins: 0,
      defenderWins: 0,
      ongoing: 0,
      total: 0,
      attackerWinratePct: 0,
    };

    const attackerWins = existing.attackerWins + (record.outcome === 'victory' ? 1 : 0);
    const defenderWins = existing.defenderWins + (record.outcome === 'defeat' ? 1 : 0);
    const ongoing = existing.ongoing + (record.outcome === 'ongoing' ? 1 : 0);
    const total = existing.total + 1;

    matrix[record.attackerCompId]![record.defenderCompId] = {
      attackerWins,
      defenderWins,
      ongoing,
      total,
      attackerWinratePct: (attackerWins / total) * 100,
    };

    totalByComp.set(record.attackerCompId, (totalByComp.get(record.attackerCompId) ?? 0) + 1);
    totalByComp.set(record.defenderCompId, (totalByComp.get(record.defenderCompId) ?? 0) + 1);
    if (record.winningCompId) {
      winsByComp.set(record.winningCompId, (winsByComp.get(record.winningCompId) ?? 0) + 1);
    }
  }

  const globalWinrates: CompGlobalStats[] = [...totalByComp.entries()].map(([compId, total]) => {
    const wins = winsByComp.get(compId) ?? 0;
    return { compId, wins, total, winratePct: total > 0 ? (wins / total) * 100 : 0 };
  });

  const allSpd = records.flatMap((r) => r.allUnitsSpd);
  let totalAssists = 0;
  let battlesWithAssist = 0;
  for (const record of records) {
    totalAssists += record.assists;
    if (record.assists > 0) battlesWithAssist++;
  }

  const medianSpd = median(allSpd);

  const winningSpd = records.flatMap((r) => r.winningUnitsSpd);
  const aboveMedianCount = winningSpd.filter((spd) => spd > medianSpd).length;
  const winningBuildsAboveMedianPct = winningSpd.length > 0 ? (aboveMedianCount / winningSpd.length) * 100 : 0;

  const hardCounters: HardCounter[] = [];
  for (const attackerId of Object.keys(matrix).sort()) {
    const row = matrix[attackerId];
    if (!row) continue;
    for (const defenderId of Object.keys(row).sort()) {
      const cell = row[defenderId] as PairingCell;
      if (cell.total < HARD_COUNTER_MIN_SAMPLE) continue;
      const decidido =
        cell.attackerWinratePct >= 100 - HARD_COUNTER_MARGIN_PCT ||
        cell.attackerWinratePct <= HARD_COUNTER_MARGIN_PCT;
      if (decidido) {
        hardCounters.push({
          attackerId,
          defenderId,
          attackerWinratePct: cell.attackerWinratePct,
          total: cell.total,
        });
      }
    }
  }

  return {
    matrix,
    globalWinrates,
    medianSpd,
    winningBuildsAboveMedianPct,
    totalAssists,
    battlesWithAssistPct: records.length > 0 ? (battlesWithAssist / records.length) * 100 : 0,
    assistsPerBattle: records.length > 0 ? totalAssists / records.length : 0,
    spdAlertTriggered: winningBuildsAboveMedianPct > SPD_ABOVE_MEDIAN_ALERT_THRESHOLD_PCT,
    overpoweredComps: globalWinrates.filter((g) => g.winratePct > WINRATE_ALERT_THRESHOLD_PCT).map((g) => g.compId),
    underpoweredComps: globalWinrates.filter((g) => g.winratePct < WINRATE_FLOOR_THRESHOLD_PCT).map((g) => g.compId),
    hardCounters,
  };
}

function pct(value: number): string {
  return `${value.toFixed(1)}%`;
}

export function formatReport(report: BalanceReport, compNames: Readonly<Record<Id, string>>): string {
  const lines: string[] = [];

  lines.push('=== Matriz de winrate (atacante x defensor) ===');
  const compIds = Object.keys(report.matrix).sort();
  for (const attackerId of compIds) {
    const row = report.matrix[attackerId];
    if (!row) continue;
    for (const defenderId of Object.keys(row).sort()) {
      const cell = row[defenderId] as PairingCell;
      lines.push(
        `  ${compNames[attackerId] ?? attackerId} ataca ${compNames[defenderId] ?? defenderId}: ` +
          `${pct(cell.attackerWinratePct)} vitória do atacante (${cell.attackerWins}V/${cell.defenderWins}D/${cell.ongoing}sem-conclusão de ${cell.total})`,
      );
    }
  }

  lines.push('');
  lines.push('=== Winrate global por composição ===');
  for (const g of [...report.globalWinrates].sort((a, b) => b.winratePct - a.winratePct)) {
    const flag =
      g.winratePct > WINRATE_ALERT_THRESHOLD_PCT
        ? '  <-- ACIMA DE 65%, ALERTA'
        : g.winratePct < WINRATE_FLOOR_THRESHOLD_PCT
          ? '  <-- ABAIXO DE 40%, ALERTA'
          : '';
    lines.push(`  ${compNames[g.compId] ?? g.compId}: ${pct(g.winratePct)} (${g.wins}/${g.total})${flag}`);
  }

  lines.push('');
  lines.push('=== Distribuição de stats das builds vencedoras (§6.7) ===');
  lines.push(`  spd mediano (todas as unidades do torneio): ${report.medianSpd}`);
  lines.push(`  unidades vencedoras com spd acima da mediana: ${pct(report.winningBuildsAboveMedianPct)}`);
  lines.push(
    report.spdAlertTriggered
      ? '  ALERTA: mais de 60% das builds vencedoras concentram spd acima da mediana — reduza o cap de evasão ou aumente o limiar de preempção antes de mexer em qualquer outra coisa (§6.7).'
      : '  OK: concentração de spd nas builds vencedoras dentro do esperado.',
  );

  lines.push('');
  lines.push('=== Assistências (§6.5) ===');
  lines.push(`  assistências aplicadas no torneio: ${report.totalAssists}`);
  lines.push(`  batalhas com ao menos uma assistência: ${pct(report.battlesWithAssistPct)}`);
  lines.push(`  média por batalha: ${report.assistsPerBattle.toFixed(2)}`);
  lines.push(
    report.totalAssists === 0
      ? '  ALERTA: nenhuma assistência disparou. A mecânica que substituiu o esquadrão do Unicorn Overlord está inerte no torneio — confira se as composições têm aliados dentro do assistRange umas das outras.'
      : '  OK: a janela de assistências está sendo exercitada.',
  );

  if (report.overpoweredComps.length > 0) {
    lines.push('');
    lines.push('=== Composições acima de 65% de winrate global (§9.5) ===');
    for (const compId of report.overpoweredComps) {
      lines.push(`  ${compNames[compId] ?? compId}`);
    }
  }

  if (report.underpoweredComps.length > 0) {
    lines.push('');
    lines.push('=== Composições abaixo de 40% de winrate global (§9.5 revisado) ===');
    lines.push('  Estas ninguém leva para a arena. O roster efetivo é menor do que o roster nominal.');
    for (const compId of report.underpoweredComps) {
      lines.push(`  ${compNames[compId] ?? compId}`);
    }
  }

  if (report.hardCounters.length > 0) {
    lines.push('');
    lines.push('=== Counters absolutos: confrontos decididos antes da primeira jogada ===');
    lines.push('  Nestes pares o resultado não depende do script tático, do posicionamento nem da seed.');
    lines.push('  Em arena isso transforma o metajogo em pedra-papel-tesoura resolvido na seleção.');
    lines.push('  Correção sugerida: verifique se triângulo de armas, bônus de tipo e assimetria de');
    lines.push('  alcance não estão se acumulando no mesmo confronto (§6.8 prevê 1100/1000/900, não empilhamento).');
    for (const hc of report.hardCounters) {
      lines.push(
        `  ${compNames[hc.attackerId] ?? hc.attackerId} ataca ${compNames[hc.defenderId] ?? hc.defenderId}: ` +
          `${pct(hc.attackerWinratePct)} em ${hc.total} partidas`,
      );
    }
  }

  return lines.join('\n');
}
