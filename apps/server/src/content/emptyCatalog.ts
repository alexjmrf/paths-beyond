import type { ContentCatalog } from './types.js';

// Placeholder pro boot real do servidor até existir um loader de packages/data (corte de
// escopo desta sub-sessão, ver DECISIONS.md e content/types.ts) — nenhum mapa/classe/skill
// real, então nenhuma batalha de verdade roda ainda; só `/health`/`/me` funcionam de fato
// com este catálogo. Trocar por um catálogo carregado de verdade quando o loader existir.
export const EMPTY_CATALOG: ContentCatalog = {
  classes: {},
  skills: {},
  itemSets: {},
  weaponDuelRanges: { sword: 1, axe: 1, spear: 1, bow: 2, arcane: 2, nature: 2, holy: 2 },
  maps: {},
  baselineReactionSkillIds: [],
};
