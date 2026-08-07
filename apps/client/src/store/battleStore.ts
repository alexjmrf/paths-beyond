import {
  applyCommandAndAdvance,
  buildInitialState,
  computeReachableTiles,
  resetTree,
  validateAllocation,
  type BattleState,
  type BattleUnit,
  type ClassDef,
  type Coord,
  type DuelResult,
  type GearSlot,
  type Id,
  type ItemInstance,
  type ReachableTile,
  type TacticsScript,
  type TalentAllocation,
  type TalentTree,
} from '@paths-beyond/core';
import { create } from 'zustand';
import { campaignMaps } from '../data/campaign.js';
import { catalog } from '../data/catalog.js';
import { decodeBuildCode } from '../logic/buildCode.js';
import { MAX_POINTS_PER_TREE } from '../logic/talentLayout.js';

// Seed fixa pra esta fatia de M6 — o cliente ainda não tem tela de configuração de
// batalha; a semente real por partida é trabalho de uma fatia futura (persistência/save).
const BATTLE_SEED = 42;

function buildMapState(mapIndex: number): BattleState {
  const content = campaignMaps[mapIndex];
  if (!content) throw new Error(`mapa de campanha ${mapIndex} não existe`);
  return buildInitialState(content.setup, BATTLE_SEED);
}

// A árvore de talentos de um herói vem da SUA classe real (`ClassDef.talentTree`,
// M5/M8) — diferente da árvore única de demonstração que M6 aplicava a toda unidade.
// `heroesByUnitId` (montado em `data/campaign.ts` ao resolver `Hero[]` →
// `buildBattleSetupFromHeroes`) é o único jeito de saber a classe de uma unidade, já
// que `BattleUnit` (core) não carrega `classId` — só o estado de batalha resolvido.
export function classDefForUnit(campaignMapIndex: number, unitId: string): ClassDef | undefined {
  const heroId = campaignMaps[campaignMapIndex]?.heroesByUnitId[unitId]?.classId;
  return heroId ? catalog.classes[heroId] : undefined;
}

// §11 — "Preview de duelo: rodar simulateDuel com a seed real ... Este é o recurso mais
// importante do jogo." `nextState` é o resultado de `applyCommandAndAdvance` já
// computado — confirmar só aplica esse mesmo objeto, nunca recalcula, então o que o
// jogador vê no preview é *literalmente* o que acontece ao confirmar (não uma segunda
// rodada que só deveria dar o mesmo resultado).
export interface DuelPreview {
  readonly nextState: BattleState;
  readonly duelResult: DuelResult;
}

interface BattleStore {
  readonly battleState: BattleState;
  readonly selectedUnitId: string | null;
  readonly reachableTiles: readonly ReachableTile[];
  readonly duelPreview: DuelPreview | null;
  readonly lastCommandReason: string | null;
  readonly campaignMapIndex: number;
  readonly campaignComplete: boolean;
  readonly tacticsEditorUnitId: string | null;
  readonly inventory: readonly ItemInstance[];
  readonly equippedByUnit: Readonly<Record<string, Partial<Record<GearSlot, Id>>>>;
  readonly inventoryUnitId: string | null;
  readonly talentAllocationByUnit: Readonly<Record<string, TalentAllocation>>;
  readonly talentEditorUnitId: string | null;
  readonly lastTalentReason: string | null;
  readonly instantResultMode: boolean;

  selectUnit: (unitId: string | null) => void;
  moveSelectedUnitTo: (destination: Coord) => void;
  waitSelectedUnit: () => void;
  restSelectedUnit: () => void;
  previewEngage: (targetId: string) => void;
  confirmEngage: () => void;
  cancelEngage: () => void;
  advanceToNextMap: () => void;
  retryCurrentMap: () => void;
  openTacticsEditor: (unitId: string) => void;
  closeTacticsEditor: () => void;
  updateUnitTacticsScript: (unitId: string, script: TacticsScript) => void;
  openInventory: (unitId: string) => void;
  closeInventory: () => void;
  equipItem: (unitId: string, itemId: Id) => void;
  unequipItem: (unitId: string, slot: GearSlot) => void;
  openTalentEditor: (unitId: string) => void;
  closeTalentEditor: () => void;
  allocateTalent: (unitId: string, nodeId: Id) => void;
  deallocateTalent: (unitId: string, nodeId: Id) => void;
  resetTalentTree: (unitId: string, tree: TalentTree) => void;
  loadBuildCode: (unitId: string, code: string) => void;
  toggleInstantResultMode: () => void;
}

function computeReachableForUnit(battleState: BattleState, unit: BattleUnit): readonly ReachableTile[] {
  if (unit.hasActedThisRound || unit.hp <= 0) return [];

  const allies = battleState.units
    .filter((u) => u.side === unit.side && u.unitId !== unit.unitId && u.hp > 0)
    .map((u) => u.pos);
  const enemies = battleState.units.filter((u) => u.side !== unit.side && u.hp > 0).map((u) => u.pos);
  const remainingRange = unit.moveRange - (battleState.distanceMovedThisTurn[unit.unitId] ?? 0);

  return computeReachableTiles(
    { map: battleState.map, moveType: unit.moveType, occupiedByAlly: allies, occupiedByEnemy: enemies },
    unit.pos,
    remainingRange,
  );
}

export const useBattleStore = create<BattleStore>((set, get) => ({
  battleState: buildMapState(0),
  selectedUnitId: null,
  reachableTiles: [],
  duelPreview: null,
  lastCommandReason: null,
  campaignMapIndex: 0,
  campaignComplete: false,
  tacticsEditorUnitId: null,
  inventory: Object.values(catalog.items),
  equippedByUnit: {},
  inventoryUnitId: null,
  talentAllocationByUnit: {},
  talentEditorUnitId: null,
  lastTalentReason: null,
  instantResultMode: false,

  selectUnit: (unitId) => {
    if (!unitId) {
      set({ selectedUnitId: null, reachableTiles: [] });
      return;
    }
    const { battleState } = get();
    const unit = battleState.units.find((u) => u.unitId === unitId);
    if (!unit) return;
    set({ selectedUnitId: unitId, reachableTiles: computeReachableForUnit(battleState, unit), lastCommandReason: null });
  },

  moveSelectedUnitTo: (destination) => {
    const { battleState, selectedUnitId, reachableTiles } = get();
    if (!selectedUnitId) return;

    const target = reachableTiles.find((tile) => tile.coord.x === destination.x && tile.coord.y === destination.y);
    if (!target) return; // clicou fora do overlay de alcance — ignora, não monta comando inválido de propósito

    const result = applyCommandAndAdvance(battleState, { t: 'move', unitId: selectedUnitId, path: target.path });
    if (!result.applied) {
      set({ lastCommandReason: result.reason ?? 'movimento inválido' });
      return;
    }

    const movedUnit = result.state.units.find((u) => u.unitId === selectedUnitId);
    set({
      battleState: result.state,
      reachableTiles: movedUnit ? computeReachableForUnit(result.state, movedUnit) : [],
      lastCommandReason: null,
    });
  },

  waitSelectedUnit: () => {
    const { battleState, selectedUnitId } = get();
    if (!selectedUnitId) return;
    const result = applyCommandAndAdvance(battleState, { t: 'wait', unitId: selectedUnitId });
    if (!result.applied) {
      set({ lastCommandReason: result.reason ?? 'comando inválido' });
      return;
    }
    set({ battleState: result.state, selectedUnitId: null, reachableTiles: [], lastCommandReason: null });
  },

  restSelectedUnit: () => {
    const { battleState, selectedUnitId } = get();
    if (!selectedUnitId) return;
    const result = applyCommandAndAdvance(battleState, { t: 'rest', unitId: selectedUnitId });
    if (!result.applied) {
      set({ lastCommandReason: result.reason ?? 'comando inválido' });
      return;
    }
    set({ battleState: result.state, selectedUnitId: null, reachableTiles: [], lastCommandReason: null });
  },

  previewEngage: (targetId) => {
    const { battleState, selectedUnitId } = get();
    if (!selectedUnitId) return;

    const result = applyCommandAndAdvance(battleState, { t: 'engage', unitId: selectedUnitId, targetId });
    if (!result.applied || !result.duelResult) {
      set({ lastCommandReason: result.reason ?? 'não foi possível engajar' });
      return;
    }

    set({ duelPreview: { nextState: result.state, duelResult: result.duelResult }, lastCommandReason: null });
  },

  confirmEngage: () => {
    const { duelPreview } = get();
    if (!duelPreview) return;
    set({
      battleState: duelPreview.nextState,
      duelPreview: null,
      selectedUnitId: null,
      reachableTiles: [],
      lastCommandReason: null,
    });
  },

  cancelEngage: () => {
    set({ duelPreview: null });
  },

  // §09-roadmap.md (M6) — "campanha de 3 mapas jogável ponta a ponta". Sem persistência
  // entre mapas ainda (decisão desta fatia, ver DECISIONS.md): cada mapa novo é montado
  // do zero via `buildMapState`, o herói do jogador não carrega HP/AP/PP do mapa anterior.
  advanceToNextMap: () => {
    const { campaignMapIndex } = get();
    const nextIndex = campaignMapIndex + 1;
    if (nextIndex >= campaignMaps.length) {
      set({ campaignComplete: true });
      return;
    }
    set({
      campaignMapIndex: nextIndex,
      battleState: buildMapState(nextIndex),
      selectedUnitId: null,
      reachableTiles: [],
      duelPreview: null,
      lastCommandReason: null,
    });
  },

  retryCurrentMap: () => {
    const { campaignMapIndex } = get();
    set({
      battleState: buildMapState(campaignMapIndex),
      selectedUnitId: null,
      reachableTiles: [],
      duelPreview: null,
      lastCommandReason: null,
    });
  },

  // §11 — "Editor de táticas: Drag & drop das linhas, condições em dropdown, e botão
  // 'Testar'." Editar o script não é uma ação de batalha (não existe BattleCommand pra
  // isso — configurar táticas é trabalho de fora do combate no jogo real), então isso
  // atualiza a unidade direto no battleState em vez de passar por applyCommandAndAdvance.
  openTacticsEditor: (unitId) => set({ tacticsEditorUnitId: unitId }),
  closeTacticsEditor: () => set({ tacticsEditorUnitId: null }),

  updateUnitTacticsScript: (unitId, script) => {
    const { battleState } = get();
    const units = battleState.units.map((u) => (u.unitId === unitId ? { ...u, tacticsScript: script } : u));
    set({ battleState: { ...battleState, units } });
  },

  // §11 — "Inventário: filtro por set/slot/substat, comparação lado a lado, ganho de
  // dano real ao equipar." Equipar/desequipar não é uma ação de batalha (sem
  // BattleCommand pra isso — troca de gear é trabalho de fora do combate), então isso
  // só mexe em `equippedByUnit`, nunca passa por `applyCommandAndAdvance`.
  openInventory: (unitId) => set({ inventoryUnitId: unitId }),
  closeInventory: () => set({ inventoryUnitId: null }),

  equipItem: (unitId, itemId) => {
    const { inventory, equippedByUnit } = get();
    const item = inventory.find((i) => i.id === itemId);
    if (!item) return;

    // Um item só pode estar equipado em um lugar — some da unidade que tinha antes.
    const next: Record<string, Partial<Record<GearSlot, Id>>> = {};
    for (const [uid, slots] of Object.entries(equippedByUnit)) {
      const filtered: Partial<Record<GearSlot, Id>> = { ...slots };
      for (const slot of Object.keys(filtered) as GearSlot[]) {
        if (filtered[slot] === itemId) delete filtered[slot];
      }
      next[uid] = filtered;
    }
    next[unitId] = { ...next[unitId], [item.slot]: itemId };
    set({ equippedByUnit: next });
  },

  unequipItem: (unitId, slot) => {
    const { equippedByUnit } = get();
    const current = equippedByUnit[unitId];
    if (!current) return;
    const next = { ...current };
    delete next[slot];
    set({ equippedByUnit: { ...equippedByUnit, [unitId]: next } });
  },

  // §11 — "Talentos: Grafo, preview do efeito, string de build compartilhável." Alocar
  // não é uma ação de batalha (sem BattleCommand — treinar talento é fora de combate no
  // jogo real). Toda mudança (+1/-1/reset/carregar código) sempre recomputa a alocação
  // inteira e revalida com `validateAllocation` antes de aplicar — decrementar um nó pode
  // quebrar o gate de linha de outro nó mais alto que dependia daqueles pontos, então a
  // trava não é só "não deixar exceder maxRank", é "a árvore inteira continua válida".
  openTalentEditor: (unitId) => set({ talentEditorUnitId: unitId, lastTalentReason: null }),
  closeTalentEditor: () => set({ talentEditorUnitId: null }),

  allocateTalent: (unitId, nodeId) => {
    const { talentAllocationByUnit, campaignMapIndex } = get();
    const current = talentAllocationByUnit[unitId] ?? {};
    const nextAllocation: TalentAllocation = { ...current, [nodeId]: (current[nodeId] ?? 0) + 1 };
    const result = validateAllocation({
      tree: classDefForUnit(campaignMapIndex, unitId)?.talentTree ?? [],
      allocation: nextAllocation,
      maxPointsPerTree: MAX_POINTS_PER_TREE,
    });
    if (!result.valid) {
      set({ lastTalentReason: result.issues[0]?.reason ?? 'alocação inválida' });
      return;
    }
    set({
      talentAllocationByUnit: { ...talentAllocationByUnit, [unitId]: nextAllocation },
      lastTalentReason: null,
    });
  },

  deallocateTalent: (unitId, nodeId) => {
    const { talentAllocationByUnit, campaignMapIndex } = get();
    const current = talentAllocationByUnit[unitId] ?? {};
    const currentRank = current[nodeId] ?? 0;
    if (currentRank <= 0) return;

    const nextAllocation: TalentAllocation = { ...current, [nodeId]: currentRank - 1 };
    const result = validateAllocation({
      tree: classDefForUnit(campaignMapIndex, unitId)?.talentTree ?? [],
      allocation: nextAllocation,
      maxPointsPerTree: MAX_POINTS_PER_TREE,
    });
    if (!result.valid) {
      set({ lastTalentReason: result.issues[0]?.reason ?? 'remover este ponto invalida outro nó' });
      return;
    }
    set({
      talentAllocationByUnit: { ...talentAllocationByUnit, [unitId]: nextAllocation },
      lastTalentReason: null,
    });
  },

  resetTalentTree: (unitId, tree) => {
    const { talentAllocationByUnit, campaignMapIndex } = get();
    const current = talentAllocationByUnit[unitId] ?? {};
    const next = resetTree(current, tree, classDefForUnit(campaignMapIndex, unitId)?.talentTree ?? []);
    set({ talentAllocationByUnit: { ...talentAllocationByUnit, [unitId]: next }, lastTalentReason: null });
  },

  loadBuildCode: (unitId, code) => {
    const { campaignMapIndex } = get();
    const decoded = decodeBuildCode(code);
    if (!decoded) {
      set({ lastTalentReason: 'código de build inválido' });
      return;
    }
    const result = validateAllocation({
      tree: classDefForUnit(campaignMapIndex, unitId)?.talentTree ?? [],
      allocation: decoded.talents,
      maxPointsPerTree: MAX_POINTS_PER_TREE,
    });
    if (!result.valid) {
      set({ lastTalentReason: result.issues[0]?.reason ?? 'build do código é inválida' });
      return;
    }
    const { talentAllocationByUnit } = get();
    set({
      talentAllocationByUnit: { ...talentAllocationByUnit, [unitId]: decoded.talents },
      lastTalentReason: null,
    });
  },

  // §11 (acessibilidade) — "modo resultado instantâneo (pula animações) — essencial pra
  // farm." Só afeta apresentação (MapCanvas/DuelPreviewPanel); o estado do core nunca
  // muda de forma diferente com o modo ligado ou desligado.
  toggleInstantResultMode: () => set((s) => ({ instantResultMode: !s.instantResultMode })),
}));
