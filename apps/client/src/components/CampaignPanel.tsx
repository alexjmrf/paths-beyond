import { catalog } from '../data/catalog.js';
import { nomeDeUnidade, rotuloDeHeroi } from '../logic/rotulos.js';
import { descreverObjetivo } from '../logic/objetivo.js';
import { previaDaMissao } from '../logic/previaDaMissao.js';
import { PreviaDoMapa } from './PreviaDoMapa.js';
import { missaoPorId, proximaMissao, useBattleStore } from '../store/battleStore.js';
import { nomeDeConteudo } from '../i18n/conteudo.js';

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
  const selectChapter = useBattleStore((s) => s.selectChapter);
  const toggleChapterOpen = useBattleStore((s) => s.toggleChapterOpen);
  const toggleCampaignHero = useBattleStore((s) => s.toggleCampaignHero);
  const enterChapter = useBattleStore((s) => s.enterChapter);
  const exitCampaign = useBattleStore((s) => s.exitCampaign);

  // Com um ticket aberto, a batalha está na tela: o painel sai da frente e deixa só a saída.
  if (campaign.ticket && mode === 'campaign') {
    return (
      <section className="campaign-panel">
        <h2>{t('campanha.titulo')}</h2>
        {/* M29 — o NOME da missão, traduzido, no lugar do id cru. `chapterId` é o campo do
            ticket e continua guardando a missão (o servidor não renomeou nada); o que mudou é
            que o jogador via `encounter-campanha-barbaca` escrito na tela. */}
        <p className="campaign-em-curso">
          {t('campanha.jogando', {
            missao: nomeDeConteudo(
              t,
              'missao',
              campaign.ticket.chapterId,
              missaoPorId(campaign.chapters, campaign.ticket.chapterId)?.name ?? campaign.ticket.chapterId,
            ),
          })}
        </p>
        <button type="button" onClick={exitCampaign} disabled={campaign.busy}>
          {t('campanha.abandonar')}
        </button>
        {campaign.error ? <p className="error">{campaign.error}</p> : null}
      </section>
    );
  }

  // M27 — o que se seleciona é uma MISSÃO. `missaoPorId` varre as duas camadas num lugar
  // só; procurar aqui de novo seria uma segunda resposta para a mesma pergunta.
  const selecionado = missaoPorId(campaign.chapters, campaign.selectedMissionId) ?? null;
  // M32 — UMA próxima ação com peso maior que o resto. Com missão escolhida é o botão de
  // entrar; sem escolha, é a primeira missão por limpar (onde o jogador parou). Nunca as duas.
  const proxima = selecionado ? null : proximaMissao(campaign.chapters);
  const previa = selecionado ? previaDaMissao(catalog, selecionado.id) : null;

  return (
    <section className="campaign-panel">
      <h2>{t('campanha.titulo')}</h2>

      {/* M29 — D31 tem DUAS regras e a tela anunciava uma, com a palavra errada: dizia
          "capítulo" onde a 1/N do M27 pôs missão, e ignorava `premiumOnChapterClear`, que o
          servidor já mandava e o store já guardava sem que nada o mostrasse. */}
      {campaign.premiumOnFirstClear > 0 ? (
        <p className="hint">
          {t('campanha.primeiraVitoria', {
            premium: campaign.premiumOnFirstClear,
            capitulo: campaign.premiumOnChapterClear,
          })}
        </p>
      ) : null}

      {/* M27 (D23) — DUAS camadas, e o capítulo RECOLHE (3/N). A 1/N o deixou como
          cabeçalho não-clicável porque um capítulo não é jogável — continua não sendo, e o
          clique agora abre e fecha, que é a única coisa que um agrupamento pode fazer. Com
          trinta missões a lista inteira aberta é uma rolagem em que "onde eu parei" some.

          O contador `n/10` fica no cabeçalho fechado de propósito: é o que responde essa
          pergunta sem abrir nada. Ele não tem palavra nenhuma — nem ele nem as setas — e é
          por isso que esta fatia não acrescentou chave de idioma. */}
      <ul className="campaign-chapters">
        {campaign.chapters.map((chapter) => {
          const aberto = campaign.openChapterIds.includes(chapter.id);
          const limpas = chapter.missions.filter((mission) => mission.cleared).length;
          return (
            <li key={chapter.id} className="campaign-chapter">
              <h3 className="campaign-chapter-name">
                <button
                  type="button"
                  className="campaign-chapter-toggle"
                  aria-expanded={aberto}
                  onClick={() => toggleChapterOpen(chapter.id)}
                >
                  {aberto ? '▼' : '▶'} {nomeDeConteudo(t, 'capitulo', chapter.id, chapter.name)}
                  {chapter.cleared ? t('campanha.limpo') : ` ${limpas}/${chapter.missions.length}`}
                </button>
              </h3>
              {aberto ? (
                <ul className="campaign-missions">
                  {chapter.missions.map((mission) => (
                    <li key={mission.id} className={mission.id === campaign.selectedMissionId ? 'selected' : ''}>
                      <button
                        type="button"
                        className={mission.id === proxima ? 'campaign-mission-name acao-principal' : 'campaign-mission-name'}
                        onClick={() => selectChapter(mission.id)}
                      >
                        {mission.order}. {nomeDeConteudo(t, 'missao', mission.id, mission.name)}
                      </button>
                      <span className="pve-locked">
                        {t('campanha.vagas', { vagas: mission.slots })}
                        {mission.cleared ? t('campanha.limpo') : ''}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : null}
            </li>
          );
        })}
      </ul>

      {selecionado ? (
        <>
          {/* M35 2/N (D42) — a PRÉVIA antes de escolher quem vai: o tabuleiro de verdade em
              miniatura, montado do catálogo (sem ticket), com o objetivo, os inimigos pelo nome
              e as vagas marcadas. §1.1 antes de entrar. */}
          {previa ? (
            <div className="previa-da-missao">
              <h3>{t('previa.titulo', { missao: nomeDeConteudo(t, 'missao', selecionado.id, selecionado.name) })}</h3>
              <div className="previa-corpo">
                <PreviaDoMapa previa={previa} />
                <div className="previa-ficha">
                  <p className="previa-objetivo">{descreverObjetivo(t, previa.setup.winCondition, { units: previa.setup.units, round: 1 }).titulo}</p>
                  <p className="hint">{t('previa.vagas', { vagas: previa.vagas.length })}</p>
                  <h4>{t('previa.inimigos', { total: previa.inimigos.length })}</h4>
                  <ul className="previa-inimigos">
                    {previa.inimigos.map((inimigo) => (
                      <li key={inimigo.unitId}>
                        {nomeDeUnidade(t, inimigo.unitId, {}, previa.artIdByUnitId, catalog)}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          ) : null}

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
                  {rotuloDeHeroi(t, entry.hero, catalog).nome}{' '}
                  <span className="pve-locked">({rotuloDeHeroi(t, entry.hero, catalog).classe})</span>
                </label>
              </li>
            ))}
          </ul>

          <button
            type="button"
            className="acao-principal"
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
