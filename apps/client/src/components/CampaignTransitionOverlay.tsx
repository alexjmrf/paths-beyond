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
          <h2>{campaign.lastRun.outcome === 'victory' ? 'Capítulo concluído!' : 'Derrota'}</h2>
          <p>
            O servidor resolveu em {campaign.lastRun.roundsPlayed} round(s).
            {campaign.lastRun.premiumAwarded > 0
              ? ` Primeira vez: +${campaign.lastRun.premiumAwarded} de moeda premium.`
              : ''}
          </p>
          <button type="button" onClick={openReplayViewer}>
            Rever batalha
          </button>
          <button type="button" onClick={exitCampaign}>
            Voltar aos capítulos
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="campaign-overlay">
      <div className="campaign-overlay-panel">
        <h2>{venceu ? 'Vitória!' : 'Derrota'}</h2>
        {/* Submeter não é opcional nem no caso da derrota: é a submissão que fecha o
            capítulo do lado do servidor, e sem ela nada foi jogado do ponto de vista da
            conta. */}
        <p>
          {venceu
            ? 'Envie os comandos para o servidor confirmar o capítulo.'
            : 'Envie o resultado ou volte para tentar de novo.'}
        </p>
        <button type="button" onClick={() => void submitCampaignRun()} disabled={campaign.busy}>
          Enviar ao servidor
        </button>
        <button type="button" onClick={openReplayViewer}>
          Rever batalha
        </button>
        {!venceu ? (
          <button type="button" onClick={() => void enterChapter(campaign.ticket!.chapterId)} disabled={campaign.busy}>
            Tentar novamente
          </button>
        ) : null}
        {campaign.error ? <p className="error">{campaign.error}</p> : null}
      </div>
    </div>
  );
}
