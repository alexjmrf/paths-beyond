import { catalog } from '../data/catalog.js';
import { nomeDeConteudo } from '../i18n/conteudo.js';
import { conclusaoDaPartida, type LinhaDeLoot } from '../logic/conclusao.js';
import { useBattleStore } from '../store/battleStore.js';
import type { Tradutor } from '../i18n/idioma.js';
import { Botao, Modal, Painel } from './ui.js';

// M35 9/N — A TELA DE CONCLUSÃO (pedido do usuário): resultado, loot, e voltar ao menu ou
// continuar para a próxima missão. Substitui o `CampaignTransitionOverlay`, que dependia do
// `ticket` morto no M36 e por isso não aparecia mais. Vale para os três modos.
//
// O conteúdo é `logic/conclusao.ts`, sobre a `liquidacao` que o servidor mandou no comando que
// fechou a batalha. Nada aqui decide desfecho nem loot (regra 3).

function textoDoLoot(t: Tradutor, linha: LinhaDeLoot): string {
  switch (linha.tipo) {
    case 'material':
      return t('conclusao.loot.material', {
        valor: linha.valor,
        nome: nomeDeConteudo(t, 'material', linha.id, catalog.materials[linha.id]?.name ?? linha.id),
      });
    case 'item':
      return t('conclusao.loot.item');
    default:
      return t(`conclusao.loot.${linha.tipo}`, { valor: linha.valor });
  }
}

export function ConclusaoDaMissao() {
  const t = useBattleStore((s) => s.t);
  const mode = useBattleStore((s) => s.mode);
  const partida = useBattleStore((s) => s.partida);
  const battleState = useBattleStore((s) => s.battleState);
  const liquidacao = useBattleStore((s) => s.liquidacao);
  const chapters = useBattleStore((s) => s.campaign.chapters);
  const busy = useBattleStore((s) => s.campaign.busy);
  // O desfecho espera o tabuleiro e a cena de duelo terminarem de contar o golpe final (M16 3/N,
  // M26 2/N): a tela não pode cobrir o golpe que venceu.
  const boardAnimating = useBattleStore((s) => s.boardAnimating);
  const duelScene = useBattleStore((s) => s.duelScene);
  const continuarParaProxima = useBattleStore((s) => s.continuarParaProxima);
  const voltarAoMenu = useBattleStore((s) => s.voltarAoMenu);
  const recomecarMissao = useBattleStore((s) => s.recomecarMissao);
  const openReplayViewer = useBattleStore((s) => s.openReplayViewer);

  if (!partida || boardAnimating || duelScene) return null;
  const conclusao = conclusaoDaPartida({
    modo: mode,
    outcome: battleState.outcome,
    rounds: battleState.round,
    liquidacao,
    refId: partida.refId,
    capitulos: chapters,
  });
  if (!conclusao) return null;

  const nomeDaMissao =
    mode === 'campaign'
      ? nomeDeConteudo(t, 'missao', partida.refId, chapters.flatMap((c) => c.missions).find((m) => m.id === partida.refId)?.name ?? partida.refId)
      : null;

  return (
    <Modal aberto>
      <Painel className={conclusao.venceu ? 'conclusao conclusao-vitoria' : 'conclusao conclusao-derrota'}>
        <p className="conclusao-selo" aria-hidden="true">
          {conclusao.venceu ? '⚔︎' : '✝︎'}
        </p>
        <h2 className="conclusao-titulo">{conclusao.venceu ? t('conclusao.vitoria') : t('conclusao.derrota')}</h2>
        {nomeDaMissao ? <p className="conclusao-missao">{nomeDaMissao}</p> : null}
        <p className="hint">{t('conclusao.rounds', { rounds: conclusao.rounds })}</p>

        <h3 className="conclusao-loot-titulo">{t('conclusao.loot.titulo')}</h3>
        {conclusao.loot.length > 0 ? (
          <ul className="conclusao-loot">
            {conclusao.loot.map((linha, i) => (
              <li key={i}>{textoDoLoot(t, linha)}</li>
            ))}
          </ul>
        ) : (
          <p className="hint">{t('conclusao.semLoot')}</p>
        )}

        <div className="conclusao-acoes">
          {conclusao.acoes.includes('proxima') && conclusao.proximaMissaoId ? (
            <Botao variante="primario" disabled={busy} onClick={() => void continuarParaProxima(conclusao.proximaMissaoId!)}>
              {t('conclusao.proxima')}
            </Botao>
          ) : null}
          {conclusao.acoes.includes('repetir') ? (
            <Botao variante="primario" disabled={busy} onClick={() => void recomecarMissao()}>
              {t('conclusao.repetir')}
            </Botao>
          ) : null}
          <Botao disabled={busy} onClick={() => void voltarAoMenu()}>
            {t('conclusao.menu')}
          </Botao>
          <Botao className="conclusao-rever" onClick={() => void openReplayViewer()}>
            {t('conclusao.rever')}
          </Botao>
        </div>
      </Painel>
    </Modal>
  );
}
