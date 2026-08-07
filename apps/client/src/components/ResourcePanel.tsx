import { useBattleStore } from '../store/battleStore.js';

// Mesma regra de `applyRest` em packages/core/src/battle/commands.ts: não pode ter
// andado mais que metade do moveRange. Aqui é só leitura pra exibição — quem de fato
// valida/aplica é o core (`applyCommandAndAdvance`), nunca este painel.
function canRest(distanceMoved: number, moveRange: number, hasActedThisRound: boolean): boolean {
  if (hasActedThisRound) return false;
  const halfRange = moveRange >> 1;
  return distanceMoved <= halfRange;
}

// §11 — "Painel de recursos: visão do exército inteiro: AP/PP de todos, quem pode
// `rest`, quem está sem PP (vulnerável a Emboscada)."
export function ResourcePanel() {
  const battleState = useBattleStore((s) => s.battleState);
  const selectedUnitId = useBattleStore((s) => s.selectedUnitId);
  const selectUnit = useBattleStore((s) => s.selectUnit);

  const playerUnits = battleState.units.filter((u) => u.side === 'player' && u.hp > 0);

  return (
    <section className="resource-panel">
      <h2>Recursos do exército</h2>
      <table>
        <thead>
          <tr>
            <th>Unidade</th>
            <th>AP</th>
            <th>PP</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {playerUnits.map((unit) => {
            const distanceMoved = battleState.distanceMovedThisTurn[unit.unitId] ?? 0;
            const restable = canRest(distanceMoved, unit.moveRange, unit.hasActedThisRound);
            const vulnerable = unit.pp === 0;

            return (
              <tr
                key={unit.unitId}
                className={[unit.unitId === selectedUnitId ? 'selected' : '', vulnerable ? 'vulnerable' : '']
                  .filter(Boolean)
                  .join(' ')}
                onClick={() => selectUnit(unit.unitId)}
              >
                <td>{unit.unitId}</td>
                <td>{unit.ap}</td>
                <td>{unit.pp}</td>
                <td className="tags">
                  {unit.hasActedThisRound ? (
                    <span className="tag acted">já agiu</span>
                  ) : restable ? (
                    <span className="tag rest">pode descansar</span>
                  ) : (
                    <span className="tag no-rest">moveu demais p/ rest</span>
                  )}
                  {vulnerable ? <span className="tag vulnerable">sem PP — emboscada</span> : null}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}
