import { campaignMaps } from '../data/campaign/index.js';
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

  if (campaignComplete) {
    return (
      <div className="campaign-overlay">
        <div className="campaign-overlay-panel">
          <h2>Campanha concluída!</h2>
          <p>Você venceu os {campaignMaps.length} mapas de demonstração.</p>
        </div>
      </div>
    );
  }

  if (battleState.outcome === 'ongoing') return null;

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
          </>
        ) : (
          <>
            <h2>Derrota</h2>
            <p>Sua unidade foi eliminada.</p>
            <button type="button" onClick={retryCurrentMap}>
              Tentar novamente
            </button>
          </>
        )}
      </div>
    </div>
  );
}
