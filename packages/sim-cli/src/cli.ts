import { pathToFileURL } from 'node:url';
import { runBattleCommand } from './battle.js';
import { runDuelCommand } from './duel.js';

export interface DuelArgs {
  command: 'duel';
  heroAFile: string;
  heroBFile: string;
  seed: number;
}

export interface BattleArgs {
  command: 'battle';
  mapFile: string;
  replayFile?: string;
}

export type ParsedArgs = DuelArgs | BattleArgs;

export class ArgParseError extends Error {}

/** Remove `flag` e o valor logo em seguida de `args`, devolvendo o valor e o restante (só positionals). */
function extractFlag(args: string[], flag: string): { value: string | undefined; rest: string[] } {
  const index = args.indexOf(flag);
  if (index === -1) return { value: undefined, rest: args };
  const value = args[index + 1];
  const rest = [...args.slice(0, index), ...args.slice(index + 2)];
  return { value, rest };
}

export function parseArgs(argv: string[]): ParsedArgs {
  // `pnpm <script> -- <args>` repassa o "--" literal para CLIs não-nativas do Node (tsx
  // não o consome como o `node -e ... --` faria) — ignora um "--" isolado no começo.
  const [command, ...rest] = argv[0] === '--' ? argv.slice(1) : argv;

  if (command === 'duel') {
    const { value: seedValue, rest: positionals } = extractFlag(rest, '--seed');
    const [heroAFile, heroBFile] = positionals;
    if (!heroAFile || !heroBFile) {
      throw new ArgParseError('uso: sim duel <heroA.json> <heroB.json> --seed <n>');
    }
    if (!seedValue || Number.isNaN(Number(seedValue))) {
      throw new ArgParseError('duel requer --seed <n>');
    }
    return { command: 'duel', heroAFile, heroBFile, seed: Number(seedValue) };
  }

  if (command === 'battle') {
    const { value: replayFile, rest: positionals } = extractFlag(rest, '--replay');
    const [mapFile] = positionals;
    if (!mapFile) {
      throw new ArgParseError('uso: sim battle <map.json> [--replay <replay.json>]');
    }
    return { command: 'battle', mapFile, replayFile };
  }

  throw new ArgParseError(`comando desconhecido: ${command ?? '(nenhum)'}. Use "duel" ou "battle".`);
}

export function run(argv: string[]): void {
  const parsed = parseArgs(argv);

  if (parsed.command === 'duel') {
    const output = runDuelCommand(parsed);
    console.log(output);
    return;
  }

  const output = runBattleCommand(parsed);
  console.log(output);
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  run(process.argv.slice(2));
}
