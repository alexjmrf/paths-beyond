import { CampaignTransitionOverlay } from './components/CampaignTransitionOverlay.js';
import { DuelPreviewPanel } from './components/DuelPreviewPanel.js';
import { DungeonPanel } from './components/DungeonPanel.js';
import { InitiativePanel } from './components/InitiativePanel.js';
import { IntroducaoOverlay } from './components/IntroducaoOverlay.js';
import { InventoryPanel } from './components/InventoryPanel.js';
import { MapCanvas } from './components/MapCanvas.js';
import { ObjectivePanel } from './components/ObjectivePanel.js';
import { PvpPanel } from './components/PvpPanel.js';
import { ReplayPanel } from './components/ReplayPanel.js';
import { ResourcePanel } from './components/ResourcePanel.js';
import { CampaignPanel } from './components/CampaignPanel.js';
import { SummonPanel } from './components/SummonPanel.js';
import { TacticsEditor } from './components/TacticsEditor.js';
import { TalentTreePanel } from './components/TalentTreePanel.js';
import { UnitActionBar } from './components/UnitActionBar.js';
import { UpdateBanner } from './components/UpdateBanner.js';
import { VersionGate } from './components/VersionGate.js';
import { useEffect } from 'react';
import { UI_SCALES } from './data/overlayTheme.js';
import { IDIOMAS } from './i18n/idioma.js';
import { useBattleStore } from './store/battleStore.js';

// Tamanho de fonte raiz em escala 1. Todo o CSS do cliente está em `rem`, então mudar esta
// raiz escala texto, espaçamento e painéis de uma vez (§11 — "fonte escalável"); o mapa
// escala em paralelo, dentro do `MapCanvas`.
const BASE_ROOT_FONT_PX = 16;

export function App() {
  const campaignChapter = useBattleStore((s) => s.campaign.ticket?.chapterId ?? null);
  const mode = useBattleStore((s) => s.mode);
  const instantResultMode = useBattleStore((s) => s.instantResultMode);
  const toggleInstantResultMode = useBattleStore((s) => s.toggleInstantResultMode);
  const colorblindMode = useBattleStore((s) => s.colorblindMode);
  const toggleColorblindMode = useBattleStore((s) => s.toggleColorblindMode);
  const uiScale = useBattleStore((s) => s.uiScale);
  const setUiScale = useBattleStore((s) => s.setUiScale);
  const clearProgress = useBattleStore((s) => s.clearProgress);
  const volumeEfeitos = useBattleStore((s) => s.volumeEfeitos);
  const volumeMusica = useBattleStore((s) => s.volumeMusica);
  const definirVolume = useBattleStore((s) => s.definirVolume);
  const idioma = useBattleStore((s) => s.idioma);
  const definirIdioma = useBattleStore((s) => s.definirIdioma);
  const t = useBattleStore((s) => s.t);

  useEffect(() => {
    document.documentElement.style.fontSize = `${BASE_ROOT_FONT_PX * uiScale}px`;
  }, [uiScale]);

  return (
    <div className="app-layout">
      {/* M21 4/N — fora do shell não renderiza nada; no shell, é o único lugar em que a
          atualização automática aparece para o jogador. */}
      <UpdateBanner />
      {/* M22 1/N — a tela que aparece quando o servidor recusa a versão de regras deste
          cliente. Bloqueia porque, depois do mismatch, nenhuma batalha vai ser aceita. */}
      <VersionGate />
      {/* M23 1/N — a introdução contextual: um cartão ao lado do que está sendo explicado,
          com a tela viva atrás. */}
      <IntroducaoOverlay />
      <header>
        <h1>{t('app.titulo')}</h1>
        <span className="campaign-progress">
          {/* M18 7/N — o capítulo em curso vem do TICKET, e não de um índice local: quem
              sabe em que ponto da campanha o jogador está é o servidor. */}
          {mode === 'pvp'
            ? t('app.modo.pvp')
            : mode === 'dungeon'
              ? t('app.modo.masmorra')
              : (campaignChapter ?? t('app.modo.escolhaCapitulo'))}
        </span>
        {/* §11 (acessibilidade) — os três itens: resultado instantâneo, modo daltônico e
            fonte escalável. Nenhum deles toca regra: são preferências de apresentação, e
            todas sobrevivem à recarga junto com o progresso. */}
        <label className="instant-result-toggle">
          <input type="checkbox" checked={instantResultMode} onChange={toggleInstantResultMode} />
          {t('app.pref.resultadoInstantaneo')}
        </label>
        <label className="accessibility-toggle">
          <input type="checkbox" checked={colorblindMode} onChange={toggleColorblindMode} />
          {t('app.pref.daltonico')}
        </label>
        <label className="ui-scale-select">
          {t('app.pref.tamanho')}
          <select value={uiScale} onChange={(event) => setUiScale(Number(event.target.value))}>
            {UI_SCALES.map((scale) => (
              <option key={scale} value={scale}>
                {Math.round(scale * 100)}%
              </option>
            ))}
          </select>
        </label>
        {/* §11 (M24) — os DOIS volumes, separados. Quem joga ouvindo podcast desliga a
            música e continua precisando ouvir o golpe: um controle só forçaria a escolha
            entre as duas coisas. Eles vivem aqui, junto das outras preferências de
            apresentação, porque é isso que eles são — e é onde o roadmap mandou pô-los. */}
        <label className="volume-control">
          {t('app.pref.efeitos')}
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={volumeEfeitos}
            onChange={(event) => definirVolume('efeitos', Number(event.target.value))}
          />
        </label>
        <label className="volume-control">
          {t('app.pref.musica')}
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={volumeMusica}
            onChange={(event) => definirVolume('musica', Number(event.target.value))}
          />
        </label>
        {/* §11/D24 (M25) — o seletor de idioma. Cada língua aparece escrita NELA MESMA: quem
            procura português numa tela em japonês procura "Português", não a palavra japonesa
            para português. */}
        <label className="language-select">
          {t('app.pref.idioma')}
          <select value={idioma} onChange={(event) => definirIdioma(event.target.value as typeof idioma)}>
            {IDIOMAS.map((codigo) => (
              <option key={codigo} value={codigo}>
                {t(`idioma.${codigo}`)}
              </option>
            ))}
          </select>
        </label>
        {/* M13, 3/N — o progresso é salvo sozinho; este é o único jeito de desfazê-lo sem
            abrir o console do navegador. */}
        <button type="button" className="clear-progress" onClick={clearProgress}>
          {t('app.pref.apagarProgresso')}
        </button>
      </header>
      <main>
        <MapCanvas />
        <div className="side-panels">
          <CampaignPanel />
          <ObjectivePanel />
          <PvpPanel />
          <DungeonPanel />
          <SummonPanel />
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
