import type { TacticsLine, UnitType, WeaponType } from '@paths-beyond/core';
import { useState } from 'react';
import { UNIT_TYPES, WEAPON_TYPES, createDefaultCondition } from '../data/conditionSpecs.js';
import { DEFAULT_DUMMY, runTacticsTest, type DummyConfig } from '../logic/testTactics.js';
import { useBattleStore } from '../store/battleStore.js';
import { ConditionEditor } from './ConditionEditor.js';

const MAX_LINES = 6; // §6.3 — "lista ordenada de até 6 linhas"

function cloneLine(line: TacticsLine): TacticsLine {
  return { ...line, conditions: [...line.conditions] };
}

// §11 — "Editor de táticas: Drag & drop das linhas, condições em dropdown, e botão
// 'Testar' contra um manequim configurável (HP, tipo, arma, PP)." O "Testar" reusa
// `selectTacticsAction` do core direto (via `runTacticsTest`) — nenhuma mudança em
// packages/core. Edita um rascunho local; "Salvar" é que grava no battleState.
export function TacticsEditor() {
  const battleState = useBattleStore((s) => s.battleState);
  const tacticsEditorUnitId = useBattleStore((s) => s.tacticsEditorUnitId);
  const closeTacticsEditor = useBattleStore((s) => s.closeTacticsEditor);
  const updateUnitTacticsScript = useBattleStore((s) => s.updateUnitTacticsScript);

  const unit = battleState.units.find((u) => u.unitId === tacticsEditorUnitId);

  const [script, setScript] = useState<TacticsLine[]>(() => (unit ? unit.tacticsScript.map(cloneLine) : []));
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dummy, setDummy] = useState<DummyConfig>(DEFAULT_DUMMY);
  const [testResult, setTestResult] = useState<string | null>(null);

  // Reabre com o script atual da unidade toda vez que o editor é aberto pra uma unidade
  // diferente (tacticsEditorUnitId muda), sem precisar de useEffect.
  const [openedFor, setOpenedFor] = useState(tacticsEditorUnitId);
  if (openedFor !== tacticsEditorUnitId) {
    setOpenedFor(tacticsEditorUnitId);
    setScript(unit ? unit.tacticsScript.map(cloneLine) : []);
    setTestResult(null);
  }

  if (!tacticsEditorUnitId || !unit) return null;

  const knownDuelSkills = Object.values(unit.knownSkills).filter((skill) => skill.kind === 'duel');

  function updateLine(index: number, patch: Partial<TacticsLine>) {
    setScript((prev) => prev.map((line, i) => (i === index ? { ...line, ...patch } : line)));
  }

  function addLine() {
    const firstSkill = knownDuelSkills[0];
    if (!firstSkill || script.length >= MAX_LINES) return;
    setScript((prev) => [...prev, { enabled: true, skillId: firstSkill.id, conditions: [] }]);
  }

  function removeLine(index: number) {
    setScript((prev) => prev.filter((_, i) => i !== index));
  }

  function moveLine(from: number, to: number) {
    setScript((prev) => {
      const next = [...prev];
      const [item] = next.splice(from, 1);
      if (!item) return prev;
      next.splice(to, 0, item);
      return next;
    });
  }

  function addCondition(lineIndex: number) {
    const line = script[lineIndex];
    if (!line) return;
    updateLine(lineIndex, { conditions: [...line.conditions, createDefaultCondition('targetHpBelow')] });
  }

  // TS não propaga o narrowing de `unit` pra dentro de function declarations aninhadas;
  // `activeUnit` é seguro porque, se `unit` ficar undefined num re-render, o componente
  // já retorna null acima e este closure para de ser referenciado por qualquer botão.
  const activeUnit = unit;

  function save() {
    updateUnitTacticsScript(activeUnit.unitId, script);
    closeTacticsEditor();
  }

  function runTest() {
    const decision = runTacticsTest(activeUnit, script, dummy);
    setTestResult(
      decision.kind === 'skill'
        ? `Linha ${decision.lineIndex}: dispara ${decision.skillId}`
        : 'Nenhuma linha bateu — ataque básico',
    );
  }

  return (
    <div className="tactics-editor-overlay">
      <div className="tactics-editor-panel">
        <h2>Editor de táticas — {unit.unitId}</h2>

        <ol className="tactics-lines">
          {script.map((line, index) => (
            <li
              key={index}
              draggable
              onDragStart={() => setDragIndex(index)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => {
                if (dragIndex !== null && dragIndex !== index) moveLine(dragIndex, index);
                setDragIndex(null);
              }}
              className="tactics-line"
            >
              <span className="drag-handle" title="arraste pra reordenar">
                ⠿
              </span>
              <input
                type="checkbox"
                checked={line.enabled}
                onChange={(e) => updateLine(index, { enabled: e.target.checked })}
              />
              <select value={line.skillId} onChange={(e) => updateLine(index, { skillId: e.target.value })}>
                {knownDuelSkills.map((skill) => (
                  <option key={skill.id} value={skill.id}>
                    {skill.name}
                  </option>
                ))}
              </select>
              <button type="button" className="remove" onClick={() => removeLine(index)}>
                remover linha
              </button>

              <div className="conditions">
                {line.conditions.map((condition, condIndex) => (
                  <ConditionEditor
                    key={condIndex}
                    condition={condition}
                    onChange={(next) =>
                      updateLine(index, {
                        conditions: line.conditions.map((c, i) => (i === condIndex ? next : c)),
                      })
                    }
                    onRemove={() =>
                      updateLine(index, { conditions: line.conditions.filter((_, i) => i !== condIndex) })
                    }
                  />
                ))}
                <button type="button" onClick={() => addCondition(index)}>
                  + condição
                </button>
              </div>
            </li>
          ))}
        </ol>
        <button type="button" onClick={addLine} disabled={script.length >= MAX_LINES || knownDuelSkills.length === 0}>
          + linha
        </button>

        <div className="tactics-test">
          <h3>Testar contra manequim</h3>
          <label>
            HP %
            <input
              type="number"
              min={0}
              max={100}
              value={dummy.hpPct}
              onChange={(e) => setDummy({ ...dummy, hpPct: Number(e.target.value) })}
            />
          </label>
          <label>
            PP
            <input
              type="number"
              min={0}
              value={dummy.pp}
              onChange={(e) => setDummy({ ...dummy, pp: Number(e.target.value) })}
            />
          </label>
          <label>
            Tipo
            <select value={dummy.unitType} onChange={(e) => setDummy({ ...dummy, unitType: e.target.value as UnitType })}>
              {UNIT_TYPES.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
          </label>
          <label>
            Arma
            <select
              value={dummy.weaponType}
              onChange={(e) => setDummy({ ...dummy, weaponType: e.target.value as WeaponType })}
            >
              {WEAPON_TYPES.map((weapon) => (
                <option key={weapon} value={weapon}>
                  {weapon}
                </option>
              ))}
            </select>
          </label>
          <label>
            <input
              type="checkbox"
              checked={dummy.isSelfAttacker}
              onChange={(e) => setDummy({ ...dummy, isSelfAttacker: e.target.checked })}
            />
            Eu sou o atacante
          </label>
          <button type="button" onClick={runTest}>
            Testar
          </button>
          {testResult ? <p className="test-result">{testResult}</p> : null}
        </div>

        <div className="tactics-editor-actions">
          <button type="button" onClick={save}>
            Salvar
          </button>
          <button type="button" onClick={closeTacticsEditor}>
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}
