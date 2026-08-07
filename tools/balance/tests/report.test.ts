import { describe, expect, it } from 'vitest';
import { buildReport, formatReport } from '../src/report.js';
import type { BattleOutcomeRecord } from '../src/runTournament.js';

function record(overrides: Partial<BattleOutcomeRecord> = {}): BattleOutcomeRecord {
  return {
    attackerCompId: 'comp-a',
    defenderCompId: 'comp-b',
    seed: 1,
    outcome: 'victory',
    winningCompId: 'comp-a',
    winningUnitsSpd: [100],
    allUnitsSpd: [100, 80],
    ...overrides,
  };
}

describe('buildReport — matriz de winrate', () => {
  it('conta vitórias/derrotas/sem-conclusão por par ordenado de composições', () => {
    const records: BattleOutcomeRecord[] = [
      record({ outcome: 'victory', winningCompId: 'comp-a' }),
      record({ outcome: 'victory', winningCompId: 'comp-a' }),
      record({ outcome: 'defeat', winningCompId: 'comp-b' }),
      record({ outcome: 'ongoing', winningCompId: null }),
    ];
    const report = buildReport(records);
    const cell = report.matrix['comp-a']?.['comp-b'];
    expect(cell).toEqual({ attackerWins: 2, defenderWins: 1, ongoing: 1, total: 4, attackerWinratePct: 50 });
  });

  it('winrate global soma vitórias tanto como atacante quanto como defensor', () => {
    const records: BattleOutcomeRecord[] = [
      record({ attackerCompId: 'comp-a', defenderCompId: 'comp-b', outcome: 'victory', winningCompId: 'comp-a' }),
      record({ attackerCompId: 'comp-b', defenderCompId: 'comp-a', outcome: 'victory', winningCompId: 'comp-b' }),
    ];
    const report = buildReport(records);
    const a = report.globalWinrates.find((g) => g.compId === 'comp-a');
    const b = report.globalWinrates.find((g) => g.compId === 'comp-b');
    // comp-a: 1 vitória (como atacante) + 1 derrota (como defensor) = 1/2 = 50%
    expect(a).toMatchObject({ wins: 1, total: 2, winratePct: 50 });
    expect(b).toMatchObject({ wins: 1, total: 2, winratePct: 50 });
  });

  it('sinaliza overpoweredComps quando winrate global > 65%', () => {
    const records: BattleOutcomeRecord[] = Array.from({ length: 10 }, (_, i) =>
      record({ outcome: i < 7 ? 'victory' : 'defeat', winningCompId: i < 7 ? 'comp-a' : 'comp-b' }),
    );
    const report = buildReport(records);
    expect(report.overpoweredComps).toContain('comp-a');
  });

  it('não sinaliza overpoweredComps quando winrate global está dentro de 52-65%', () => {
    const records: BattleOutcomeRecord[] = Array.from({ length: 10 }, (_, i) =>
      record({ outcome: i < 6 ? 'victory' : 'defeat', winningCompId: i < 6 ? 'comp-a' : 'comp-b' }),
    );
    const report = buildReport(records);
    expect(report.overpoweredComps).not.toContain('comp-a');
  });
});

describe('buildReport — alerta de spd (§6.7)', () => {
  it('calcula a mediana corretamente (par e ímpar) e dispara o alerta acima de 60%', () => {
    // spd de todas as unidades no torneio: [10, 20, 30, 40] -> mediana = 25
    // builds vencedoras: [30, 40, 50] -> 3 de 3 acima de 25 (100%) -> alerta
    const records: BattleOutcomeRecord[] = [
      record({ allUnitsSpd: [10, 20], winningUnitsSpd: [30] }),
      record({ allUnitsSpd: [30, 40], winningUnitsSpd: [40, 50] }),
    ];
    const report = buildReport(records);
    expect(report.medianSpd).toBe(25);
    expect(report.winningBuildsAboveMedianPct).toBe(100);
    expect(report.spdAlertTriggered).toBe(true);
  });

  it('não dispara o alerta quando a maioria das builds vencedoras tem spd na mediana ou abaixo', () => {
    // spd de todas: [10,20,30,40,50] -> mediana = 30
    // vencedoras: [10, 20, 30, 40] -> só 1 de 4 (25%) acima de 30 -> sem alerta
    const records: BattleOutcomeRecord[] = [
      record({ allUnitsSpd: [10, 20, 30, 40, 50], winningUnitsSpd: [10, 20, 30, 40] }),
    ];
    const report = buildReport(records);
    expect(report.medianSpd).toBe(30);
    expect(report.winningBuildsAboveMedianPct).toBe(25);
    expect(report.spdAlertTriggered).toBe(false);
  });
});

describe('formatReport', () => {
  it('produz um relatório em texto com as três seções principais', () => {
    const records: BattleOutcomeRecord[] = [record()];
    const report = buildReport(records);
    const text = formatReport(report, { 'comp-a': 'Comp A', 'comp-b': 'Comp B' });
    expect(text).toContain('Matriz de winrate');
    expect(text).toContain('Winrate global por composição');
    expect(text).toContain('Distribuição de stats das builds vencedoras');
    expect(text).toContain('Comp A');
    expect(text).toContain('Comp B');
  });
});

// ——— Critério de aceite do M8 revisado (§9.5) ———
// O critério original só tinha teto ("nenhuma composição acima de 65%"). Auditoria
// mostrou que isso deixa passar dois problemas piores: composições no chão, que ninguém
// leva para a arena, e confrontos decididos antes da primeira jogada.

function manyRecords(n: number, over: Partial<BattleOutcomeRecord>): BattleOutcomeRecord[] {
  return Array.from({ length: n }, (_u, i) => record({ seed: i, ...over }));
}

describe('buildReport — piso de winrate (§9.5 revisado)', () => {
  it('marca como subpoderosa a composição abaixo de 40% de winrate global', () => {
    const records = [
      ...manyRecords(90, { attackerCompId: 'forte', defenderCompId: 'fraca', outcome: 'victory', winningCompId: 'forte' }),
      ...manyRecords(10, { attackerCompId: 'forte', defenderCompId: 'fraca', outcome: 'defeat', winningCompId: 'fraca' }),
    ];
    const report = buildReport(records);
    expect(report.underpoweredComps).toContain('fraca');
    expect(report.overpoweredComps).toContain('forte');
  });

  it('não marca nada quando todas as composições ficam na faixa saudável de 40-60%', () => {
    const records = [
      ...manyRecords(50, { attackerCompId: 'a', defenderCompId: 'b', outcome: 'victory', winningCompId: 'a' }),
      ...manyRecords(50, { attackerCompId: 'a', defenderCompId: 'b', outcome: 'defeat', winningCompId: 'b' }),
    ];
    const report = buildReport(records);
    expect(report.underpoweredComps).toEqual([]);
    expect(report.overpoweredComps).toEqual([]);
  });
});

describe('buildReport — counters absolutos (§9.5 revisado)', () => {
  it('detecta confronto em que o atacante vence 100% das partidas', () => {
    const report = buildReport(
      manyRecords(2000, { attackerCompId: 'espada', defenderCompId: 'couraca', outcome: 'victory', winningCompId: 'espada' }),
    );
    const hc = report.hardCounters.find((c) => c.attackerId === 'espada' && c.defenderId === 'couraca');
    expect(hc?.attackerWinratePct).toBe(100);
    expect(hc?.total).toBe(2000);
  });

  it('detecta também o lado que perde 100% das partidas', () => {
    const report = buildReport(
      manyRecords(2000, { attackerCompId: 'espada', defenderCompId: 'lanceiro', outcome: 'defeat', winningCompId: 'lanceiro' }),
    );
    expect(report.hardCounters.some((c) => c.attackerId === 'espada' && c.attackerWinratePct === 0)).toBe(true);
  });

  it('um confronto disputado não é counter absoluto, mesmo com viés forte', () => {
    const report = buildReport([
      ...manyRecords(1800, { attackerCompId: 'a', defenderCompId: 'b', outcome: 'victory', winningCompId: 'a' }),
      ...manyRecords(200, { attackerCompId: 'a', defenderCompId: 'b', outcome: 'defeat', winningCompId: 'b' }),
    ]);
    expect(report.hardCounters).toEqual([]);
  });

  it('ignora amostra pequena: 5 partidas em 100% é ruído, não counter estrutural', () => {
    const report = buildReport(
      manyRecords(5, { attackerCompId: 'a', defenderCompId: 'b', outcome: 'victory', winningCompId: 'a' }),
    );
    expect(report.hardCounters).toEqual([]);
  });
});

describe('formatReport — as seções novas aparecem no texto', () => {
  it('imprime o alerta de piso e o de counters absolutos quando eles existem', () => {
    const text = formatReport(
      buildReport(
        manyRecords(2000, { attackerCompId: 'forte', defenderCompId: 'fraca', outcome: 'victory', winningCompId: 'forte' }),
      ),
      {},
    );
    expect(text).toContain('ABAIXO DE 40%');
    expect(text).toContain('Counters absolutos');
  });
});
