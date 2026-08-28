import { CampaignTransitionOverlay } from './components/CampaignTransitionOverlay.js';
import { DuelPreviewPanel } from './components/DuelPreviewPanel.js';
import { DungeonPanel } from './components/DungeonPanel.js';
import { InitiativePanel } from './components/InitiativePanel.js';
import { InventoryPanel } from './components/InventoryPanel.js';
import { MapCanvas } from './components/MapCanvas.js';
import { ObjectivePanel } from './components/ObjectivePanel.js';
import { PvpPanel } from './components/PvpPanel.js';
import { ReplayPanel } from './components/ReplayPanel.js';
import { ResourcePanel } from './components/ResourcePanel.js';
import { TacticsEditor } from './components/TacticsEditor.js';
import { TalentTreePanel } from './components/TalentTreePanel.js';
import { UnitActionBar } from './components/UnitActionBar.js';
import { useEffect } from 'react';
import { campaignMaps } from './data/campaign.js';
import { UI_SCALES } from './data/overlayTheme.js';
import { useBattleStore } from './store/battleStore.js';

// Tamanho de fonte raiz em escala 1. Todo o CSS do cliente está em `rem`, então mudar esta
// raiz escala texto, espaçamento e painéis de uma vez (§11 — "fonte escalável"); o mapa
// escala em paralelo, dentro do `MapCanvas`.
const BASE_ROOT_FONT_PX = 16;

export function App() {
  const campaignMapIndex = useBattleStore((s) => s.campaignMapIndex);
  const mode = useBattleStore((s) => s.mode);
  const instantResultMode = useBattleStore((s) => s.instantResultMode);
  const toggleInstantResultMode = useBattleStore((s) => s.toggleInstantResultMode);
  const colorblindMode = useBattleStore((s) => s.colorblindMode);
  const toggleColorblindMode = useBattleStore((s) => s.toggleColorblindMode);
  const uiScale = useBattleStore((s) => s.uiScale);
  const setUiScale = useBattleStore((s) => s.setUiScale);
  const clearProgress = useBattleStore((s) => s.clearProgress);

  useEffect(() => {
    document.documentElement.style.fontSize = `${BASE_ROOT_FONT_PX * uiScale}px`;
  }, [uiScale]);

  return (
    <div className="app-layout">
      <header>
        <h1>Project Vanguard — campanha</h1>
        <span className="campaign-progress">
          {mode === 'pvp' ? 'Arena — PvP' : mode === 'dungeon' ? 'Masmorra' : `Mapa ${campaignMapIndex + 1} de ${campaignMaps.length}`}
        </span>
        {/* §11 (acessibilidade) — os três itens: resultado instantâneo, modo daltônico e
            fonte escalável. Nenhum deles toca regra: são preferências de apresentação, e
            todas sobrevivem à recarga junto com o progresso. */}
        <label className="instant-result-toggle">
          <input type="checkbox" checked={instantResultMode} onChange={toggleInstantResultMode} />
          Modo resultado instantâneo (pula animações)
        </label>
        <label className="accessibility-toggle">
          <input type="checkbox" checked={colorblindMode} onChange={toggleColorblindMode} />
          Modo daltônico
        </label>
        <label className="ui-scale-select">
          Tamanho
          <select value={uiScale} onChange={(event) => setUiScale(Number(event.target.value))}>
            {UI_SCALES.map((scale) => (
              <option key={scale} value={scale}>
                {Math.round(scale * 100)}%
              </option>
            ))}
          </select>
        </label>
        {/* M13, 3/N — o progresso é salvo sozinho; este é o único jeito de desfazê-lo sem
            abrir o console do navegador. */}
        <button type="button" className="clear-progress" onClick={clearProgress}>
          Apagar progresso
        </button>
      </header>
      <main>
        <MapCanvas />
        <div className="side-panels">
          <ObjectivePanel />
          <PvpPanel />
          <DungeonPanel />
          <InitiativePanel />
          <ResourcePanel />
          <UnitActionBar />
        </div>
      </main>
      <DuelPreviewPanel />
      <TacticsEditor />
      <InventoryPanel />
      <TalentTreePanel />
      <ReplayPanel />
      <CampaignTransitionOverlay />
    </div>
  );
}
