import { catalog } from '../data/catalog.js';
import { nomeDeUnidade, nomeDoDesfecho } from '../logic/rotulos.js';
import { useBattleStore } from '../store/battleStore.js';

// §11 — "Lista de iniciativa sempre visível com a ordem completa do round" (requisito
// duro). A ordem em si é fixa (§5.3) — este painel só espelha `initiativeOrder`.
export function InitiativePanel() {
  const battleState = useBattleStore((s) => s.battleState);
  const t = useBattleStore((s) => s.t);
  const heroesByUnitId = useBattleStore((s) => s.heroesByUnitId);
  const artIdByUnitId = useBattleStore((s) => s.artIdByUnitId);
  const selectedUnitId = useBattleStore((s) => s.selectedUnitId);
  const selectUnit = useBattleStore((s) => s.selectUnit);

  const unitsById = new Map(battleState.units.map((unit) => [unit.unitId, unit]));

  return (
    <aside className="initiative-panel">
      <h2>{t('iniciativa.titulo', { round: battleState.round })}</h2>
      <ol>
        {battleState.initiativeOrder.map((entry) => {
          const unit = unitsById.get(entry.unitId);
          if (!unit) return null;
          const dead = unit.hp <= 0;
          return (
            <li
              key={entry.unitId}
              className={[
                'initiative-entry',
                unit.side,
                unit.unitId === selectedUnitId ? 'selected' : '',
                unit.hasActedThisRound ? 'acted' : '',
                dead ? 'dead' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              onClick={() => !dead && selectUnit(unit.unitId)}
            >
              <span className="name">{nomeDeUnidade(t, unit.unitId, heroesByUnitId, artIdByUnitId, catalog)}</span>
              <span className="initiative-value">{entry.initiative}</span>
              {dead ? (
                <span className="status">{t('iniciativa.morto')}</span>
              ) : unit.hasActedThisRound ? (
                <span className="status">{t('iniciativa.agiu')}</span>
              ) : null}
            </li>
          );
        })}
      </ol>
      {/* M23 3/N — "nenhuma tela exige conhecimento que o jogo não deu". `Valor: 3` não
          dizia nada a quem chega: o número é recurso do MAPA (§5.6), ganho ao capturar e
          gasto em habilidades de Valor, e sem isso ele parecia um placar. */}
      <p className="valor" title={t('iniciativa.valorTitle')}>
        {t('iniciativa.valor', { valor: battleState.valor })}{' '}
        <span className="hint">{t('iniciativa.valorHint')}</span>
      </p>
      <p className="outcome">{t('iniciativa.resultado', { resultado: nomeDoDesfecho(t, battleState.outcome) })}</p>
    </aside>
  );
}
