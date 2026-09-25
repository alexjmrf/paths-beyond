import { pathToFileURL } from 'node:url';
import type { Id } from '@paths-beyond/core';
import { loadCatalogFromDisk } from '@paths-beyond/content';
import { formatArtifactDelta, formatReport, buildReport } from './report.js';
import { runArtifactDelta, runTournament, type ArtifactTier } from './runTournament.js';

const DEFAULT_RUNS = 10_000;
const DEFAULT_SEED = 1;

// M38 5/N — o tier em que o artefato entra nas duas medições. Decisão do usuário: o mínimo em
// que todo artefato fica no rank corrente Hero (D53 item 7), com imprint 0 — o mesmo método do
// M37 com os personagens. `matrizDeBalanceamento.test.ts` confere o mesmo número.
export const TIER_DA_MEDICAO: ArtifactTier = { awakening: 3, imprint: 0 };

interface CliArgs {
  readonly runs: number;
  readonly seed: number;
  // `--artefatos`: a matriz de sempre, com toda unidade levando o artefato declarado.
  readonly artefatos: boolean;
  // `--delta-artefato`: cada comp com artefato contra ela mesma sem.
  readonly delta: boolean;
}

export function parseArgs(argv: readonly string[]): CliArgs {
  let runs = DEFAULT_RUNS;
  let seed = DEFAULT_SEED;
  let artefatos = false;
  let delta = false;

  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--runs') {
      const value = argv[i + 1];
      if (value) runs = Number(value);
      i++;
    } else if (argv[i] === '--seed') {
      const value = argv[i + 1];
      if (value) seed = Number(value);
      i++;
    } else if (argv[i] === '--artefatos') {
      artefatos = true;
    } else if (argv[i] === '--delta-artefato') {
      delta = true;
    }
  }

  return { runs, seed, artefatos, delta };
}

export function runCli(argv: readonly string[]): string {
  const { runs, seed, artefatos, delta } = parseArgs(argv);
  const content = loadCatalogFromDisk();

  const compNamesDelta: Record<Id, string> = {};
  for (const comp of content.comps) compNamesDelta[comp.id] = comp.name;

  if (delta) {
    const rows = runArtifactDelta(content, { runsPerPairing: runs, masterSeed: seed, artefatos: TIER_DA_MEDICAO });
    return formatArtifactDelta(rows, compNamesDelta, TIER_DA_MEDICAO);
  }

  if (content.comps.length < 2) {
    throw new Error('tools/balance precisa de pelo menos 2 composições em packages/data/test-fixtures/comps/valid/ pra montar uma matriz');
  }

  // §9.5 — "roda ≥10.000 partidas ENTRE composições": interpretado como ≥10.000
  // partidas por par ordenado de composições, não 10.000 no total — senão, quanto mais
  // composições existirem, menos partidas cada pareamento receberia, degradando a
  // significância estatística exatamente quando mais comparações importam.
  const records = runTournament(content, {
    runsPerPairing: runs,
    masterSeed: seed,
    ...(artefatos ? { artefatos: TIER_DA_MEDICAO } : {}),
  });
  const report = buildReport(records);

  const compNames: Record<Id, string> = {};
  for (const comp of content.comps) compNames[comp.id] = comp.name;

  const cabecalho = artefatos
    ? `=== Medição COM artefato: toda unidade leva o artefato declarado na comp, awakening ${TIER_DA_MEDICAO.awakening}, imprint ${TIER_DA_MEDICAO.imprint} ===\n\n`
    : '';
  return cabecalho + formatReport(report, compNames);
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  console.log(runCli(process.argv.slice(2)));
}
