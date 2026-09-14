import type { BattleCommand } from '@paths-beyond/core';
import { useEffect } from 'react';
import { catalog } from '../data/catalog.js';
import { nomeDeUnidade, nomeDoDesfecho } from '../logic/rotulos.js';
import { useBattleStore } from '../store/battleStore.js';

// §11 — "Replay: reprodução passo a passo com controle de velocidade a partir do
// `Replay`." Critério de aceite de M13: o replay reproduzido tem que BATER com o
// resultado do core — o que aqui é estrutural, não uma checagem: cada passo é
// `applyCommandAndAdvance` sobre o mesmo `BattleSetup`, o mesmo caminho que a batalha ao
// vivo usa. A tela não tem cópia própria de regra nenhuma (regra 3).

const SPEEDS = [0.5, 1, 2, 4] as const;
const BASE_STEP_MS = 900;

function describeCommand(command: BattleCommand): string {
  switch (command.t) {
    case 'move': {
      const to = command.path[command.path.length - 1];
      return `${command.unitId} move para (${to?.x ?? '?'}, ${to?.y ?? '?'})`;
    }
    case 'engage':
      return `${command.unitId} engaja ${command.targetId}`;
    case 'wait':
      return `${command.unitId} espera`;
    case 'rest':
      return `${command.unitId} descansa`;
    case 'mapSkill':
      return `${command.unitId} lança ${command.skillId} em (${command.target.x}, ${command.target.y})`;
    case 'useValor':
      return `Valor: ${command.skillId} em (${command.target.x}, ${command.target.y})`;
  }
}

export function ReplayPanel() {
  const viewer = useBattleStore((s) => s.replayViewer);
  const t = useBattleStore((s) => s.t);
  const heroesByUnitId = useBattleStore((s) => s.heroesByUnitId);
  const closeReplayViewer = useBattleStore((s) => s.closeReplayViewer);
  const seekReplay = useBattleStore((s) => s.seekReplay);
  const setReplaySpeed = useBattleStore((s) => s.setReplaySpeed);
  const toggleReplayPlaying = useBattleStore((s) => s.toggleReplayPlaying);

  const playing = viewer?.playing ?? false;
  const speed = viewer?.speed ?? 1;
  const step = viewer?.step ?? 0;

  // O timer vive na tela, não no store: reprodução automática é apresentação, e o estado
  // do passo continua sendo função pura de (replay, step).
  useEffect(() => {
    if (!playing) return;
    const id = setInterval(() => seekReplay(useBattleStore.getState().replayViewer!.step + 1), BASE_STEP_MS / speed);
    return () => clearInterval(id);
  }, [playing, speed, seekReplay]);

  if (!viewer) return null;

  const total = viewer.replay.commands.length;
  const current = viewer.replay.commands[step - 1];
  const next = viewer.replay.commands[step];
  const state = viewer.state;

  return (
    <div className="replay-overlay">
      <section className="replay-panel">
        <h2>{t('replay.titulo')}</h2>
        <p className="replay-meta">
          {t('replay.cabecalho', {
            versao: viewer.replay.rulesVersion,
            seed: viewer.replay.seed,
            comandos: total,
          })}
        </p>

        <p className="replay-step">
          {t('replay.passo', {
            passo: step,
            total,
            round: state.round,
            desfecho: nomeDoDesfecho(t, state.outcome),
          })}
        </p>
        <p className="replay-command">{step === 0 ? 'Estado inicial.' : describeCommand(current!)}</p>
        {next ? <p className="replay-next">A seguir: {describeCommand(next)}</p> : null}

        <table className="replay-units">
          <thead>
            <tr>
              <th>{t('recursos.unidade')}</th>
              <th>HP</th>
              <th>AP</th>
              <th>PP</th>
              <th>{t('replay.posicao')}</th>
            </tr>
          </thead>
          <tbody>
            {state.units.map((unit) => (
              <tr key={unit.unitId} className={unit.hp <= 0 ? 'dead' : unit.side}>
                <td>{nomeDeUnidade(t, unit.unitId, heroesByUnitId, catalog)}</td>
                <td>
                  {unit.hp}/{unit.stats.hp}
                </td>
                <td>{unit.ap}</td>
                <td>{unit.pp}</td>
                <td>
                  {unit.pos.x}, {unit.pos.y}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="replay-controls">
          <button type="button" onClick={() => seekReplay(0)} disabled={step === 0}>
            {t('replay.inicio')}
          </button>
          <button type="button" onClick={() => seekReplay(step - 1)} disabled={step === 0}>
            {t('replay.anterior')}
          </button>
          <button type="button" onClick={toggleReplayPlaying} disabled={total === 0}>
            {playing ? t('replay.pausar') : t('replay.reproduzir')}
          </button>
          <button type="button" onClick={() => seekReplay(step + 1)} disabled={step >= total}>
            {t('replay.proximo')}
          </button>
          <button type="button" onClick={() => seekReplay(total)} disabled={step >= total}>
            {t('replay.fim')}
          </button>
        </div>

        <div className="replay-speed">
          {t('replay.velocidade')}
          {SPEEDS.map((option) => (
            <button
              key={option}
              type="button"
              className={option === speed ? 'active' : ''}
              onClick={() => setReplaySpeed(option)}
            >
              {option}×
            </button>
          ))}
        </div>

        <div className="replay-actions">
          <button type="button" onClick={closeReplayViewer}>
            {t('replay.fechar')}
          </button>
        </div>
      </section>
    </div>
  );
}
