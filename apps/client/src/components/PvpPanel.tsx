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
  const mode = useBattleStore((s) => s.mode);
  const battleState = useBattleStore((s) => s.battleState);
  const commandCount = useBattleStore((s) => s.commandLog.length);

  const setPvpToken = useBattleStore((s) => s.setPvpToken);
  const connectPvp = useBattleStore((s) => s.connectPvp);
  const togglePvpHero = useBattleStore((s) => s.togglePvpHero);
  const findPvpOpponent = useBattleStore((s) => s.findPvpOpponent);
  const startPvpBattle = useBattleStore((s) => s.startPvpBattle);
  const submitPvpBattle = useBattleStore((s) => s.submitPvpBattle);
  const reviewPvpBattle = useBattleStore((s) => s.reviewPvpBattle);
  const exitPvp = useBattleStore((s) => s.exitPvp);

  const inBattle = mode === 'pvp' && pvp.ticket !== null;
  const battleOver = inBattle && battleState.outcome !== 'ongoing';

  return (
    <section className="pvp-panel">
      <h2>PvP — arena</h2>

      {!pvp.me ? (
        <div className="pvp-login">
          <label>
            Token do jogador
            <input
              type="text"
              value={pvp.token}
              placeholder="x-player-token"
              onChange={(event) => setPvpToken(event.target.value)}
            />
          </label>
          <button type="button" onClick={() => void connectPvp()} disabled={pvp.busy}>
            Conectar
          </button>
          {/* A auth do servidor é um token opaco (stub de M7): o cliente não inventa um
              sistema de contas que §9 não especifica. */}
          <p className="hint">Auth de M7: token opaco enviado no header `x-player-token`.</p>
        </div>
      ) : (
        <>
          <p className="pvp-me">
            {pvp.me.displayName} · ELO <strong>{pvp.me.elo}</strong> · {pvp.me.arenaMarks} marcas
          </p>

          {!inBattle ? (
            <>
              <h3>Seu time</h3>
              <ul className="pvp-roster">
                {pvp.roster.map((entry) => (
                  <li key={entry.hero.id}>
                    <label>
                      <input
                        type="checkbox"
                        checked={pvp.selectedHeroIds.includes(entry.hero.id)}
                        onChange={() => togglePvpHero(entry.hero.id)}
                      />
                      {entry.hero.id} <span className="hint">({entry.hero.classId})</span>
                    </label>
                  </li>
                ))}
              </ul>

              <div className="pvp-actions">
                <button type="button" onClick={() => void findPvpOpponent()} disabled={pvp.busy}>
                  Procurar oponente
                </button>
                <button
                  type="button"
                  onClick={() => void startPvpBattle()}
                  disabled={pvp.busy || !pvp.opponent || pvp.selectedHeroIds.length === 0}
                >
                  Iniciar batalha
                </button>
              </div>

              {pvp.opponent ? (
                <p className="pvp-opponent">
                  Oponente: <strong>{pvp.opponent.displayName}</strong> · ELO {pvp.opponent.elo}
                  {pvp.opponent.mapId ? ` · ${pvp.opponent.mapId}` : ''}
                </p>
              ) : null}

              {/* A outra metade do PvP assíncrono: atacar é jogar, defender é montar. Fica
                  na mesma tela porque as duas usam o mesmo roster e a mesma conexão. */}
              <ArenaDefensePanel />
            </>
          ) : (
            <>
              <p className="pvp-battle">
                Batalha de arena em andamento · round {battleState.round} · {commandCount} comando(s) gravado(s)
              </p>
              {battleOver ? (
                <p className="pvp-battle-over">
                  Resultado local: <strong>{battleState.outcome}</strong>. O servidor é quem decide — envie os
                  comandos.
                </p>
              ) : null}

              <div className="pvp-actions">
                <button type="button" onClick={() => void submitPvpBattle()} disabled={pvp.busy || !battleOver}>
                  Enviar ao servidor
                </button>
                <button type="button" onClick={() => void reviewPvpBattle()} disabled={pvp.busy || !pvp.outcome}>
                  Rever replay do servidor
                </button>
                <button type="button" onClick={exitPvp} disabled={pvp.busy}>
                  Voltar à campanha
                </button>
              </div>

              {pvp.outcome ? (
                <div className="pvp-result">
                  <p>
                    Servidor: <strong>{pvp.outcome.result.outcome}</strong> em {pvp.outcome.result.roundsPlayed} round(s)
                    · seed {pvp.outcome.seed}
                  </p>
                  {pvp.outcome.elo ? (
                    <p>
                      ELO: {pvp.outcome.elo.attacker} (você) · {pvp.outcome.elo.defender} (defensor)
                    </p>
                  ) : null}
                  {pvp.outcome.arenaMarks ? <p>Marcas de arena: {pvp.outcome.arenaMarks.attacker}</p> : null}
                </div>
              ) : null}
            </>
          )}
        </>
      )}

      {pvp.status ? <p className="pvp-status">{pvp.status}</p> : null}
      {pvp.error ? <p className="error">{pvp.error}</p> : null}
    </section>
  );
}
