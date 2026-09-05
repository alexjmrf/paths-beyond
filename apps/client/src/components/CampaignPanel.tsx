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
  const t = useBattleStore((s) => s.t);
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
        <h2>{t('campanha.titulo')}</h2>
        <p className="hint">{t('campanha.conecte')}</p>
      </section>
    );
  }

  // Com um ticket aberto, a batalha está na tela: o painel sai da frente e deixa só a saída.
  if (campaign.ticket && mode === 'campaign') {
    return (
      <section className="campaign-panel">
        <h2>{t('campanha.titulo')}</h2>
        <p className="campaign-em-curso">{t('campanha.jogando', { capitulo: campaign.ticket.chapterId })}</p>
        <button type="button" onClick={exitCampaign} disabled={campaign.busy}>
          {t('campanha.abandonar')}
        </button>
        {campaign.error ? <p className="error">{campaign.error}</p> : null}
      </section>
    );
  }

  const selecionado = campaign.chapters.find((c) => c.id === campaign.selectedChapterId) ?? null;

  return (
    <section className="campaign-panel">
      <h2>{t('campanha.titulo')}</h2>

      <div className="pve-actions">
        <button type="button" onClick={() => void refreshCampaign()} disabled={campaign.busy}>
          {t('campanha.atualizar')}
        </button>
      </div>

      {campaign.premiumOnFirstClear > 0 ? (
        <p className="hint">{t('campanha.primeiraVitoria', { premium: campaign.premiumOnFirstClear })}</p>
      ) : null}

      <ul className="campaign-chapters">
        {campaign.chapters.map((chapter) => (
          <li key={chapter.id} className={chapter.id === campaign.selectedChapterId ? 'selected' : ''}>
            <button type="button" className="campaign-chapter-name" onClick={() => selectChapter(chapter.id)}>
              {chapter.name}
            </button>
            <span className="pve-locked">
              {t('campanha.vagas', { vagas: chapter.slots })}
              {chapter.cleared ? t('campanha.limpo') : ''}
            </span>
          </li>
        ))}
      </ul>

      {selecionado ? (
        <>
          {/* D16 — o capítulo declara VAGAS e o jogador leva quem tem. É por isso que esta
              lista é o ROSTER dele e não um elenco fixo: o que ele possui é a party. */}
          <h3>{t('campanha.quemVai', { escolhidos: campaign.selectedHeroIds.length, vagas: selecionado.slots })}</h3>
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
            {t('campanha.entrar')}
          </button>
        </>
      ) : (
        <p className="hint">{t('campanha.escolha')}</p>
      )}

      {campaign.status ? <p className="pve-status">{campaign.status}</p> : null}
      {campaign.error ? <p className="error">{campaign.error}</p> : null}
    </section>
  );
}
