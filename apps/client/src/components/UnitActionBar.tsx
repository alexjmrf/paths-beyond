import { useBattleStore } from '../store/battleStore.js';

// §5.4 — "No seu turno, uma unidade faz: mover? + uma das opções." `move`/`engage` já
// são feitos clicando no mapa (overlays de alcance/ameaça); aqui ficam `wait`/`rest` e o
// atalho pro editor de táticas (§11).
export function UnitActionBar() {
  const battleState = useBattleStore((s) => s.battleState);
  const selectedUnitId = useBattleStore((s) => s.selectedUnitId);
  const lastCommandReason = useBattleStore((s) => s.lastCommandReason);
  const waitSelectedUnit = useBattleStore((s) => s.waitSelectedUnit);
  const restSelectedUnit = useBattleStore((s) => s.restSelectedUnit);
  const openTacticsEditor = useBattleStore((s) => s.openTacticsEditor);
  const openInventory = useBattleStore((s) => s.openInventory);
  const openTalentEditor = useBattleStore((s) => s.openTalentEditor);

  const targetingMode = useBattleStore((s) => s.targetingMode);
  const beginMapSkillTargeting = useBattleStore((s) => s.beginMapSkillTargeting);
  const cancelTargeting = useBattleStore((s) => s.cancelTargeting);

  const unit = battleState.units.find((u) => u.unitId === selectedUnitId);

  if (!unit) {
    return (
      <div className="unit-action-bar">
        <p>Selecione uma unidade no mapa ou na lista de iniciativa.</p>
      </div>
    );
  }

  const distanceMoved = battleState.distanceMovedThisTurn[unit.unitId] ?? 0;

  // §5.4 — "No seu turno, uma unidade faz: mover? + uma das opções", e `mapSkill` é uma
  // delas. O comando existe no core desde M3 e resolve área desde M11, mas o cliente não
  // tinha como emiti-lo: o mapa só sabia mover e engajar, então toda skill de mapa
  // autorada era inalcançável por um humano.
  const mapSkills = Object.values(unit.knownSkills).filter((skill) => skill.kind === 'map');

  return (
    <div className="unit-action-bar">
      <h3>{unit.unitId}</h3>
      <p>
        HP {unit.hp} · AP {unit.ap} · PP {unit.pp}
      </p>
      <p>
        Moveu {distanceMoved} / {unit.moveRange} este turno
      </p>
      <div className="actions">
        <button type="button" disabled={unit.hasActedThisRound} onClick={waitSelectedUnit}>
          Esperar
        </button>
        <button type="button" disabled={unit.hasActedThisRound} onClick={restSelectedUnit}>
          Descansar (+1 AP +1 PP)
        </button>
        {mapSkills.map((skill) => {
          const targeting = targetingMode?.kind === 'mapSkill' && targetingMode.skillId === skill.id;
          const cooldown = unit.cooldowns[skill.id] ?? 0;
          return (
            <button
              key={skill.id}
              type="button"
              className={targeting ? 'targeting' : ''}
              disabled={unit.hasActedThisRound || unit.ap < skill.apCost || cooldown > 0}
              onClick={() => (targeting ? cancelTargeting() : beginMapSkillTargeting(skill.id))}
            >
              {skill.name} ({skill.apCost} AP{skill.areaRadius ? `, área ${skill.areaRadius}` : ''})
            </button>
          );
        })}
        <button type="button" onClick={() => openTacticsEditor(unit.unitId)}>
          Editar táticas
        </button>
        <button type="button" onClick={() => openInventory(unit.unitId)}>
          Inventário
        </button>
        <button type="button" onClick={() => openTalentEditor(unit.unitId)}>
          Talentos
        </button>
      </div>
      {targetingMode?.kind === 'mapSkill' ? (
        <p className="targeting-hint">Clique num tile dentro do alcance para lançar.</p>
      ) : null}
      {lastCommandReason ? <p className="error">{lastCommandReason}</p> : null}
    </div>
  );
}
