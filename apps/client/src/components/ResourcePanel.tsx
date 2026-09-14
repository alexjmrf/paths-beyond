import { useEffect } from 'react';
import { catalog } from '../data/catalog.js';
import { nomeDeUnidade } from '../logic/rotulos.js';
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
  const t = useBattleStore((s) => s.t);
  const heroesByUnitId = useBattleStore((s) => s.heroesByUnitId);
  const artIdByUnitId = useBattleStore((s) => s.artIdByUnitId);
  const selectedUnitId = useBattleStore((s) => s.selectedUnitId);
  const selectUnit = useBattleStore((s) => s.selectUnit);
  const dispararIntroducao = useBattleStore((s) => s.dispararIntroducao);

  const playerUnits = battleState.units.filter((u) => u.side === 'player' && u.hp > 0);

  // §1.1 (M23, 1/N) — AP e PP são duas siglas que a tela mostra sem explicar. A dica sai
  // quando há exército de verdade na tabela: com o tabuleiro vazio (fora de batalha) ela
  // seria texto sobre nada.
  useEffect(() => {
    if (playerUnits.length > 0) dispararIntroducao('recursos-ap-pp');
  }, [playerUnits.length, dispararIntroducao]);

  return (
    <section className="resource-panel">
      <h2>{t('recursos.titulo')}</h2>
      <table>
        <thead>
          <tr>
            <th>{t('recursos.unidade')}</th>
            <th>AP</th>
            <th>PP</th>
            <th>{t('recursos.status')}</th>
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
                <td>{nomeDeUnidade(t, unit.unitId, heroesByUnitId, artIdByUnitId, catalog)}</td>
                <td>{unit.ap}</td>
                <td>{unit.pp}</td>
                <td className="tags">
                  {unit.hasActedThisRound ? (
                    <span className="tag acted">{t('recursos.jaAgiu')}</span>
                  ) : restable ? (
                    <span className="tag rest">{t('recursos.podeDescansar')}</span>
                  ) : (
                    <span className="tag no-rest">{t('recursos.moveuDemais')}</span>
                  )}
                  {vulnerable ? <span className="tag vulnerable">{t('recursos.semPp')}</span> : null}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}
