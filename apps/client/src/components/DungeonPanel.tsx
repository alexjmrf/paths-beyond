import { catalog } from '../data/catalog.js';
import { nomeDeConteudo } from '../i18n/conteudo.js';
import { nomeDoDesfecho, rotuloDeHeroi } from '../logic/rotulos.js';
import { useBattleStore } from '../store/battleStore.js';

// §10 (M14, sub-sessão 5/N) — a tela do farm: as masmorras. M35 1/N (D41): o elenco e o
// inventário saíram daqui para a aba Personagens; o que fica é a lista de masmorras, quem vai e
// a saída da batalha de masmorra.
//
// Nada aqui decide regra (regra 3). A disponibilidade de cada masmorra — trancada, sem
// energia, varredura liberada — vem RESOLVIDA do servidor; o painel só desenha, e todo
// botão é uma chamada de rota.

// M25 — o rótulo do foco saiu daqui para o catálogo; o que sobra é o id, que é dado
// de `packages/data` e não texto de tela.
const FOCOS = ['gear', 'exp', 'gold', 'boss'] as const;

export function DungeonPanel() {
  const pve = useBattleStore((s) => s.pve);
  const t = useBattleStore((s) => s.t);
  const pvp = useBattleStore((s) => s.pvp);
  const mode = useBattleStore((s) => s.mode);
  const battleState = useBattleStore((s) => s.battleState);
  const commandCount = useBattleStore((s) => s.commandLog.length);

  const togglePveHero = useBattleStore((s) => s.togglePveHero);
  const enterDungeon = useBattleStore((s) => s.enterDungeon);
  const submitDungeonRun = useBattleStore((s) => s.submitDungeonRun);
  const sweepDungeon = useBattleStore((s) => s.sweepDungeon);
  const exitDungeon = useBattleStore((s) => s.exitDungeon);

  const inDungeon = mode === 'dungeon' && pve.ticket !== null;
  const battleOver = inDungeon && battleState.outcome !== 'ongoing';

  return (
    <section className="dungeon-panel">
      <h2>{t('masmorra.titulo')}</h2>

      {pve.economy ? (
        <p className="pve-economy">
          {t('masmorra.economia', {
            energia: pve.economy.energy.stored,
            teto: pve.economy.energyMax,
            ouro: pve.economy.wallet.gold,
            pedras: pve.economy.wallet.stones,
            itens: pve.economy.inventory.length,
          })}
        </p>
      ) : null}

      {inDungeon ? (
        <>
          <p className="pve-battle">
            Masmorra em andamento · round {battleState.round} · {commandCount} comando(s) gravado(s)
          </p>
          {battleOver ? (
            <p className="pve-battle-over">
              {t('masmorra.resultadoLocal', { desfecho: nomeDoDesfecho(t, battleState.outcome) })}
            </p>
          ) : null}
          <div className="pve-actions">
            <button type="button" onClick={() => void submitDungeonRun()} disabled={pve.busy || !battleOver}>
              {t('masmorra.enviar')}
            </button>
            <button type="button" onClick={exitDungeon} disabled={pve.busy}>
              {t('masmorra.abandonar')}
            </button>
          </div>
        </>
      ) : (
        <>
          <h3>{t('masmorra.seuTime')}</h3>
          <ul className="pve-roster">
            {pvp.roster.map((entry) => (
              <li key={entry.hero.id}>
                <label>
                  <input
                    type="checkbox"
                    checked={pve.selectedHeroIds.includes(entry.hero.id)}
                    onChange={() => togglePveHero(entry.hero.id)}
                  />
                  {rotuloDeHeroi(t, entry.hero, catalog).nome}{' '}
                  <span className="hint">({rotuloDeHeroi(t, entry.hero, catalog).classe})</span>
                </label>
              </li>
            ))}
          </ul>

          <h3>{t('masmorra.titulo')}</h3>
          <ul className="pve-dungeons">
            {pve.dungeons.map((dungeon) => (
              <li key={dungeon.id} className={dungeon.lockedBy ? 'locked' : ''}>
                <span className="pve-dungeon-name">
                  {nomeDeConteudo(t, 'masmorra', dungeon.id, dungeon.name)}{' '}
                  <span className="hint">
                    ({FOCOS.includes(dungeon.focus as (typeof FOCOS)[number])
                      ? t(`masmorra.foco.${dungeon.focus}`)
                      : dungeon.focus})
                  </span>
                </span>
                <span className="hint">
                  {t('masmorra.custo', {
                    energia: dungeon.energyCost,
                    entradas:
                      dungeon.entriesLeft !== null
                        ? t('masmorra.entradas', { entradas: dungeon.entriesLeft })
                        : '',
                    limpa: dungeon.cleared ? t('masmorra.limpa') : '',
                  })}
                </span>
                {dungeon.lockedBy ? (
                  <span className="pve-locked">{t('masmorra.trancada', { masmorra: dungeon.lockedBy })}</span>
                ) : (
                  <span className="pve-actions">
                    <button
                      type="button"
                      onClick={() => void enterDungeon(dungeon.id)}
                      disabled={pve.busy || !dungeon.enoughEnergy || pve.selectedHeroIds.length === 0}
                    >
                      Entrar
                    </button>
                    <button
                      type="button"
                      onClick={() => void sweepDungeon(dungeon.id)}
                      disabled={pve.busy || !dungeon.sweepAvailable || !dungeon.enoughEnergy}
                      title={
                        dungeon.manualOnly
                          ? t('masmorra.sempreManual')
                          : dungeon.cleared
                            ? t('masmorra.varreComAuto')
                            : t('masmorra.limpeAntes')
                      }
                    >
                      Varrer
                    </button>
                  </span>
                )}
              </li>
            ))}
          </ul>

        </>
      )}

      {pve.lastRun ? (
        <div className="pve-result">
          <p>
            {t('masmorra.ultimaRun', {
              desfecho: nomeDoDesfecho(t, pve.lastRun.outcome),
              rounds: pve.lastRun.roundsPlayed,
            })}
          </p>
          {pve.lastRun.rewards ? (
            <p className="hint">
              {t('masmorra.recompensa', {
                ouro: pve.lastRun.rewards.gold,
                exp: pve.lastRun.rewards.exp,
                pedras: pve.lastRun.rewards.stones,
                itens: pve.lastRun.rewards.items.length,
              })}
            </p>
          ) : (
            <p className="hint">{t('masmorra.semRecompensa')}</p>
          )}
        </div>
      ) : null}

      {pve.status ? <p className="pve-status">{pve.status}</p> : null}
      {pve.error ? <p className="error">{pve.error}</p> : null}
    </section>
  );
}
