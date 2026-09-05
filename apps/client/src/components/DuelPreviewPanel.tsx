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
  const t = useBattleStore((s) => s.t);
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
        <h2>{t('duelo.titulo')}</h2>
        <p>{t('duelo.engaja', { atacante: duelResult.attackerId, defensor: duelResult.defenderId })}</p>

        {visibleTrocas.map((troca) => (
          <div key={troca.trocaNumber} className="troca">
            <h3>{t('duelo.troca', { numero: troca.trocaNumber, primeiro: troca.firstMoverId })}</h3>
            <ul>
              {troca.actions.map((action, index) => (
                <li key={index}>
                  {action.decision === 'none' ? (
                    <span>{t('duelo.naoPodeAgir', { ator: action.actorId })}</span>
                  ) : (
                    <span>
                      {t('duelo.usa', { ator: action.actorId, skill: action.skillId ?? '' })}
                      {action.tacticsLineIndex !== null
                        ? t('duelo.linha', { linha: action.tacticsLineIndex })
                        : t('duelo.ataqueBasico')}
                      {t('duelo.em', { alvo: action.targetId })}
                      {action.hit === false ? t('duelo.errou') : null}
                      {action.hit === true
                        ? t('duelo.dano', {
                            critico: action.isCrit ? t('duelo.critico') : '',
                            dano: action.damage,
                          })
                        : null}
                    </span>
                  )}
                  {action.reaction ? (
                    <div className="reaction">
                      {t('duelo.reacao', { alvo: action.targetId, skill: action.reaction.skillId })}
                      {action.reaction.counterDamage !== null
                        ? t('duelo.contraDano', { dano: action.reaction.counterDamage })
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
              {t('duelo.hpFinal', {
                atacante: duelResult.attackerId,
                hpAtacante: duelResult.finalHpAttacker,
                defensor: duelResult.defenderId,
                hpDefensor: duelResult.finalHpDefender,
              })}
            </p>
            <p>
              {t('duelo.recursos', {
                atacante: duelResult.attackerId,
                apAtacante: attackerApSpent,
                ppAtacante: attackerPpSpent,
                defensor: duelResult.defenderId,
                apDefensor: defenderApSpent,
                ppDefensor: defenderPpSpent,
              })}
            </p>
            <p>
              {t('duelo.assistencias', {
                atacante: duelResult.attackerId,
                assistAtacante:
                  duelResult.attackerAssists.map((a) => a.assistantId).join(', ') || t('duelo.nenhuma'),
                defensor: duelResult.defenderId,
                assistDefensor:
                  duelResult.defenderAssists.map((a) => a.assistantId).join(', ') || t('duelo.nenhuma'),
              })}
            </p>
            <p>{t('duelo.vencedor', { vencedor: duelResult.winnerId ?? t('duelo.semVencedor') })}</p>
          </div>
        ) : (
          <p className="duel-preview-revealing">
            {t('duelo.revelando', { atual: revealedCount + 1, total: duelResult.trocas.length })}
          </p>
        )}

        <div className="duel-preview-actions">
          <button type="button" disabled={!fullyRevealed} onClick={confirmEngage}>
            {t('duelo.confirmar')}
          </button>
          <button type="button" onClick={cancelEngage}>
            {t('duelo.cancelar')}
          </button>
        </div>
      </div>
    </div>
  );
}
