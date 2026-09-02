import { resolveHeroStatSheet } from '@paths-beyond/core';
import { catalog } from '../data/catalog.js';
import { useBattleStore } from '../store/battleStore.js';

// §10 (M14, sub-sessão 5/N) — a tela do farm: masmorras, conta e o ciclo
// "farm → drop → enhance → equipar → subir de poder".
//
// Nada aqui decide regra (regra 3). A disponibilidade de cada masmorra — trancada, sem
// energia, varredura liberada — vem RESOLVIDA do servidor; o painel só desenha, e todo
// botão é uma chamada de rota.

const FOCUS_LABEL: Record<string, string> = {
  gear: 'Equipamento',
  exp: 'Experiência',
  gold: 'Ouro',
  boss: 'Chefe',
};

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
        <h2>Masmorras</h2>
        <p className="hint">Conecte-se no painel de PvP com o seu token para farmar.</p>
      </section>
    );
  }

  return (
    <section className="dungeon-panel">
      <h2>Masmorras</h2>

      <div className="pve-actions">
        <button type="button" onClick={() => void refreshPve()} disabled={pve.busy}>
          Atualizar conta
        </button>
      </div>

      {pve.economy ? (
        <p className="pve-economy">
          Energia <strong>{pve.economy.energy.stored}</strong>/{pve.economy.energyMax} · Ouro{' '}
          <strong>{pve.economy.wallet.gold}</strong> · Pedras <strong>{pve.economy.wallet.stones}</strong> ·{' '}
          {pve.economy.inventory.length} item(ns) no inventário
        </p>
      ) : null}

      {inDungeon ? (
        <>
          <p className="pve-battle">
            Masmorra em andamento · round {battleState.round} · {commandCount} comando(s) gravado(s)
          </p>
          {battleOver ? (
            <p className="pve-battle-over">
              Resultado local: <strong>{battleState.outcome}</strong>. O servidor é quem decide — envie os comandos.
            </p>
          ) : null}
          <div className="pve-actions">
            <button type="button" onClick={() => void submitDungeonRun()} disabled={pve.busy || !battleOver}>
              Enviar ao servidor
            </button>
            <button type="button" onClick={exitDungeon} disabled={pve.busy}>
              Abandonar
            </button>
          </div>
        </>
      ) : (
        <>
          <h3>Seu time</h3>
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
                    <span className="hint">
                      (a{entry.hero.awakening} i{entry.hero.imprint}
                      {power !== null ? ` · poder ${power}` : ''})
                    </span>
                  </label>
                  <span className="pve-hero-actions">
                    <button type="button" onClick={() => void awakenHero(entry.hero.id)} disabled={pve.busy}>
                      Despertar
                    </button>
                    <button type="button" onClick={() => void imprintHero(entry.hero.id)} disabled={pve.busy}>
                      Imprint
                    </button>
                  </span>
                </li>
              );
            })}
          </ul>

          <h3>Masmorras</h3>
          <ul className="pve-dungeons">
            {pve.dungeons.map((dungeon) => (
              <li key={dungeon.id} className={dungeon.lockedBy ? 'locked' : ''}>
                <span className="pve-dungeon-name">
                  {dungeon.name} <span className="hint">({FOCUS_LABEL[dungeon.focus] ?? dungeon.focus})</span>
                </span>
                <span className="hint">
                  {dungeon.energyCost} energia
                  {dungeon.entriesLeft !== null ? ` · ${dungeon.entriesLeft} entrada(s)` : ''}
                  {dungeon.cleared ? ' · limpa' : ''}
                </span>
                {dungeon.lockedBy ? (
                  <span className="pve-locked">Trancada até limpar {dungeon.lockedBy}</span>
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
                          ? 'esta dificuldade é sempre manual'
                          : dungeon.cleared
                            ? 'varre com o time automático'
                            : 'limpe à mão antes de varrer'
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
              <h3>Inventário</h3>
              <ul className="pve-inventory">
                {pve.economy.inventory.map((item) => (
                  <li key={item.id}>
                    <span>
                      {item.setId} · {item.slot} · {item.rarity} · <strong>+{item.enhance}</strong>
                    </span>
                    <span className="pve-actions">
                      <button type="button" onClick={() => void enhanceInventoryItem(item.id)} disabled={pve.busy}>
                        Aprimorar
                      </button>
                      <button
                        type="button"
                        onClick={() => heroDoFoco && void equipInventoryItem(heroDoFoco, item.id)}
                        disabled={pve.busy || !heroDoFoco}
                      >
                        Equipar
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
            Última run: <strong>{pve.lastRun.outcome}</strong> em {pve.lastRun.roundsPlayed} round(s)
          </p>
          {pve.lastRun.rewards ? (
            <p className="hint">
              +{pve.lastRun.rewards.gold} ouro · +{pve.lastRun.rewards.exp} exp · +{pve.lastRun.rewards.stones} pedras ·{' '}
              {pve.lastRun.rewards.items.length} item(ns)
            </p>
          ) : (
            <p className="hint">Sem recompensa — a energia foi gasta do mesmo jeito.</p>
          )}
        </div>
      ) : null}

      {pve.status ? <p className="pve-status">{pve.status}</p> : null}
      {pve.error ? <p className="error">{pve.error}</p> : null}
    </section>
  );
}
