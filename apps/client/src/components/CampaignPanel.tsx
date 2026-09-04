import { useBattleStore } from '../store/battleStore.js';

// §10/§9.4/D16 (M18, sub-sessão 7/N) — a tela da CAMPANHA, agora jogada contra o servidor.
//
// Ela substitui um fluxo que não tinha tela nenhuma: até aqui o cliente abria já dentro do
// capítulo salvo e avançava sozinho ao vencer. Com o servidor autoritativo sobre progressão
// (4/N), o jogador escolhe o capítulo, escolhe quem preenche as VAGAS que ele declara, e
// joga o que o ticket devolveu.
//
// Nada aqui decide (regra 3): a lista de capítulos, o que já foi limpo, quantas vagas cada
// um tem e quanto a primeira vitória paga vêm todos do servidor.
export function CampaignPanel() {
  const campaign = useBattleStore((s) => s.campaign);
  const pvp = useBattleStore((s) => s.pvp);
  const mode = useBattleStore((s) => s.mode);
  const refreshCampaign = useBattleStore((s) => s.refreshCampaign);
  const selectChapter = useBattleStore((s) => s.selectChapter);
  const toggleCampaignHero = useBattleStore((s) => s.toggleCampaignHero);
  const enterChapter = useBattleStore((s) => s.enterChapter);
  const exitCampaign = useBattleStore((s) => s.exitCampaign);

  if (!pvp.me) {
    return (
      <section className="campaign-panel">
        <h2>Campanha</h2>
        <p className="hint">Conecte-se no painel de PvP com o seu token para jogar a campanha.</p>
      </section>
    );
  }

  // Com um ticket aberto, a batalha está na tela: o painel sai da frente e deixa só a saída.
  if (campaign.ticket && mode === 'campaign') {
    return (
      <section className="campaign-panel">
        <h2>Campanha</h2>
        <p className="campaign-em-curso">
          Jogando <strong>{campaign.ticket.chapterId}</strong>
        </p>
        <button type="button" onClick={exitCampaign} disabled={campaign.busy}>
          Abandonar capítulo
        </button>
        {campaign.error ? <p className="error">{campaign.error}</p> : null}
      </section>
    );
  }

  const selecionado = campaign.chapters.find((c) => c.id === campaign.selectedChapterId) ?? null;

  return (
    <section className="campaign-panel">
      <h2>Campanha</h2>

      <div className="pve-actions">
        <button type="button" onClick={() => void refreshCampaign()} disabled={campaign.busy}>
          Atualizar
        </button>
      </div>

      {campaign.premiumOnFirstClear > 0 ? (
        <p className="hint">
          Primeira vitória em cada capítulo paga <strong>{campaign.premiumOnFirstClear}</strong> de moeda premium.
        </p>
      ) : null}

      <ul className="campaign-chapters">
        {campaign.chapters.map((chapter) => (
          <li key={chapter.id} className={chapter.id === campaign.selectedChapterId ? 'selected' : ''}>
            <button type="button" className="campaign-chapter-name" onClick={() => selectChapter(chapter.id)}>
              {chapter.name}
            </button>
            <span className="pve-locked">
              {chapter.slots} vaga(s){chapter.cleared ? ' · limpo' : ''}
            </span>
          </li>
        ))}
      </ul>

      {selecionado ? (
        <>
          {/* D16 — o capítulo declara VAGAS e o jogador leva quem tem. É por isso que esta
              lista é o ROSTER dele e não um elenco fixo: o que ele possui é a party. */}
          <h3>
            Quem vai ({campaign.selectedHeroIds.length}/{selecionado.slots})
          </h3>
          <ul className="campaign-roster">
            {pvp.roster.map((entry) => (
              <li key={entry.hero.id}>
                <label>
                  <input
                    type="checkbox"
                    checked={campaign.selectedHeroIds.includes(entry.hero.id)}
                    onChange={() => toggleCampaignHero(entry.hero.id)}
                  />
                  {entry.hero.id} <span className="pve-locked">({entry.hero.classId})</span>
                </label>
              </li>
            ))}
          </ul>

          <button
            type="button"
            onClick={() => void enterChapter(selecionado.id)}
            disabled={campaign.busy || campaign.selectedHeroIds.length === 0}
          >
            Entrar no capítulo
          </button>
        </>
      ) : (
        <p className="hint">Escolha um capítulo.</p>
      )}

      {campaign.status ? <p className="pve-status">{campaign.status}</p> : null}
      {campaign.error ? <p className="error">{campaign.error}</p> : null}
    </section>
  );
}
