import { catalog } from '../data/catalog.js';
import { arteDeDuelo } from '../data/unitArt.js';
import { nomeDeConteudo } from '../i18n/conteudo.js';
import { descreverObjetivo } from '../logic/objetivo.js';
import { nomeDeUnidade, rotuloDeHeroi } from '../logic/rotulos.js';
import { useBattleStore } from '../store/battleStore.js';
import { PresetsDeParty } from './PresetsDeParty.js';
import { PreviaDoMapa } from './PreviaDoMapa.js';
import { Botao, Painel } from './ui.js';

// M35 8/N — A PREPARAÇÃO, tela própria. Antes ela era um apêndice da lista de missões (a prévia,
// os oito presets abertos e uma lista de checkboxes empilhados embaixo dos capítulos).
//
// Três blocos: a PRÉVIA (o tabuleiro redigido que o servidor mandou, com objetivo e inimigos),
// QUEM VAI (retratos clicáveis; o número no retrato é a vaga que o herói ocupa) e o rodapé com
// os presets compactos e "Iniciar missão". Quem valida a party continua sendo o servidor (regra 3).

interface MissaoDaPreparacao {
  readonly id: string;
  readonly name: string;
  readonly slots: number;
  readonly cleared: boolean;
}

export function PreparacaoDaMissao({ missao }: { readonly missao: MissaoDaPreparacao }) {
  const t = useBattleStore((s) => s.t);
  const campaign = useBattleStore((s) => s.campaign);
  const roster = useBattleStore((s) => s.pvp.roster);
  const toggleCampaignHero = useBattleStore((s) => s.toggleCampaignHero);
  const enterChapter = useBattleStore((s) => s.enterChapter);
  const voltarParaMissoes = useBattleStore((s) => s.voltarParaMissoes);

  // M36 3/N (D48) — a prévia vem do servidor e chega depois da escolha.
  const previa = campaign.previa?.missionId === missao.id ? campaign.previa : null;
  const inimigos = (previa?.unidades ?? []).filter((u) => u.side === 'enemy');
  const nome = nomeDeConteudo(t, 'missao', missao.id, missao.name);
  const escolhidos = campaign.selectedHeroIds;

  return (
    <section className="preparacao">
      <div className="preparacao-topo">
        <Botao className="voltar" onClick={voltarParaMissoes}>
          {t('preparacao.voltar')}
        </Botao>
        <h2 className="preparacao-titulo">{nome}</h2>
        {missao.cleared ? <span className="preparacao-selo">{t('campanha.estado.limpa')}</span> : null}
      </div>

      <div className="preparacao-corpo">
        <Painel titulo={t('preparacao.campo')} className="preparacao-previa">
          {previa ? <PreviaDoMapa previa={previa} /> : <p className="hint">{t('preparacao.carregando')}</p>}
        </Painel>

        <div className="preparacao-lado">
          <Painel titulo={t('preparacao.objetivo')}>
            {previa ? (
              <>
                <p className="previa-objetivo">
                  {descreverObjetivo(t, previa.winCondition, { units: previa.unidades, round: 1 }).titulo}
                </p>
                <p className="hint">{t('previa.vagas', { vagas: previa.vagas.length })}</p>
              </>
            ) : null}
          </Painel>
          <Painel titulo={t('previa.inimigos', { total: inimigos.length })}>
            <ul className="previa-inimigos">
              {inimigos.map((inimigo) => (
                <li key={inimigo.unitId}>{nomeDeUnidade(t, inimigo.unitId, {}, previa!.characterIdByUnitId, catalog)}</li>
              ))}
            </ul>
          </Painel>
        </div>
      </div>

      <Painel titulo={t('campanha.quemVai', { escolhidos: escolhidos.length, vagas: missao.slots })} className="preparacao-quem-vai">
        <p className="hint">{t('preparacao.dicaRetratos')}</p>
        <ul className="retratos">
          {roster.map((entry) => {
            const vaga = escolhidos.indexOf(entry.hero.id);
            const rotulo = rotuloDeHeroi(t, entry.hero, catalog);
            const arte = arteDeDuelo(entry.hero.characterId, 'sudeste');
            return (
              <li key={entry.hero.id}>
                <button
                  type="button"
                  className={vaga >= 0 ? 'retrato escolhido' : 'retrato'}
                  aria-pressed={vaga >= 0}
                  onClick={() => toggleCampaignHero(entry.hero.id)}
                >
                  {vaga >= 0 ? <span className="retrato-vaga">{vaga + 1}</span> : null}
                  <span className="retrato-imagem">{arte ? <img src={arte} alt="" /> : null}</span>
                  <span className="retrato-nome">{rotulo.nome}</span>
                  <span className="retrato-classe">{rotulo.classe}</span>
                </button>
              </li>
            );
          })}
        </ul>
        <div className="preparacao-rodape">
          <PresetsDeParty />
          <Botao
            variante="primario"
            className="preparacao-iniciar"
            onClick={() => void enterChapter(missao.id)}
            disabled={campaign.busy || escolhidos.length === 0}
          >
            {t('campanha.entrar')}
          </Botao>
        </div>
        {campaign.error ? <p className="error">{campaign.error}</p> : null}
      </Painel>
    </section>
  );
}
