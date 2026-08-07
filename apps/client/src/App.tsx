import { CampaignTransitionOverlay } from './components/CampaignTransitionOverlay.js';
import { DuelPreviewPanel } from './components/DuelPreviewPanel.js';
import { InitiativePanel } from './components/InitiativePanel.js';
import { InventoryPanel } from './components/InventoryPanel.js';
import { MapCanvas } from './components/MapCanvas.js';
import { ResourcePanel } from './components/ResourcePanel.js';
import { TacticsEditor } from './components/TacticsEditor.js';
import { TalentTreePanel } from './components/TalentTreePanel.js';
import { UnitActionBar } from './components/UnitActionBar.js';
import { campaignMaps } from './data/campaign.js';
import { useBattleStore } from './store/battleStore.js';

export function App() {
  const campaignMapIndex = useBattleStore((s) => s.campaignMapIndex);
  const instantResultMode = useBattleStore((s) => s.instantResultMode);
  const toggleInstantResultMode = useBattleStore((s) => s.toggleInstantResultMode);

  return (
    <div className="app-layout">
      <header>
        <h1>Project Vanguard — campanha</h1>
        <span className="campaign-progress">
          Mapa {campaignMapIndex + 1} de {campaignMaps.length}
        </span>
        <label className="instant-result-toggle">
          <input type="checkbox" checked={instantResultMode} onChange={toggleInstantResultMode} />
          Modo resultado instantâneo (pula animações)
        </label>
      </header>
      <main>
        <MapCanvas />
        <div className="side-panels">
          <InitiativePanel />
          <ResourcePanel />
          <UnitActionBar />
        </div>
      </main>
      <DuelPreviewPanel />
      <TacticsEditor />
      <InventoryPanel />
      <TalentTreePanel />
      <CampaignTransitionOverlay />
    </div>
  );
}
