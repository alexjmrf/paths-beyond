import { catalog } from '../data/catalog.js';
import { nomeDoDesfecho, rotuloDeHeroi } from '../logic/rotulos.js';
import { useBattleStore } from '../store/battleStore.js';
import { ArenaDefensePanel } from './ArenaDefensePanel.js';

// §11 (M13, sub-sessão 2/N) — a tela de PvP: liga o cliente ao servidor de M7, que existia
// desde então sem ninguém do outro lado da linha.
//
// O fluxo segue §9.1 ("o atacante joga a camada de grid manualmente contra essa defesa"):
// conectar → escolher o time → achar oponente → **pedir o ticket e JOGAR a batalha de
// verdade** → submeter os comandos → rever o replay que o servidor persistiu. O ticket é
// o que torna isso honesto: sem ele o cliente mandaria comandos sem saber a seed.

export function PvpPanel() {
  const pvp = useBattleStore((s) => s.pvp);
  const t = useBattleStore((s) => s.t);
  const mode = useBattleStore((s) => s.mode);
  const battleState = useBattleStore((s) => s.battleState);
  const commandCount = useBattleStore((s) => s.commandLog.length);

  const togglePvpHero = useBattleStore((s) => s.togglePvpHero);
  const findPvpOpponent = useBattleStore((s) => s.findPvpOpponent);
  const startPvpBattle = useBattleStore((s) => s.startPvpBattle);
  const submitPvpBattle = useBattleStore((s) => s.submitPvpBattle);
  const reviewPvpBattle = useBattleStore((s) => s.reviewPvpBattle);
  const exitPvp = useBattleStore((s) => s.exitPvp);

  const inBattle = mode === 'pvp' && pvp.ticket !== null;
  const battleOver = inBattle && battleState.outcome !== 'ongoing';

  // M32 — o sign-in saiu daqui para `EntradaPanel`: este painel só existe COM sessão, e é
  // `App.tsx` (por `telaDoJogo`) quem garante isso. A guarda é só para o tipo.
  if (!pvp.me) return null;

  return (
    <section className="pvp-panel">
      <h2>{t('pvp.titulo')}</h2>

      <p className="pvp-me">
        {t('pvp.eu', { nome: pvp.me.displayName, elo: pvp.me.elo, marcas: pvp.me.arenaMarks })}
      </p>

      {!inBattle ? (
        <>
          <h3>{t('pvp.seuTime')}</h3>
          <ul className="pvp-roster">
            {pvp.roster.map((entry) => (
              <li key={entry.hero.id}>
                <label>
                  <input
                    type="checkbox"
                    checked={pvp.selectedHeroIds.includes(entry.hero.id)}
                    onChange={() => togglePvpHero(entry.hero.id)}
                  />
                  {rotuloDeHeroi(t, entry.hero, catalog).nome}{' '}
                  <span className="hint">({rotuloDeHeroi(t, entry.hero, catalog).classe})</span>
                </label>
              </li>
            ))}
          </ul>

          <div className="pvp-actions">
            <button type="button" onClick={() => void findPvpOpponent()} disabled={pvp.busy}>
              {t('pvp.procurarOponente')}
            </button>
            <button
              type="button"
              onClick={() => void startPvpBattle()}
              disabled={pvp.busy || !pvp.opponent || pvp.selectedHeroIds.length === 0}
            >
              {t('pvp.iniciarBatalha')}
            </button>
          </div>

          {pvp.opponent ? (
            <p className="pvp-opponent">
              {t('pvp.oponente', {
                nome: pvp.opponent.displayName,
                elo: pvp.opponent.elo,
                mapa: pvp.opponent.mapId ? ` · ${pvp.opponent.mapId}` : '',
              })}
            </p>
          ) : null}

          {/* A outra metade do PvP assíncrono: atacar é jogar, defender é montar. Fica
              na mesma tela porque as duas usam o mesmo roster e a mesma conexão. */}
          <ArenaDefensePanel />
        </>
      ) : (
        <>
          <p className="pvp-battle">
            {t('pvp.emAndamento', { round: battleState.round, comandos: commandCount })}
          </p>
          {battleOver ? (
            <p className="pvp-battle-over">
              {t('pvp.resultadoLocal', { desfecho: nomeDoDesfecho(t, battleState.outcome) })}
            </p>
          ) : null}

          <div className="pvp-actions">
            {/* M32 — com a batalha terminada, enviar é a próxima ação; antes disso não há
                o que enviar, e o peso vai para o mapa. Depois de enviado, o peso sai. */}
            <button
              type="button"
              className={battleOver && !pvp.outcome ? 'acao-principal' : ''}
              onClick={() => void submitPvpBattle()}
              disabled={pvp.busy || !battleOver}
            >
              {t('pvp.enviar')}
            </button>
            <button type="button" onClick={() => void reviewPvpBattle()} disabled={pvp.busy || !pvp.outcome}>
              {t('pvp.reverReplay')}
            </button>
            <button type="button" onClick={exitPvp} disabled={pvp.busy}>
              {t('pvp.voltar')}
            </button>
          </div>

          {pvp.outcome ? (
            <div className="pvp-result">
              <p>
                {t('pvp.servidorDisse', {
                  desfecho: nomeDoDesfecho(t, pvp.outcome.result.outcome),
                  rounds: pvp.outcome.result.roundsPlayed,
                  seed: pvp.outcome.seed,
                })}
              </p>
              {pvp.outcome.elo ? (
                <p>
                  {t('pvp.eloDepois', {
                    atacante: pvp.outcome.elo.attacker,
                    defensor: pvp.outcome.elo.defender,
                  })}
                </p>
              ) : null}
              {pvp.outcome.arenaMarks ? (
                <p>{t('pvp.marcas', { marcas: pvp.outcome.arenaMarks.attacker })}</p>
              ) : null}
            </div>
          ) : null}
        </>
      )}

      {pvp.status ? <p className="pvp-status">{pvp.status}</p> : null}
      {pvp.error ? <p className="error">{pvp.error}</p> : null}
    </section>
  );
}
