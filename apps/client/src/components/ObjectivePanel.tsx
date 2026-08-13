import type { BattleState, WinCondition } from '@paths-beyond/core';
import { useBattleStore } from '../store/battleStore.js';

// M12, sub-sessão 4/N — o objetivo do mapa na tela.
//
// Até M11 toda condição de vitória era `rout` e não havia o que explicar: mate todo mundo.
// Com a campanha real (sub-sessão 3/N) o jogador entra num mapa de `defend` sem saber que
// tile precisa segurar nem por quantos rounds, e num de `escort` sem saber quem morre a
// partida se morrer. Sem isto os 4 objetivos novos existem só no JSON.

function describeObjective(condition: WinCondition, state: BattleState): { title: string; detail: string } {
  switch (condition.t) {
    case 'rout':
      return {
        title: 'Derrotar todos os inimigos',
        detail: `${state.units.filter((u) => u.side === 'enemy' && u.hp > 0).length} inimigo(s) de pé.`,
      };
    case 'seize':
      return {
        title: `Tomar o objetivo em (${condition.target.x}, ${condition.target.y})`,
        detail: 'Basta uma unidade sua viva sobre o tile marcado. Não é preciso matar todos.',
      };
    case 'surviveRounds':
      return {
        title: `Sobreviver ${condition.n} rounds`,
        detail:
          state.round > condition.n
            ? 'Rounds cumpridos.'
            : `Faltam ${condition.n - state.round + 1} round(s). Inimigo vivo em campo não impede a vitória.`,
      };
    case 'escort':
      return {
        title: `Levar ${condition.unitId} até (${condition.target.x}, ${condition.target.y})`,
        detail: 'Se a unidade escoltada cair, a batalha está perdida na hora.',
      };
    case 'defend':
      return {
        title: `Segurar (${condition.target.x}, ${condition.target.y}) por ${condition.rounds} rounds`,
        detail:
          `Faltam ${Math.max(0, condition.rounds - state.round + 1)} round(s). ` +
          'Inimigo sobre o tile é derrota imediata — cumprir os rounds depois não desfaz.',
      };
  }
}

// §5.6 — "Valor: recurso de exército." Usar não consome o turno de ninguém, então o painel
// fica sempre disponível, e não só quando há unidade selecionada.
function ValorSection() {
  const battleState = useBattleStore((s) => s.battleState);
  const targetingMode = useBattleStore((s) => s.targetingMode);
  const beginValorTargeting = useBattleStore((s) => s.beginValorTargeting);
  const cancelTargeting = useBattleStore((s) => s.cancelTargeting);

  const skills = Object.values(battleState.valorSkills ?? {});

  return (
    <div className="valor-section">
      <h3>
        Valor: <span className="valor-amount">{battleState.valor}</span>
      </h3>
      {skills.length === 0 ? (
        <p className="hint">Este mapa não declara skills de Valor.</p>
      ) : (
        <ul className="valor-skills">
          {skills.map((skill) => {
            const targeting = targetingMode?.kind === 'valor' && targetingMode.skillId === skill.id;
            // `summonReinforcement` não tem resolução (decisão registrada em M11 3/N): o
            // core rejeita alto em vez de gastar Valor em silêncio, e o botão diz isso
            // antes de o jogador tentar.
            const unsupported = skill.kind === 'summonReinforcement';
            return (
              <li key={skill.id}>
                <button
                  type="button"
                  className={targeting ? 'targeting' : ''}
                  disabled={battleState.valor < skill.cost || unsupported}
                  onClick={() => (targeting ? cancelTargeting() : beginValorTargeting(skill.id))}
                  title={unsupported ? 'sem resolução no motor — ver DECISIONS.md (M11 3/N)' : skill.kind}
                >
                  {skill.name} <span className="cost">({skill.cost} Valor)</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {targetingMode?.kind === 'valor' ? (
        <p className="targeting-hint">Clique num tile do mapa para lançar, ou no botão de novo para cancelar.</p>
      ) : null}
    </div>
  );
}

export function ObjectivePanel() {
  const battleState = useBattleStore((s) => s.battleState);
  const objective = describeObjective(battleState.winCondition, battleState);

  return (
    <section className="objective-panel">
      <h2>Objetivo</h2>
      <p className="objective-title">{objective.title}</p>
      <p className="objective-detail">{objective.detail}</p>
      <p className="round-counter">Round {battleState.round}</p>
      <ValorSection />
    </section>
  );
}
