import { CampaignTransitionOverlay } from './components/CampaignTransitionOverlay.js';
import { DuelPreviewPanel } from './components/DuelPreviewPanel.js';
import { DungeonPanel } from './components/DungeonPanel.js';
import { EntradaPanel } from './components/EntradaPanel.js';
import { InitiativePanel } from './components/InitiativePanel.js';
import { IntroducaoOverlay } from './components/IntroducaoOverlay.js';
import { InventoryPanel } from './components/InventoryPanel.js';
import { MapCanvas } from './components/MapCanvas.js';
import { LobbyPanel } from './components/LobbyPanel.js';
import { CabecalhoDaTela } from './components/CabecalhoDaTela.js';
import { TransicaoOverlay } from './components/TransicaoOverlay.js';
import { DuelScene } from './components/DuelScene.js';
import { ObjectivePanel } from './components/ObjectivePanel.js';
import { OpcoesMenu } from './components/OpcoesMenu.js';
import { PersonagensPanel } from './components/PersonagensPanel.js';
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
import { PAINEIS_DA_BATALHA } from './logic/ordemDaBatalha.js';
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
  const abaDoHub = useBattleStore((s) => s.abaDoHub);
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
      <TransicaoOverlay />
      {tela === 'entrada' ? (
        // Sem sessão, a única coisa na tela é entrar: nenhum tabuleiro, nenhum painel.
        <main className="main-entrada">
          <EntradaPanel />
        </main>
      ) : tela === 'hub' ? (
        // M35 1/N (D41) — com sessão e sem batalha: UMA tela por vez. M35 5/N — o hub é um LOBBY
        // com botões (julgamento do usuário): quem entra cai nele, cada botão leva a uma tela por
        // uma transição, e cada tela tem "voltar". A tela é estado da store (`abaDoHub`); aqui
        // só se escolhe o que desenhar.
        <main className="main-hub">
          {abaDoHub === 'lobby' ? (
            <LobbyPanel />
          ) : (
            <div className="aba-do-hub">
              <CabecalhoDaTela tela={abaDoHub} />
              {abaDoHub === 'campanha' ? (
                <CampaignPanel />
              ) : abaDoHub === 'masmorras' ? (
                <DungeonPanel />
              ) : abaDoHub === 'arena' ? (
                <PvpPanel />
              ) : abaDoHub === 'personagens' ? (
                <PersonagensPanel />
              ) : (
                <SummonPanel />
              )}
            </div>
          )}
        </main>
      ) : (
        <main>
          <MapCanvas />
          <DuelScene />
          <div className="side-panels">
            {/* M35 4/N (D44) — a ordem vem de `PAINEIS_DA_BATALHA`: decisão e previsão perto do
                tabuleiro, administração (o painel do modo, com a saída da batalha) por último. */}
            {PAINEIS_DA_BATALHA.map(({ painel }) =>
              painel === 'unidade' ? (
                <UnitActionBar key={painel} />
              ) : painel === 'iniciativa' ? (
                <InitiativePanel key={painel} />
              ) : painel === 'recursos' ? (
                <ResourcePanel key={painel} />
              ) : painel === 'objetivo' ? (
                <ObjectivePanel key={painel} />
              ) : mode === 'campaign' ? (
                <CampaignPanel key={painel} />
              ) : mode === 'dungeon' ? (
                <DungeonPanel key={painel} />
              ) : (
                <PvpPanel key={painel} />
              ),
            )}
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
