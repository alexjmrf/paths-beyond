import { readFileSync } from 'node:fs';
import { simulate, type BattleCommand, type BattleResult, type BattleSetup, type Replay } from '@paths-beyond/core';

export type ReadFile = (path: string) => string;

// Decisão registrada em DECISIONS.md: `map.json` traz rulesVersion+seed+initialState
// (mapa, unidades, config da batalha); `--replay r.json` traz só os comandos gravados.
// Nenhum schema Zod dedicado existe ainda para esse par (BattleSetup com unidades é
// maior que maps.schema.ts, que só cobre o terreno estático) — corte de escopo, ver
// DECISIONS.md.
interface MapFileContent {
  readonly rulesVersion: string;
  readonly seed: number;
  readonly initialState: BattleSetup;
}

interface ReplayFileContent {
  readonly commands: readonly BattleCommand[];
}

export function loadReplay(readFile: ReadFile, mapFile: string, replayFile: string | undefined): Replay {
  const mapContent = JSON.parse(readFile(mapFile)) as MapFileContent;
  const commands = replayFile ? (JSON.parse(readFile(replayFile)) as ReplayFileContent).commands : [];
  return {
    rulesVersion: mapContent.rulesVersion,
    seed: mapContent.seed,
    initialState: mapContent.initialState,
    commands,
  };
}

export function formatBattleLog(result: BattleResult): string {
  const lines: string[] = [];

  lines.push(`Rounds jogados: ${result.roundsPlayed}`);
  lines.push(`Resultado: ${result.outcome}`);
  lines.push(`Valor final: ${result.finalValor}`);

  lines.push('Ordem de iniciativa (fixa desde o início da batalha, §5.3):');
  for (const entry of result.initiativeOrder) {
    lines.push(`  ${entry.unitId}: ${entry.initiative}`);
  }

  lines.push('Unidades ao final:');
  for (const unit of result.finalUnits) {
    const status = unit.hp > 0 ? `hp=${unit.hp}` : 'morta';
    lines.push(`  ${unit.unitId} (${unit.side}): ${status} ap=${unit.ap} pp=${unit.pp}`);
  }

  return lines.join('\n');
}

export interface RunBattleCommandArgs {
  readonly mapFile: string;
  readonly replayFile?: string;
}

export function runBattleCommand(
  args: RunBattleCommandArgs,
  readFile: ReadFile = (path) => readFileSync(path, 'utf8'),
): string {
  const replay = loadReplay(readFile, args.mapFile, args.replayFile);
  const result = simulate(replay);
  return formatBattleLog(result);
}
