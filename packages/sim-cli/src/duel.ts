import { readFileSync } from 'node:fs';
import duelParticipantSchema from '@paths-beyond/data/schemas/duel-participants.schema.js';
import { resolveDuel, type DuelEngagementContext, type DuelParticipant, type DuelResult } from '@paths-beyond/core';

export type ReadFile = (path: string) => string;

const DEFAULT_ENGAGEMENT: DuelEngagementContext = {
  engagementDistance: 1,
  terrainAccuracyModifier: 0,
  heightAccuracyModifier: 0,
  defenderEvasionModifier: 0,
  battleRound: 1,
};

// A validação de runtime (Zod) já garante que o JSON bate com o shape de
// DuelParticipant; o cast em seguida só ponte dois tipos declarados independentemente
// (packages/data não depende de packages/core, e vice-versa — decisão de M1).
export function loadDuelParticipant(readFile: ReadFile, path: string): DuelParticipant {
  const raw = readFile(path);
  const parsed = duelParticipantSchema.parse(JSON.parse(raw));
  return parsed as unknown as DuelParticipant;
}

// FNV-1a 32-bit sobre o JSON do resultado — hash determinístico e legível, só para
// provar "mesma seed → hash idêntico" sem precisar comparar o objeto inteiro no CLI.
export function hashDuelResult(result: DuelResult): string {
  const json = JSON.stringify(result);
  let hash = 0x811c9dc5;
  for (let i = 0; i < json.length; i++) {
    hash ^= json.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

export function formatDuelLog(result: DuelResult): string {
  const lines: string[] = [];

  for (const troca of result.trocas) {
    lines.push(`Troca ${troca.trocaNumber} (primeiro a agir: ${troca.firstMoverId})`);
    for (const action of troca.actions) {
      if (action.decision === 'none') {
        lines.push(`  ${action.actorId}: não pôde agir`);
        continue;
      }

      const lineLabel = action.tacticsLineIndex !== null ? ` [linha ${action.tacticsLineIndex}]` : ' [ataque básico]';
      let resultLabel = '';
      if (action.hit === false) resultLabel = ' — errou';
      else if (action.hit === true) resultLabel = `${action.isCrit ? ' CRÍTICO' : ''} — ${action.damage} de dano`;

      lines.push(`  ${action.actorId} usa ${action.skillId}${lineLabel} em ${action.targetId}${resultLabel}`);

      if (action.reaction) {
        const counter =
          action.reaction.counterDamage !== null ? `, ${action.reaction.counterDamage} de contra-dano` : '';
        lines.push(
          `    reação de ${action.targetId}: ${action.reaction.skillId} [linha ${action.reaction.lineIndex}]${counter}`,
        );
      }
    }
  }

  lines.push(`Assistências (${result.attackerId}): ${result.attackerAssists.map((a) => a.assistantId).join(', ') || '(nenhuma)'}`);
  lines.push(`Assistências (${result.defenderId}): ${result.defenderAssists.map((a) => a.assistantId).join(', ') || '(nenhuma)'}`);
  lines.push(`Vencedor: ${result.winnerId ?? '(nenhum — 3 trocas sem morte)'}`);
  lines.push(`HP final — ${result.attackerId}: ${result.finalHpAttacker}, ${result.defenderId}: ${result.finalHpDefender}`);
  lines.push(`Hash: ${hashDuelResult(result)}`);

  return lines.join('\n');
}

export interface RunDuelCommandArgs {
  readonly heroAFile: string;
  readonly heroBFile: string;
  readonly seed: number;
}

export function runDuelCommand(
  args: RunDuelCommandArgs,
  readFile: ReadFile = (path) => readFileSync(path, 'utf8'),
): string {
  const attacker = loadDuelParticipant(readFile, args.heroAFile);
  const defender = loadDuelParticipant(readFile, args.heroBFile);
  const result = resolveDuel({
    seed: args.seed,
    attacker,
    defender,
    effectDefs: {},
    engagement: DEFAULT_ENGAGEMENT,
  });
  return formatDuelLog(result);
}
