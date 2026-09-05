import { resolveHeroStatSheet } from '@paths-beyond/core';
import { catalog } from '../data/catalog.js';
import { nomeDeConteudo } from '../i18n/conteudo.js';
import { useBattleStore } from '../store/battleStore.js';

// §10 (M14, sub-sessão 5/N) — a tela do farm: masmorras, conta e o ciclo
// "farm → drop → enhance → equipar → subir de poder".
//
// Nada aqui decide regra (regra 3). A disponibilidade de cada masmorra — trancada, sem
// energia, varredura liberada — vem RESOLVIDA do servidor; o painel só desenha, e todo
// botão é uma chamada de rota.

// M25 — o rótulo do foco saiu daqui para o catálogo; o que sobra é o id, que é dado
// de `packages/data` e não texto de tela.
const FOCOS = ['gear', 'exp', 'gold', 'boss'] as const;

// O "poder" mostrado ao lado do herói: o stat sheet resolvido pelo core a partir do que o
// SERVIDOR devolveu (herói + itens equipados). É o número que precisa subir no fim do
// ciclo — e é o mesmo cálculo que a batalha usa, não uma métrica de vitrine.
function powerOf(heroId: string, roster: ReturnType<typeof useBattleStore.getState>['pvp']['roster']): number | null {
  const entry = roster.find((candidate) => candidate.hero.id === heroId);
  if (!entry) return null;
  const classDef = catalog.classes[entry.hero.classId];
  if (!classDef) return null;
  const sheet = resolveHeroStatSheet({
    hero: entry.hero,
    classDef,
    equippedItems: entry.equippedItems,
    itemSets: catalog.itemSets,
    // §8.1 (M17, 2/N) — a árvore é do personagem. O poder mostrado aqui precisa incluir o
    // talento pelo mesmo motivo que o comentário acima dá para ele existir: é o número que
    // sobe no fim do ciclo, e tem de ser o MESMO cálculo da batalha, não um parecido.
    talentTree: entry.hero.characterId ? (catalog.characterTalentTrees[entry.hero.characterId]?.nodes ?? []) : [],
  });
  return Object.values(sheet).reduce((total, value) => total + value, 0);
}

export function DungeonPanel() {
  const pve = useBattleStore((s) => s.pve);
  const t = useBattleStore((s) => s.t);
  const pvp = useBattleStore((s) => s.pvp);
  const mode = useBattleStore((s) => s.mode);
  const battleState = useBattleStore((s) => s.battleState);
  const commandCount = useBattleStore((s) => s.commandLog.length);

  const refreshPve = useBattleStore((s) => s.refreshPve);
  const togglePveHero = useBattleStore((s) => s.togglePveHero);
  const enterDungeon = useBattleStore((s) => s.enterDungeon);
  const submitDungeonRun = useBattleStore((s) => s.submitDungeonRun);
  const sweepDungeon = useBattleStore((s) => s.sweepDungeon);
  const exitDungeon = useBattleStore((s) => s.exitDungeon);
  const enhanceInventoryItem = useBattleStore((s) => s.enhanceInventoryItem);
  const equipInventoryItem = useBattleStore((s) => s.equipInventoryItem);
  const awakenHero = useBattleStore((s) => s.awakenHero);
  const imprintHero = useBattleStore((s) => s.imprintHero);

  const inDungeon = mode === 'dungeon' && pve.ticket !== null;
  const battleOver = inDungeon && battleState.outcome !== 'ongoing';
  const heroDoFoco = pve.selectedHeroIds[0] ?? pvp.roster[0]?.hero.id ?? null;

  if (!pvp.me) {
    return (
      <section className="dungeon-panel">
        <h2>{t('masmorra.titulo')}</h2>
        <p className="hint">{t('masmorra.conecte')}</p>
      </section>
    );
  }

  return (
    <section className="dungeon-panel">
      <h2>{t('masmorra.titulo')}</h2>

      <div className="pve-actions">
        <button type="button" onClick={() => void refreshPve()} disabled={pve.busy}>
          {t('masmorra.atualizarConta')}
        </button>
      </div>

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
              {t('masmorra.resultadoLocal', { desfecho: battleState.outcome })}
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
            {pvp.roster.map((entry) => {
              const power = powerOf(entry.hero.id, pvp.roster);
              return (
                <li key={entry.hero.id}>
                  <label>
                    <input
                      type="checkbox"
                      checked={pve.selectedHeroIds.includes(entry.hero.id)}
                      onChange={() => togglePveHero(entry.hero.id)}
                    />
                    {entry.hero.id}{' '}
                    {/* M23 3/N — "a3 i1" era ilegível para quem chega: as duas letras são
                        despertar e vínculo, que são justamente os dois botões ao lado. */}
                    <span
                      className="hint"
                      title={t('masmorra.heroiTitle')}
                    >
                      {t('masmorra.heroiResumo', {
                        despertar: entry.hero.awakening,
                        vinculo: entry.hero.imprint,
                        poder: power !== null ? t('masmorra.poder', { poder: power }) : '',
                      })}
                    </span>
                  </label>
                  <span className="pve-hero-actions">
                    <button type="button" onClick={() => void awakenHero(entry.hero.id)} disabled={pve.busy}>
                      {t('masmorra.despertar')}
                    </button>
                    <button type="button" onClick={() => void imprintHero(entry.hero.id)} disabled={pve.busy}>
                      {t('masmorra.vinculo')}
                    </button>
                  </span>
                </li>
              );
            })}
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

          {pve.economy && pve.economy.inventory.length > 0 ? (
            <>
              <h3>{t('masmorra.inventario')}</h3>
              <ul className="pve-inventory">
                {pve.economy.inventory.map((item) => (
                  <li key={item.id}>
                    <span>
                      {item.setId} · {item.slot} · {item.rarity} · <strong>+{item.enhance}</strong>
                    </span>
                    <span className="pve-actions">
                      <button type="button" onClick={() => void enhanceInventoryItem(item.id)} disabled={pve.busy}>
                        {t('masmorra.aprimorar')}
                      </button>
                      <button
                        type="button"
                        onClick={() => heroDoFoco && void equipInventoryItem(heroDoFoco, item.id)}
                        disabled={pve.busy || !heroDoFoco}
                      >
                        {t('masmorra.equipar')}
                      </button>
                    </span>
                  </li>
                ))}
              </ul>
            </>
          ) : null}
        </>
      )}

      {pve.lastRun ? (
        <div className="pve-result">
          <p>
            {t('masmorra.ultimaRun', {
              desfecho: pve.lastRun.outcome,
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
