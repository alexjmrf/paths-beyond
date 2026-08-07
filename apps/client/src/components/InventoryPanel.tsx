import { STAT_KEYS, type GearSlot, type ItemInstance, type StatKey } from '@paths-beyond/core';
import { useState } from 'react';
import { catalog } from '../data/catalog.js';
import { previewEquip } from '../logic/itemPreview.js';
import { useBattleStore } from '../store/battleStore.js';

const GEAR_SLOTS: readonly GearSlot[] = ['weapon', 'helmet', 'armor', 'necklace', 'ring', 'boots'];
const itemSets = Object.values(catalog.itemSets);

function setName(setId: string): string {
  return catalog.itemSets[setId]?.name ?? setId;
}

function itemLabel(item: ItemInstance): string {
  return `${item.slot} · ${item.mainstat.stat} · +${item.enhance} · ${setName(item.setId)}`;
}

function statDeltaRow(stat: StatKey, before: number, after: number) {
  const delta = after - before;
  if (delta === 0) return null;
  return (
    <li key={stat} className={delta > 0 ? 'gain' : 'loss'}>
      {stat}: {before} → {after} ({delta > 0 ? '+' : ''}
      {delta})
    </li>
  );
}

// §11 — "Inventário: filtro por set/slot/substat, comparação lado a lado, ganho de dano
// real (não só CP) ao equipar." A comparação reusa `previewEquip` (apps/client/src/logic/
// itemPreview.ts), que chama `computeDamage`/`computeCombatPower` do core direto — nenhuma
// mudança em packages/core foi necessária.
export function InventoryPanel() {
  const battleState = useBattleStore((s) => s.battleState);
  const inventoryUnitId = useBattleStore((s) => s.inventoryUnitId);
  const inventory = useBattleStore((s) => s.inventory);
  const equippedByUnit = useBattleStore((s) => s.equippedByUnit);
  const closeInventory = useBattleStore((s) => s.closeInventory);
  const equipItem = useBattleStore((s) => s.equipItem);
  const unequipItem = useBattleStore((s) => s.unequipItem);

  const [slotFilter, setSlotFilter] = useState<GearSlot | 'all'>('all');
  const [setFilter, setSetFilter] = useState<string>('all');
  const [substatFilter, setSubstatFilter] = useState<StatKey | 'all'>('all');
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);

  const unit = battleState.units.find((u) => u.unitId === inventoryUnitId);
  if (!inventoryUnitId || !unit) return null;

  const equippedSlots = equippedByUnit[unit.unitId] ?? {};
  const equippedItems = Object.values(equippedSlots)
    .map((itemId) => inventory.find((i) => i.id === itemId))
    .filter((i): i is ItemInstance => i !== undefined);

  const filteredItems = inventory.filter((i) => {
    if (slotFilter !== 'all' && i.slot !== slotFilter) return false;
    if (setFilter !== 'all' && i.setId !== setFilter) return false;
    if (substatFilter !== 'all' && !i.substats.some((s) => s.stat === substatFilter)) return false;
    return true;
  });

  const selectedItem = filteredItems.find((i) => i.id === selectedItemId) ?? null;
  const preview = selectedItem ? previewEquip(unit.stats, equippedItems, selectedItem) : null;
  const isEquipped = selectedItem ? equippedSlots[selectedItem.slot] === selectedItem.id : false;

  return (
    <div className="inventory-overlay">
      <div className="inventory-panel">
        <h2>Inventário — {unit.unitId}</h2>

        <div className="inventory-equipped">
          {GEAR_SLOTS.map((slot) => {
            const equippedId = equippedSlots[slot];
            const equippedItem = equippedId ? inventory.find((i) => i.id === equippedId) : undefined;
            return (
              <div key={slot} className="equipped-slot">
                <span className="slot-name">{slot}</span>
                <span>{equippedItem ? itemLabel(equippedItem) : '(vazio)'}</span>
                {equippedItem ? (
                  <button type="button" onClick={() => unequipItem(unit.unitId, slot)}>
                    remover
                  </button>
                ) : null}
              </div>
            );
          })}
        </div>

        <div className="inventory-filters">
          <label>
            Slot
            <select value={slotFilter} onChange={(e) => setSlotFilter(e.target.value as GearSlot | 'all')}>
              <option value="all">todos</option>
              {GEAR_SLOTS.map((slot) => (
                <option key={slot} value={slot}>
                  {slot}
                </option>
              ))}
            </select>
          </label>
          <label>
            Set
            <select value={setFilter} onChange={(e) => setSetFilter(e.target.value)}>
              <option value="all">todos</option>
              {itemSets.map((set) => (
                <option key={set.id} value={set.id}>
                  {set.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Substat
            <select value={substatFilter} onChange={(e) => setSubstatFilter(e.target.value as StatKey | 'all')}>
              <option value="all">todos</option>
              {STAT_KEYS.map((stat) => (
                <option key={stat} value={stat}>
                  {stat}
                </option>
              ))}
            </select>
          </label>
        </div>

        <ul className="inventory-list">
          {filteredItems.map((it) => (
            <li
              key={it.id}
              className={it.id === selectedItemId ? 'selected' : ''}
              onClick={() => setSelectedItemId(it.id)}
            >
              {itemLabel(it)}
              {equippedSlots[it.slot] === it.id ? <span className="equipped-tag">equipado</span> : null}
            </li>
          ))}
        </ul>

        {selectedItem && preview ? (
          <div className="inventory-comparison">
            <h3>Comparação — {itemLabel(selectedItem)}</h3>
            <ul>
              {STAT_KEYS.map((stat) => statDeltaRow(stat, preview.statsBefore[stat], preview.statsAfter[stat]))}
            </ul>
            <p>
              Dano de ataque básico (vs. manequim): {preview.damageBefore} → {preview.damageAfter} (
              {preview.damageAfter - preview.damageBefore >= 0 ? '+' : ''}
              {preview.damageAfter - preview.damageBefore})
            </p>
            <p>
              CP: {preview.cpBefore} → {preview.cpAfter} (
              {preview.cpAfter - preview.cpBefore >= 0 ? '+' : ''}
              {preview.cpAfter - preview.cpBefore})
            </p>
            <button
              type="button"
              disabled={isEquipped}
              onClick={() => equipItem(unit.unitId, selectedItem.id)}
            >
              Equipar
            </button>
          </div>
        ) : null}

        <div className="inventory-actions">
          <button type="button" onClick={closeInventory}>
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}
