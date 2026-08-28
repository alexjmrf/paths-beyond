import { decideMapAiCommand } from '../battle/mapAi.js';
import { applyCommandAndAdvance, buildInitialState } from '../battle/simulate.js';
import type { BattleCommand, BattleSetup, BattleState, BattleUnit, MapAiArchetype } from '../battle/types.js';
import type { Id } from '../types.js';

// M14, sub-sessão 2/N — a varredura da masmorra. Decisão do usuário: depois de limpar a
// dificuldade normal à mão, o jogador pode deixar um time automático, "que ainda sim teria
// que ser forte o suficiente para passar".
//
// A varredura NÃO é uma rolagem de sucesso nem uma comparação de poder: é a batalha
// inteira resolvida com a IA de mapa de §9.1 (M7) jogando os DOIS lados. "Forte o
// bastante" sai da própria simulação, sem número de dificuldade novo — o time que não
// vence, não vence, e perde a energia igual.
//
// O lado inimigo já é resolvido por dentro de `applyCommandAndAdvance` desde M7; o que
// falta é alguém decidir pelo lado do jogador, e isso é a mesma `decideMapAiCommand`.

// Teto de comandos. Não é regra de jogo: é o que impede um mapa mal autorado (objetivo
// inalcançável, dois lados parados) de rodar para sempre no servidor. Mesmo papel do
// `COMMAND_BUDGET` do piloto de campanha, aqui com o dobro de folga porque uma masmorra
// pode ter mais unidades que um capítulo.
export const AUTO_BATTLE_COMMAND_BUDGET = 800;

// Sem arquétipo declarado o time joga agressivo: é o comportamento que um jogador espera
// de "deixar o time no automático", e o único dos cinco que sempre avança para resolver a
// batalha.
export const DEFAULT_AUTO_ARCHETYPE: MapAiArchetype = 'aggressive';

export interface ResolveAutoBattleInput {
  readonly setup: BattleSetup;
  readonly seed: number;
  // Arquétipo por unidade do jogador. O que não estiver aqui joga `aggressive`.
  readonly playerArchetypes?: Readonly<Record<Id, MapAiArchetype>>;
  readonly commandBudget?: number;
}

export interface AutoBattleResult {
  readonly state: BattleState;
  // `ongoing` significa que o teto de comandos foi atingido sem desfecho — não é vitória.
  readonly outcome: BattleState['outcome'];
  readonly commands: readonly BattleCommand[];
  readonly rounds: number;
}

function nextPlayerUnit(state: BattleState): BattleUnit | undefined {
  // Ordem FIXA de iniciativa (§5.3), a mesma que a IA inimiga usa: depender da ordem de
  // montagem de `state.units` deixaria a varredura sensível a como o setup foi montado.
  return state.initiativeOrder
    .map((entry) => state.units.find((u) => u.unitId === entry.unitId))
    .find((u): u is BattleUnit => !!u && u.side === 'player' && u.hp > 0 && !u.hasActedThisRound);
}

export function resolveAutoBattle(input: ResolveAutoBattleInput): AutoBattleResult {
  const budget = input.commandBudget ?? AUTO_BATTLE_COMMAND_BUDGET;
  let state = buildInitialState(input.setup, input.seed);
  const commands: BattleCommand[] = [];

  while (state.outcome === 'ongoing' && commands.length < budget) {
    const unit = nextPlayerUnit(state);
    if (!unit) break; // ninguém do jogador pendente — a IA inimiga já foi drenada por dentro

    const archetype = input.playerArchetypes?.[unit.unitId] ?? DEFAULT_AUTO_ARCHETYPE;
    const command = decideMapAiCommand({ state, unitId: unit.unitId, archetype });

    const outcome = applyCommandAndAdvance(state, command);
    if (outcome.applied) {
      commands.push(command);
      state = outcome.state;
      continue;
    }

    // Comando recusado não pode virar laço infinito. `wait` encerra o turno da unidade e é
    // sempre legal para quem ainda não agiu; se nem ele passar, a batalha travou e o teto
    // de comandos deixa de ser o único freio.
    const fallback: BattleCommand = { t: 'wait', unitId: unit.unitId };
    const waited = applyCommandAndAdvance(state, fallback);
    if (!waited.applied) break;
    commands.push(fallback);
    state = waited.state;
  }

  return { state, outcome: state.outcome, commands, rounds: state.round };
}
