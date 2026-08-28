import { campaignMaps } from '../data/campaign.js';
import { useBattleStore } from '../store/battleStore.js';

// §09-roadmap.md (M6) — "campanha de 3 mapas jogável ponta a ponta". Cobre os 3 estados
// de fim de mapa: vitória (avança), derrota (tenta de novo) e campanha concluída
// (venceu o último mapa).
export function CampaignTransitionOverlay() {
  const battleState = useBattleStore((s) => s.battleState);
  const campaignMapIndex = useBattleStore((s) => s.campaignMapIndex);
  const campaignComplete = useBattleStore((s) => s.campaignComplete);
  const advanceToNextMap = useBattleStore((s) => s.advanceToNextMap);
  const retryCurrentMap = useBattleStore((s) => s.retryCurrentMap);
  // §11 — a tela de replay abre a partir do fim do mapa, que é quando a gravação está
  // completa. Avançar ou reiniciar zera o log, então é aqui ou nunca.
  const openReplayViewer = useBattleStore((s) => s.openReplayViewer);
  const mode = useBattleStore((s) => s.mode);
  const clearProgress = useBattleStore((s) => s.clearProgress);
  // M16 3/N — o desfecho espera o tabuleiro terminar de contar o que aconteceu. O estado é
  // commitado no primeiro quadro da animação (é dele que a animação sai), então sem esta espera
  // o "Vitória!" cobria exatamente o golpe que venceu a batalha.
  const boardAnimating = useBattleStore((s) => s.boardAnimating);

  if (campaignComplete) {
    return (
      <div className="campaign-overlay">
        <div className="campaign-overlay-panel">
          <h2>Campanha concluída!</h2>
          <p>Você venceu os {campaignMaps.length} mapas da campanha.</p>
          {/* M13, 3/N — com o progresso salvo, esta tela passou a voltar a cada recarga:
              antes da persistência, recarregar era o que recomeçava a campanha. O overlay
              cobre o cabeçalho inteiro (`inset: 0`), então o botão de apagar progresso de
              lá não é alcançável daqui — a saída tem que estar neste painel. */}
          <button type="button" onClick={clearProgress}>
            Recomeçar a campanha
          </button>
        </div>
      </div>
    );
  }

  // Só a CAMPANHA tem capítulo para avançar. Em PvP e em masmorra quem decide o desfecho é
  // o servidor, e o fluxo está no painel correspondente — em M14 5/N este overlay chegou a
  // aparecer por cima de uma masmorra vencida, oferecendo "avançar para o próximo mapa" e
  // interceptando os cliques da própria tela de farm.
  if (mode !== 'campaign') return null;
  if (battleState.outcome === 'ongoing') return null;
  if (boardAnimating) return null;

  const isLastMap = campaignMapIndex === campaignMaps.length - 1;

  return (
    <div className="campaign-overlay">
      <div className="campaign-overlay-panel">
        {battleState.outcome === 'victory' ? (
          <>
            <h2>Vitória!</h2>
            <p>
              Mapa {campaignMapIndex + 1} de {campaignMaps.length} concluído.
            </p>
            <button type="button" onClick={advanceToNextMap}>
              {isLastMap ? 'Finalizar campanha' : 'Avançar para o próximo mapa'}
            </button>
            <button type="button" onClick={openReplayViewer}>
              Rever batalha
            </button>
          </>
        ) : (
          <>
            <h2>Derrota</h2>
            <p>Sua unidade foi eliminada.</p>
            <button type="button" onClick={openReplayViewer}>
              Rever batalha
            </button>
            <button type="button" onClick={retryCurrentMap}>
              Tentar novamente
            </button>
          </>
        )}
      </div>
    </div>
  );
}
