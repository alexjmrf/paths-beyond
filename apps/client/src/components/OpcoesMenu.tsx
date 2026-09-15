import { UI_SCALES } from '../data/overlayTheme.js';
import { IDIOMAS } from '../i18n/idioma.js';
import { rotuloDoCampo } from '../logic/telemetria.js';
import { useBattleStore } from '../store/battleStore.js';

// M32 — o MENU DE OPÇÕES: as preferências de apresentação e "apagar progresso", fora do
// cabeçalho.
//
// Elas estavam na barra do topo, ao lado do título, com o mesmo peso que a campanha: o
// primeiro print do instalador era um painel de desenvolvimento ("Battle scene on engage",
// "Instant result mode", "Erase progress" a um clique). Nada aqui mudou de função — são as
// mesmas sete preferências de §11/M24/M25, e o mesmo `clearProgress` do M13 3/N — só mudou
// de lugar e, no caso de apagar, ganhou a pergunta.
//
// A ação principal deste menu é FECHAR. Apagar progresso é a única ação da tela que não se
// desfaz, e é por isso que ela fica por último, atrás de uma pergunta, e nunca com o peso
// visual de próxima ação.
export function OpcoesMenu() {
  const aberto = useBattleStore((s) => s.opcoesAbertas);
  const t = useBattleStore((s) => s.t);
  const fecharOpcoes = useBattleStore((s) => s.fecharOpcoes);
  const instantResultMode = useBattleStore((s) => s.instantResultMode);
  const duelSceneEnabled = useBattleStore((s) => s.duelSceneEnabled);
  const setDuelSceneEnabled = useBattleStore((s) => s.setDuelSceneEnabled);
  const toggleInstantResultMode = useBattleStore((s) => s.toggleInstantResultMode);
  const colorblindMode = useBattleStore((s) => s.colorblindMode);
  const toggleColorblindMode = useBattleStore((s) => s.toggleColorblindMode);
  const uiScale = useBattleStore((s) => s.uiScale);
  const setUiScale = useBattleStore((s) => s.setUiScale);
  const volumeEfeitos = useBattleStore((s) => s.volumeEfeitos);
  const volumeMusica = useBattleStore((s) => s.volumeMusica);
  const definirVolume = useBattleStore((s) => s.definirVolume);
  const idioma = useBattleStore((s) => s.idioma);
  const definirIdioma = useBattleStore((s) => s.definirIdioma);
  const apagarPendente = useBattleStore((s) => s.apagarProgressoPendente);
  const pedirApagarProgresso = useBattleStore((s) => s.pedirApagarProgresso);
  const cancelarApagarProgresso = useBattleStore((s) => s.cancelarApagarProgresso);
  const confirmarApagarProgresso = useBattleStore((s) => s.confirmarApagarProgresso);
  const telemetria = useBattleStore((s) => s.telemetria);
  const definirTelemetria = useBattleStore((s) => s.definirTelemetria);
  const token = useBattleStore((s) => s.pvp.token);

  if (!aberto) return null;

  return (
    <div className="opcoes-backdrop" onClick={fecharOpcoes}>
      <section className="opcoes-menu" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <header className="opcoes-cabecalho">
          <h2>{t('app.opcoes.titulo')}</h2>
          <button type="button" className="acao-principal" onClick={fecharOpcoes}>
            {t('app.opcoes.fechar')}
          </button>
        </header>

        {/* §11/D24 (M25) — cada língua aparece escrita NELA MESMA. */}
        <label className="opcoes-linha">
          {t('app.pref.idioma')}
          <select value={idioma} onChange={(event) => definirIdioma(event.target.value as typeof idioma)}>
            {IDIOMAS.map((codigo) => (
              <option key={codigo} value={codigo}>
                {t(`idioma.${codigo}`)}
              </option>
            ))}
          </select>
        </label>

        {/* §11 (acessibilidade) — os três itens: resultado instantâneo, modo daltônico e fonte
            escalável, mais o nível do meio do M26 2/N (tabuleiro sem a cena). Nenhum toca
            regra: são preferências de apresentação, e sobrevivem à recarga junto do save. */}
        <h3>{t('app.opcoes.acessibilidade')}</h3>
        <label className="opcoes-linha">
          <input
            type="checkbox"
            checked={duelSceneEnabled}
            onChange={(e) => setDuelSceneEnabled(e.target.checked)}
          />
          {t('app.pref.animacaoDeBatalha')}
        </label>
        <label className="opcoes-linha">
          <input type="checkbox" checked={instantResultMode} onChange={toggleInstantResultMode} />
          {t('app.pref.resultadoInstantaneo')}
        </label>
        <label className="opcoes-linha">
          <input type="checkbox" checked={colorblindMode} onChange={toggleColorblindMode} />
          {t('app.pref.daltonico')}
        </label>
        <label className="opcoes-linha">
          {t('app.pref.tamanho')}
          <select value={uiScale} onChange={(event) => setUiScale(Number(event.target.value))}>
            {UI_SCALES.map((scale) => (
              <option key={scale} value={scale}>
                {Math.round(scale * 100)}%
              </option>
            ))}
          </select>
        </label>

        {/* §11 (M24) — os DOIS volumes, separados: quem joga ouvindo podcast desliga a música
            e continua precisando ouvir o golpe. */}
        <h3>{t('app.opcoes.som')}</h3>
        <label className="opcoes-linha">
          {t('app.pref.efeitos')}
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={volumeEfeitos}
            onChange={(event) => definirVolume('efeitos', Number(event.target.value))}
          />
        </label>
        <label className="opcoes-linha">
          {t('app.pref.musica')}
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={volumeMusica}
            onChange={(event) => definirVolume('musica', Number(event.target.value))}
          />
        </label>

        {/* M13 3/N — o progresso é salvo sozinho; este é o único jeito de desfazê-lo sem abrir
            o console. M32: em dois passos, porque é a única ação da tela que não se desfaz. */}
        {/* M34 2/N (D45) — a MEDIÇÃO: a declaração do que o servidor registra (a lista vem dele,
            travada contra as tabelas; a tela traduz) e o interruptor de recusar. Só com sessão:
            é estado de conta, e sem conta não há o que medir nem o que recusar. */}
        {token ? (
          <>
            <h3>{t('app.opcoes.telemetria')}</h3>
            <p className="telemetria-declaracao">{t('app.pref.telemetriaDeclaracao')}</p>
            {telemetria.optOut === null ? (
              <p className="error">{telemetria.error ?? t('app.pref.telemetriaIndisponivel')}</p>
            ) : (
              <>
                <p className="telemetria-campos">
                  {t('app.pref.telemetriaCampos')} {telemetria.collected.map((campo) => rotuloDoCampo(t, campo)).join(' · ')}
                </p>
                <label className="opcoes-linha">
                  <input
                    type="checkbox"
                    checked={telemetria.optOut}
                    disabled={telemetria.busy}
                    onChange={(e) => void definirTelemetria(e.target.checked)}
                  />
                  {t('app.pref.telemetriaRecusar')}
                </label>
                {telemetria.error ? <p className="error">{telemetria.error}</p> : null}
              </>
            )}
          </>
        ) : null}

        <h3>{t('app.opcoes.conta')}</h3>
        {apagarPendente ? (
          <div className="apagar-confirmacao">
            <p>{t('app.pref.apagarPergunta')}</p>
            <div className="apagar-botoes">
              <button type="button" onClick={cancelarApagarProgresso}>
                {t('app.pref.apagarCancelar')}
              </button>
              <button type="button" className="clear-progress" onClick={confirmarApagarProgresso}>
                {t('app.pref.apagarConfirmar')}
              </button>
            </div>
          </div>
        ) : (
          <button type="button" className="clear-progress" onClick={pedirApagarProgresso}>
            {t('app.pref.apagarProgresso')}
          </button>
        )}
      </section>
    </div>
  );
}
