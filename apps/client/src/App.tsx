import { CampaignTransitionOverlay } from './components/CampaignTransitionOverlay.js';
import { DuelPreviewPanel } from './components/DuelPreviewPanel.js';
import { DungeonPanel } from './components/DungeonPanel.js';
import { EntradaPanel } from './components/EntradaPanel.js';
import { InitiativePanel } from './components/InitiativePanel.js';
import { IntroducaoOverlay } from './components/IntroducaoOverlay.js';
import { InventoryPanel } from './components/InventoryPanel.js';
import { MapCanvas } from './components/MapCanvas.js';
import { DuelScene } from './components/DuelScene.js';
import { ObjectivePanel } from './components/ObjectivePanel.js';
import { OpcoesMenu } from './components/OpcoesMenu.js';
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
import { telaDoJogo } from './logic/tela.js';
import { nomeDeConteudo } from './i18n/conteudo.js';
import { missaoPorId, useBattleStore } from './store/battleStore.js';

// Tamanho de fonte raiz em escala 1. Todo o CSS do cliente está em `rem`, então mudar esta
// raiz escala texto, espaçamento e painéis de uma vez (§11 — "fonte escalável"); o mapa
// escala em paralelo, dentro do `MapCanvas`.
const BASE_ROOT_FONT_PX = 16;

export function App() {
  // M32 — o NOME da missão em curso, e não o id do ticket: o cabeçalho dizia
  // `encounter-campanha-ponte-1` enquanto o painel ao lado dizia "Jogando A Trilha".
  const missaoEmCurso = useBattleStore((s) => {
    const id = s.campaign.ticket?.chapterId;
    return id ? nomeDeConteudo(s.t, 'missao', id, missaoPorId(s.campaign.chapters, id)?.name ?? id) : null;
  });
  const mode = useBattleStore((s) => s.mode);
  const uiScale = useBattleStore((s) => s.uiScale);
  const abrirOpcoes = useBattleStore((s) => s.abrirOpcoes);
  const t = useBattleStore((s) => s.t);
  // M32 — QUAL tela: entrada, hub ou batalha. A regra é de `logic/tela.ts`, e é testada lá;
  // aqui só se escolhe o que desenhar.
  const tela = useBattleStore((s) => telaDoJogo(s));

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
      {/* M32 — as preferências e "apagar progresso" saíram daqui para o menu de opções. O
          cabeçalho fica com o que diz ONDE o jogador está, e um botão para o menu. */}
      <header>
        <h1>{t('app.titulo')}</h1>
        {tela === 'entrada' ? null : (
          <span className="campaign-progress">
            {/* M18 7/N — o capítulo em curso vem do TICKET, e não de um índice local: quem
                sabe em que ponto da campanha o jogador está é o servidor. */}
            {mode === 'pvp'
              ? t('app.modo.pvp')
              : mode === 'dungeon'
                ? t('app.modo.masmorra')
                : (missaoEmCurso ?? t('app.modo.escolhaCapitulo'))}
          </span>
        )}
        <button type="button" className="abrir-opcoes" onClick={abrirOpcoes}>
          {t('app.opcoes')}
        </button>
      </header>
      <OpcoesMenu />
      {tela === 'entrada' ? (
        // Sem sessão, a única coisa na tela é entrar: nenhum tabuleiro, nenhum painel.
        <main className="main-entrada">
          <EntradaPanel />
        </main>
      ) : tela === 'hub' ? (
        // Com sessão e sem batalha: o que se pode fazer, sem grid vazio ao lado. A campanha
        // vem primeiro porque é a próxima ação de quem chega.
        <main className="main-hub">
          <div className="hub-panels">
            <CampaignPanel />
            <DungeonPanel />
            <SummonPanel />
            <PvpPanel />
          </div>
        </main>
      ) : (
        <main>
          <MapCanvas />
          <DuelScene />
          <div className="side-panels">
            {/* O painel do modo em curso é o que tem a saída da batalha. */}
            {mode === 'campaign' ? <CampaignPanel /> : mode === 'dungeon' ? <DungeonPanel /> : <PvpPanel />}
            <ObjectivePanel />
            <InitiativePanel />
            <ResourcePanel />
            <UnitActionBar />
          </div>
        </main>
      )}
      <DuelPreviewPanel />
      <TacticsEditor />
      <InventoryPanel />
      <TalentTreePanel />
      <ReplayPanel />
      <CampaignTransitionOverlay />
    </div>
  );
}
