import { useEffect, useState } from 'react';
import { useBattleStore } from '../store/battleStore.js';

const TROCA_REVEAL_MS = 900; // roadmap M6 — animação; pulada inteiramente em instantResultMode

// §11 — "Preview de duelo: ... exibir troca a troca: quem age, qual linha do script
// disparou, dano previsto, HP final, assistências que vão entrar e recursos que serão
// gastos. Este é o recurso mais importante do jogo." `duelPreview` já é o resultado
// computado (não recalculado) — "Confirmar" só aplica esse mesmo objeto. As trocas são
// reveladas uma a uma (com `instantResultMode` desligado) só na apresentação — o dado por
// trás (`duelResult`) já existe inteiro desde o primeiro render, revelar aos poucos não
// recalcula nada.
export function DuelPreviewPanel() {
  const battleState = useBattleStore((s) => s.battleState);
  const duelPreview = useBattleStore((s) => s.duelPreview);
  const instantResultMode = useBattleStore((s) => s.instantResultMode);
  const confirmEngage = useBattleStore((s) => s.confirmEngage);
  const cancelEngage = useBattleStore((s) => s.cancelEngage);

  const [revealedCount, setRevealedCount] = useState(0);

  useEffect(() => {
    if (!duelPreview) return;
    setRevealedCount(instantResultMode ? duelPreview.duelResult.trocas.length : Math.min(1, duelPreview.duelResult.trocas.length));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [duelPreview, instantResultMode]);

  useEffect(() => {
    if (!duelPreview || instantResultMode) return;
    const total = duelPreview.duelResult.trocas.length;
    if (revealedCount >= total) return;
    const timer = setTimeout(() => setRevealedCount((n) => Math.min(n + 1, total)), TROCA_REVEAL_MS);
    return () => clearTimeout(timer);
  }, [duelPreview, instantResultMode, revealedCount]);

  if (!duelPreview) return null;

  const { duelResult } = duelPreview;
  const visibleTrocas = duelResult.trocas.slice(0, revealedCount);
  const fullyRevealed = revealedCount >= duelResult.trocas.length;
  const attackerBefore = battleState.units.find((u) => u.unitId === duelResult.attackerId);
  const defenderBefore = battleState.units.find((u) => u.unitId === duelResult.defenderId);

  const attackerApSpent = (attackerBefore?.ap ?? 0) - duelResult.finalApAttacker;
  const attackerPpSpent = (attackerBefore?.pp ?? 0) - duelResult.finalPpAttacker;
  const defenderApSpent = (defenderBefore?.ap ?? 0) - duelResult.finalApDefender;
  const defenderPpSpent = (defenderBefore?.pp ?? 0) - duelResult.finalPpDefender;

  return (
    <div className="duel-preview-overlay">
      <div className="duel-preview-panel">
        <h2>Preview de duelo</h2>
        <p>
          {duelResult.attackerId} engaja {duelResult.defenderId}
        </p>

        {visibleTrocas.map((troca) => (
          <div key={troca.trocaNumber} className="troca">
            <h3>
              Troca {troca.trocaNumber} — {troca.firstMoverId} age primeiro
            </h3>
            <ul>
              {troca.actions.map((action, index) => (
                <li key={index}>
                  {action.decision === 'none' ? (
                    <span>{action.actorId}: não pôde agir</span>
                  ) : (
                    <span>
                      {action.actorId} usa {action.skillId}
                      {action.tacticsLineIndex !== null ? ` [linha ${action.tacticsLineIndex}]` : ' [ataque básico]'} em{' '}
                      {action.targetId}
                      {action.hit === false ? ' — errou' : null}
                      {action.hit === true
                        ? `${action.isCrit ? ' CRÍTICO' : ''} — ${action.damage} de dano`
                        : null}
                    </span>
                  )}
                  {action.reaction ? (
                    <div className="reaction">
                      reação de {action.targetId}: {action.reaction.skillId}
                      {action.reaction.counterDamage !== null
                        ? ` (${action.reaction.counterDamage} de contra-dano)`
                        : ''}
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
        ))}

        {fullyRevealed ? (
          <div className="duel-preview-summary">
            <p>
              HP final — {duelResult.attackerId}: {duelResult.finalHpAttacker} · {duelResult.defenderId}:{' '}
              {duelResult.finalHpDefender}
            </p>
            <p>
              Recursos gastos — {duelResult.attackerId}: {attackerApSpent} AP / {attackerPpSpent} PP ·{' '}
              {duelResult.defenderId}: {defenderApSpent} AP / {defenderPpSpent} PP
            </p>
            <p>
              Assistências — {duelResult.attackerId}:{' '}
              {duelResult.attackerAssists.map((a) => a.assistantId).join(', ') || 'nenhuma'} · {duelResult.defenderId}:{' '}
              {duelResult.defenderAssists.map((a) => a.assistantId).join(', ') || 'nenhuma'}
            </p>
            <p>Vencedor: {duelResult.winnerId ?? '(nenhum — 3 trocas sem morte)'}</p>
          </div>
        ) : (
          <p className="duel-preview-revealing">
            Revelando troca {revealedCount + 1} de {duelResult.trocas.length}…
          </p>
        )}

        <div className="duel-preview-actions">
          <button type="button" disabled={!fullyRevealed} onClick={confirmEngage}>
            Confirmar
          </button>
          <button type="button" onClick={cancelEngage}>
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}
