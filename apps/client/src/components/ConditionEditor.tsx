import type { Condition, UnitType, WeaponType } from '@paths-beyond/core';
import {
  condicaoChave,
  CONDITION_TYPES,
  UNIT_TYPES,
  WEAPON_TYPES,
  createDefaultCondition,
  type BaseConditionType,
} from '../data/conditionSpecs.js';
import { useBattleStore } from '../store/battleStore.js';

interface ConditionEditorProps {
  readonly condition: Condition;
  readonly onChange: (next: Condition) => void;
  readonly onRemove: () => void;
}

// §6.3 — "condições em dropdown" (requisito duro do editor de táticas, §11). `not` é
// editado aqui como um checkbox "negar" em vez de mais uma opção no dropdown — decisão
// registrada em DECISIONS.md, evita UI recursiva pra um caso que é só uma negação.
export function ConditionEditor({ condition, onChange, onRemove }: ConditionEditorProps) {
  const t = useBattleStore((s) => s.t);
  const isNegated = condition.t === 'not';
  const inner: Condition = isNegated ? (condition as Extract<Condition, { t: 'not' }>).c : condition;

  function updateInner(next: Condition) {
    onChange(isNegated ? { t: 'not', c: next } : next);
  }

  function toggleNegated(checked: boolean) {
    onChange(checked ? { t: 'not', c: inner } : inner);
  }

  function changeType(type: BaseConditionType) {
    updateInner(createDefaultCondition(type));
  }

  return (
    <div className="condition-editor">
      <label className="negate">
        <input type="checkbox" checked={isNegated} onChange={(e) => toggleNegated(e.target.checked)} />
        NÃO
      </label>
      <select value={inner.t} onChange={(e) => changeType(e.target.value as BaseConditionType)}>
        {CONDITION_TYPES.map((type) => (
          <option key={type} value={type}>
            {t(condicaoChave(type))}
          </option>
        ))}
      </select>
      <ConditionFields condition={inner} onChange={updateInner} />
      <button type="button" className="remove" onClick={onRemove}>
        ×
      </button>
    </div>
  );
}

function ConditionFields({ condition, onChange }: { condition: Condition; onChange: (next: Condition) => void }) {
  // M25 — os dois `placeholder` desta função são texto de tela; o resto são campos numéricos
  // e dropdowns de id, que não têm o que traduzir.
  const t = useBattleStore((s) => s.t);

  switch (condition.t) {
    case 'targetHpBelow':
    case 'targetHpAbove':
    case 'selfHpBelow':
      return (
        <input
          type="number"
          min={0}
          max={1000}
          value={condition.pct}
          onChange={(e) => onChange({ ...condition, pct: Number(e.target.value) })}
        />
      );

    case 'targetHasDebuff':
      return (
        <input
          type="text"
          placeholder={t('condicao.idDoDebuff')}
          value={condition.debuffId}
          onChange={(e) => onChange({ ...condition, debuffId: e.target.value })}
        />
      );

    case 'targetHasBuff':
    case 'selfBuffAbsent':
      return (
        <input
          type="text"
          placeholder={t('condicao.idDoBuff')}
          value={condition.buffId}
          onChange={(e) => onChange({ ...condition, buffId: e.target.value })}
        />
      );

    case 'targetIsType':
      return (
        <select value={condition.type} onChange={(e) => onChange({ ...condition, type: e.target.value as UnitType })}>
          {UNIT_TYPES.map((type) => (
            <option key={type} value={type}>
              {type}
            </option>
          ))}
        </select>
      );

    case 'targetWeaponIs':
      return (
        <select
          value={condition.weapon}
          onChange={(e) => onChange({ ...condition, weapon: e.target.value as WeaponType })}
        >
          {WEAPON_TYPES.map((weapon) => (
            <option key={weapon} value={weapon}>
              {weapon}
            </option>
          ))}
        </select>
      );

    case 'targetPpBelow':
    case 'apAtLeast':
    case 'ppAtLeast':
    case 'battleRoundAtLeast':
    case 'alliesAdjacentAtLeast':
      return (
        <input
          type="number"
          min={0}
          value={condition.n}
          onChange={(e) => onChange({ ...condition, n: Number(e.target.value) })}
        />
      );

    case 'trocaAtLeast':
      return (
        <select
          value={condition.n}
          onChange={(e) => onChange({ ...condition, n: Number(e.target.value) as 1 | 2 | 3 })}
        >
          <option value={1}>1</option>
          <option value={2}>2</option>
          <option value={3}>3</option>
        </select>
      );

    case 'isAttacker':
    case 'isDefender':
    case 'hasPositionalBonus':
      return null;

    case 'not':
      // Não deveria acontecer — `condition` aqui já é sempre o `inner` sem o wrapper.
      return null;
  }
}
