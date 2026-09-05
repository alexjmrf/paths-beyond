import { isControlObject, tileAt, type Coord, type MapAiArchetype } from '@paths-beyond/core';
import { catalog } from '../data/catalog.js';
import { themeFor } from '../data/overlayTheme.js';
import { defenseMapIds, MAX_DEFENSE_UNITS, useBattleStore } from '../store/battleStore.js';

// §9.1 (M15, sub-sessão 3/N) — **a tela que faltava desde M7**. `PUT /me/defense` existe no
// servidor desde aquele milestone e nenhuma linha de cliente jamais o chamou: sem ela o
// jogador não consegue definir quem defende o castelo dele, e o PvP assíncrono inteiro —
// ELO, matchmaking, replays, anti-cheat, fuzz de 1000 partidas — era inalcançável sem
// `curl`. É a razão de M15 vir antes do trabalho gráfico (briefing §1).
//
// A escolha de arquétipo por unidade **é o conteúdo tático desta tela** (briefing §2), não
// detalhe de formulário: é a única coisa que o defensor decide sobre uma batalha que ele não
// vai jogar. Por isso cada um vem traduzido, do mesmo jeito que o editor de táticas (M6 5/N)
// traduz `Condition` em vez de mostrar o nome do campo.
//
// D4 — nenhuma linguagem visual nova aqui (isso é M16): a grade reusa as cores de
// `overlayTheme` (as mesmas do mapa de batalha, inclusive no modo daltônico) e o painel usa
// os padrões que `InventoryPanel`/`TacticsEditor` já estabeleceram.

const ARCHETYPES: readonly { readonly id: MapAiArchetype }[] = [
  // M25 — o rótulo e a dica saíram daqui para o catálogo. O que sobra é o id, que é
  // dado do core (`MapAiArchetype`) e não texto de tela.
  { id: 'aggressive' },
  { id: 'hold-position' },
  { id: 'guard-tile' },
  { id: 'flank' },
  { id: 'support-nearest' },
];

function hex(color: number): string {
  return `#${color.toString(16).padStart(6, '0')}`;
}

export function ArenaDefensePanel() {
  const pvp = useBattleStore((s) => s.pvp);
  const t = useBattleStore((s) => s.t);
  const colorblindMode = useBattleStore((s) => s.colorblindMode);

  const loadDefense = useBattleStore((s) => s.loadDefense);
  const setDefenseMap = useBattleStore((s) => s.setDefenseMap);
  const armDefenseHero = useBattleStore((s) => s.armDefenseHero);
  const placeDefenseAt = useBattleStore((s) => s.placeDefenseAt);
  const removeDefenseUnit = useBattleStore((s) => s.removeDefenseUnit);
  const setDefenseArchetype = useBattleStore((s) => s.setDefenseArchetype);
  const saveDefense = useBattleStore((s) => s.saveDefense);

  const draft = pvp.defenseDraft;
  const theme = themeFor(colorblindMode);
  const arenaMapIds = defenseMapIds();
  const grid = catalog.maps[draft.mapId]?.grid;

  // O rascunho difere do que está salvo? É o que separa "montei" de "salvei" na tela.
  const saved = pvp.savedDefense;
  const dirty =
    JSON.stringify({ mapId: draft.mapId, units: draft.units }) !==
    JSON.stringify({ mapId: saved?.mapId ?? '', units: saved?.units ?? [] });

  function unitAt(coord: Coord): (typeof draft.units)[number] | undefined {
    return draft.units.find((u) => u.pos.x === coord.x && u.pos.y === coord.y);
  }

  function tileColor(coord: Coord): string {
    const tile = grid ? tileAt(grid, coord) : undefined;
    if (!tile) return hex(theme.terrainFallback);
    if (tile.object === 'wall' || tile.object === 'gate') return hex(theme.structure);
    return hex(theme.terrain[tile.terrain] ?? theme.terrainFallback);
  }

  return (
    <section className="defense-panel">
      <h3>{t('defesa.titulo')}</h3>
      <p className="hint">{t('defesa.explicacao')}</p>

      <div className="defense-toolbar">
        <label>
          {t('defesa.mapa')}
          <select value={draft.mapId} onChange={(event) => setDefenseMap(event.target.value)}>
            {arenaMapIds.map((id) => (
              <option key={id} value={id}>
                {id}
              </option>
            ))}
          </select>
        </label>
        <button type="button" onClick={() => void loadDefense()} disabled={pvp.busy}>
          {t('defesa.recarregar')}
        </button>
        <button type="button" onClick={() => void saveDefense()} disabled={pvp.busy || draft.units.length === 0}>
          {t('defesa.salvar')}
        </button>
      </div>

      <p className="defense-state">
        {saved
          ? t('defesa.salvo', {
              herois: saved.units.length,
              mapa: saved.mapId,
              mudancas: dirty ? t('defesa.comMudancas') : t('defesa.semMudancas'),
            })
          : t('defesa.nenhuma')}
      </p>

      <div className="defense-layout">
        <div>
          <h4>{t('defesa.herois', { postos: draft.units.length, maximo: MAX_DEFENSE_UNITS })}</h4>
          <ul className="defense-roster">
            {pvp.roster.map((entry) => {
              const placed = draft.units.find((u) => u.heroId === entry.hero.id);
              const arming = draft.placingHeroId === entry.hero.id;
              return (
                <li key={entry.hero.id} className={placed ? 'placed' : ''}>
                  <button
                    type="button"
                    className={arming ? 'arming' : ''}
                    onClick={() => armDefenseHero(arming ? null : entry.hero.id)}
                  >
                    {arming ? t('defesa.cliqueNoTile') : placed ? t('defesa.mover') : t('defesa.posicionar')}
                  </button>
                  <span className="defense-hero">
                    {entry.hero.id} <span className="hint">({entry.hero.classId})</span>
                  </span>
                  {placed ? (
                    <>
                      <span className="defense-pos">
                        ({placed.pos.x},{placed.pos.y}) h{placed.height}
                      </span>
                      <select
                        value={placed.aiArchetype}
                        onChange={(event) => setDefenseArchetype(entry.hero.id, event.target.value as MapAiArchetype)}
                        title={t(`defesa.arquetipo.${placed.aiArchetype}.dica`)}
                      >
                        {ARCHETYPES.map((archetype) => (
                          <option key={archetype.id} value={archetype.id}>
                            {t(`defesa.arquetipo.${archetype.id}`)}
                          </option>
                        ))}
                      </select>
                      <button type="button" onClick={() => removeDefenseUnit(entry.hero.id)}>
                        {t('defesa.tirar')}
                      </button>
                    </>
                  ) : null}
                </li>
              );
            })}
          </ul>

          <ul className="defense-archetype-legend">
            {ARCHETYPES.map((archetype) => (
              <li key={archetype.id}>
                <strong>{t(`defesa.arquetipo.${archetype.id}`)}</strong>:{' '}
                {t(`defesa.arquetipo.${archetype.id}.dica`)}
              </li>
            ))}
          </ul>
        </div>

        {grid ? (
          <div
            className="defense-grid"
            style={{ gridTemplateColumns: `repeat(${grid.width}, var(--defense-tile))` }}
          >
            {Array.from({ length: grid.height }, (_unused, y) =>
              Array.from({ length: grid.width }, (_unused2, x) => {
                const coord = { x, y };
                const occupant = unitAt(coord);
                const tile = tileAt(grid, coord);
                return (
                  <button
                    key={`${x},${y}`}
                    type="button"
                    className={`defense-tile${occupant ? ' occupied' : ''}`}
                    style={{
                      background: tileColor(coord),
                      // Objetivo de captura (§5.6): posicionar em cima de um fort é decisão,
                      // não acidente — o defensor cobre o tile que rende Valor ao atacante.
                      outline: isControlObject(tile?.object) ? `2px solid ${hex(theme.objective.color)}` : undefined,
                      outlineOffset: '-3px',
                    }}
                    title={`(${x},${y}) ${tile?.object ?? tile?.terrain ?? ''}`}
                    onClick={() => placeDefenseAt(coord)}
                  >
                    {occupant ? (
                      <span
                        className="defense-marker"
                        style={{
                          background: hex(theme.sides.enemy.color),
                          borderRadius: theme.sides.enemy.shape === 'circle' ? '50%' : '2px',
                        }}
                      />
                    ) : null}
                  </button>
                );
              }),
            )}
          </div>
        ) : (
          <p className="error">mapa desconhecido no catálogo: {draft.mapId}</p>
        )}
      </div>
    </section>
  );
}
