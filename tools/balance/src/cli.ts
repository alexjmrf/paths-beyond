import { pathToFileURL } from 'node:url';
import type { Id } from '@paths-beyond/core';
import { loadBalanceContent } from './loadContent.js';
import { formatReport, buildReport } from './report.js';
import { runTournament } from './runTournament.js';

const DEFAULT_RUNS = 10_000;
const DEFAULT_SEED = 1;

interface CliArgs {
  readonly runs: number;
  readonly seed: number;
}

export function parseArgs(argv: readonly string[]): CliArgs {
  let runs = DEFAULT_RUNS;
  let seed = DEFAULT_SEED;

  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--runs') {
      const value = argv[i + 1];
      if (value) runs = Number(value);
      i++;
    } else if (argv[i] === '--seed') {
      const value = argv[i + 1];
      if (value) seed = Number(value);
      i++;
    }
  }

  return { runs, seed };
}

export function runCli(argv: readonly string[]): string {
  const { runs, seed } = parseArgs(argv);
  const content = loadBalanceContent();

  if (content.comps.length < 2) {
    throw new Error('tools/balance precisa de pelo menos 2 composições em packages/data/test-fixtures/comps/valid/ pra montar uma matriz');
  }

  // §9.5 — "roda ≥10.000 partidas ENTRE composições": interpretado como ≥10.000
  // partidas por par ordenado de composições, não 10.000 no total — senão, quanto mais
  // composições existirem, menos partidas cada pareamento receberia, degradando a
  // significância estatística exatamente quando mais comparações importam.
  const records = runTournament(content, { runsPerPairing: runs, masterSeed: seed });
  const report = buildReport(records);

  const compNames: Record<Id, string> = {};
  for (const comp of content.comps) compNames[comp.id] = comp.name;

  return formatReport(report, compNames);
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  console.log(runCli(process.argv.slice(2)));
}
