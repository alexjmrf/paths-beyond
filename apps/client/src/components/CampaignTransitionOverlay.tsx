import { useBattleStore } from '../store/battleStore.js';

// §10/§9.4 (M18, sub-sessão 7/N) — o fim de capítulo, agora com o servidor decidindo.
//
// Até aqui este overlay avançava o capítulo sozinho: o cliente via `outcome === 'victory'`,
// somava 1 ao índice e montava o mapa seguinte. Com a campanha passando pelo servidor, ele
// tem mais um passo, e é o passo que importa — **submeter**. O desfecho que vale é o que o
// servidor devolve depois de reexecutar os comandos, e é ele quem marca "capítulo limpo" e
// paga a moeda premium (D17/D20).
//
// Por isso a tela tem dois momentos: a batalha acabou no tabuleiro (submeter) e o servidor
// respondeu (o que ele pagou, e a volta para a lista).
export function CampaignTransitionOverlay() {
  const battleState = useBattleStore((s) => s.battleState);
  const t = useBattleStore((s) => s.t);
  const campaign = useBattleStore((s) => s.campaign);
  const submitCampaignRun = useBattleStore((s) => s.submitCampaignRun);
  const exitCampaign = useBattleStore((s) => s.exitCampaign);
  const enterChapter = useBattleStore((s) => s.enterChapter);
  // §11 — a tela de replay abre a partir do fim do mapa, que é quando a gravação está
  // completa. Sair ou reentrar zera o log, então é aqui ou nunca.
  const openReplayViewer = useBattleStore((s) => s.openReplayViewer);
  const mode = useBattleStore((s) => s.mode);
  // M16 3/N — o desfecho espera o tabuleiro terminar de contar o que aconteceu. O estado é
  // commitado no primeiro quadro da animação (é dele que a animação sai), então sem esta
  // espera o "Vitória!" cobria exatamente o golpe que venceu a batalha.
  const boardAnimating = useBattleStore((s) => s.boardAnimating);

  // Só a CAMPANHA tem capítulo a submeter. Em PvP e em masmorra o fluxo está no painel
  // correspondente — em M14 5/N este overlay chegou a aparecer por cima de uma masmorra
  // vencida, interceptando os cliques da própria tela de farm.
  if (mode !== 'campaign') return null;
  if (!campaign.ticket) return null;
  if (battleState.outcome === 'ongoing') return null;
  if (boardAnimating) return null;

  const venceu = battleState.outcome === 'victory';

  // O servidor já respondeu: o que está na tela agora é o veredito DELE, que é o único que
  // conta. Ele pode divergir do tabuleiro se o cliente tivesse jogado outra coisa — e é
  // justamente essa possibilidade que a submissão existe para fechar (§9.4).
  if (campaign.lastRun) {
    return (
      <div className="campaign-overlay">
        <div className="campaign-overlay-panel">
          <h2>
            {campaign.lastRun.outcome === 'victory' ? t('capituloFim.concluido') : t('capituloFim.derrota')}
          </h2>
          <p>
            {t('capituloFim.resolvido', { rounds: campaign.lastRun.roundsPlayed })}
            {campaign.lastRun.premiumAwarded > 0
              ? t('capituloFim.primeiraVez', { premium: campaign.lastRun.premiumAwarded })
              : ''}
          </p>
          <button type="button" onClick={openReplayViewer}>
            {t('capituloFim.reverBatalha')}
          </button>
          <button type="button" onClick={exitCampaign}>
            {t('capituloFim.voltar')}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="campaign-overlay">
      <div className="campaign-overlay-panel">
        <h2>{venceu ? t('capituloFim.vitoria') : t('capituloFim.derrota')}</h2>
        {/* Submeter não é opcional nem no caso da derrota: é a submissão que fecha o
            capítulo do lado do servidor, e sem ela nada foi jogado do ponto de vista da
            conta. */}
        <p>{venceu ? t('capituloFim.envieVitoria') : t('capituloFim.envieDerrota')}</p>
        <button type="button" onClick={() => void submitCampaignRun()} disabled={campaign.busy}>
          {t('capituloFim.enviar')}
        </button>
        <button type="button" onClick={openReplayViewer}>
          {t('capituloFim.reverBatalha')}
        </button>
        {!venceu ? (
          <button type="button" onClick={() => void enterChapter(campaign.ticket!.chapterId)} disabled={campaign.busy}>
            {t('capituloFim.tentarNovamente')}
          </button>
        ) : null}
        {campaign.error ? <p className="error">{campaign.error}</p> : null}
      </div>
    </div>
  );
}
