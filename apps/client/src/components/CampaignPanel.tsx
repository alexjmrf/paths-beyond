import { nomeDeConteudo } from '../i18n/conteudo.js';
import { capituloEmFoco, estadoDoCartao } from '../logic/campanha.js';
import { missaoPorId, proximaMissao, useBattleStore } from '../store/battleStore.js';
import { PreparacaoDaMissao } from './PreparacaoDaMissao.js';

// §10/§9.4/D16 (M18, sub-sessão 7/N) — a tela da CAMPANHA, jogada contra o servidor.
//
// M35 7/N — reescrita a pedido do usuário ("a opção de seleção de missões é horrível"): a lista
// de texto em sanfona virou ABAS de capítulo com um grid de CARTÕES de missão; escolher um
// cartão abre a PREPARAÇÃO (tela própria, `PreparacaoDaMissao`), e de lá "← Missões" volta.
// Este componente não aparece mais dentro da batalha (M35 9/N): a saída de lá é o menu de pausa.
//
// Nada aqui decide (regra 3): capítulos, o que já foi limpo, vagas e quanto a primeira vitória
// paga vêm do servidor. Qual aba está em foco e o estado de cada cartão são `logic/campanha.ts`.
export function CampaignPanel() {
  const campaign = useBattleStore((s) => s.campaign);
  const t = useBattleStore((s) => s.t);
  const selectChapter = useBattleStore((s) => s.selectChapter);
  const escolherCapitulo = useBattleStore((s) => s.escolherCapitulo);

  const selecionado = missaoPorId(campaign.chapters, campaign.selectedMissionId) ?? null;
  if (selecionado) return <PreparacaoDaMissao missao={selecionado} />;

  // M32 (D40) — UMA próxima ação com peso maior: a primeira missão por limpar.
  const proxima = proximaMissao(campaign.chapters);
  const focoId = capituloEmFoco(campaign.chapters, campaign.openChapterIds[0] ?? null, null);
  const capitulo = campaign.chapters.find((c) => c.id === focoId) ?? null;

  return (
    <section className="campaign-panel">
      <nav className="campanha-abas" role="tablist">
        {campaign.chapters.map((chapter) => {
          const limpas = chapter.missions.filter((m) => m.cleared).length;
          return (
            <button
              key={chapter.id}
              type="button"
              role="tab"
              aria-selected={chapter.id === focoId}
              className={chapter.id === focoId ? 'campanha-aba ativa' : 'campanha-aba'}
              onClick={() => escolherCapitulo(chapter.id)}
            >
              <span className="campanha-aba-nome">{nomeDeConteudo(t, 'capitulo', chapter.id, chapter.name)}</span>
              <span className="campanha-aba-progresso">
                {limpas}/{chapter.missions.length}
              </span>
            </button>
          );
        })}
      </nav>

      {campaign.premiumOnFirstClear > 0 ? (
        <p className="hint campanha-regra">
          {t('campanha.primeiraVitoria', { premium: campaign.premiumOnFirstClear, capitulo: campaign.premiumOnChapterClear })}
        </p>
      ) : null}

      {capitulo ? (
        <ul className="campanha-grid">
          {capitulo.missions.map((mission) => {
            const estado = estadoDoCartao(mission, proxima);
            return (
              <li key={mission.id}>
                <button
                  type="button"
                  className={`ui-cartao campanha-cartao estado-${estado}${estado === 'proxima' ? ' acao-principal' : ''}`}
                  onClick={() => selectChapter(mission.id)}
                >
                  <span className="campanha-cartao-numero">{mission.order}</span>
                  <span className="campanha-cartao-nome">{nomeDeConteudo(t, 'missao', mission.id, mission.name)}</span>
                  <span className="campanha-cartao-linha">{t('campanha.vagas', { vagas: mission.slots })}</span>
                  <span className="campanha-cartao-estado">
                    {estado === 'limpa'
                      ? t('campanha.estado.limpa')
                      : estado === 'proxima'
                        ? t('campanha.estado.proxima')
                        : campaign.premiumOnFirstClear > 0
                          ? t('campanha.estado.recompensa', { premium: campaign.premiumOnFirstClear })
                          : ''}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}

      {campaign.status ? <p className="pve-status">{campaign.status}</p> : null}
      {campaign.error ? <p className="error">{campaign.error}</p> : null}
    </section>
  );
}
