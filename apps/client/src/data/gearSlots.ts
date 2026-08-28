import type { GearSlot } from '@paths-beyond/core';

// Os 6 slots de §7.1, em ordem de exibição. Mora aqui (e não em `InventoryPanel.tsx`,
// onde nasceu) porque o save também precisa da lista para validar o que veio do disco —
// duas cópias da mesma enumeração divergiriam em silêncio.
export const GEAR_SLOTS: readonly GearSlot[] = ['weapon', 'helmet', 'armor', 'necklace', 'ring', 'boots'];
