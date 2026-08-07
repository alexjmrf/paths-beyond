import { useBattleStore } from '../store/battleStore.js';

// §11 — "Lista de iniciativa sempre visível com a ordem completa do round" (requisito
// duro). A ordem em si é fixa (§5.3) — este painel só espelha `initiativeOrder`.
export function InitiativePanel() {
  const battleState = useBattleStore((s) => s.battleState);
  const selectedUnitId = useBattleStore((s) => s.selectedUnitId);
  const selectUnit = useBattleStore((s) => s.selectUnit);

  const unitsById = new Map(battleState.units.map((unit) => [unit.unitId, unit]));

  return (
    <aside className="initiative-panel">
      <h2>Iniciativa — round {battleState.round}</h2>
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
              <span className="name">{unit.unitId}</span>
              <span className="initiative-value">{entry.initiative}</span>
              {dead ? <span className="status">morto</span> : unit.hasActedThisRound ? <span className="status">agiu</span> : null}
            </li>
          );
        })}
      </ol>
      <p className="valor">Valor: {battleState.valor}</p>
      <p className="outcome">Resultado: {battleState.outcome}</p>
    </aside>
  );
}
