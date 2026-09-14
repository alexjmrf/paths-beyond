import { resolveHeroStatSheet } from '@paths-beyond/core';
import { useState } from 'react';
import { catalog } from '../data/catalog.js';
import { rotuloDeHeroi } from '../logic/rotulos.js';
import { useBattleStore } from '../store/battleStore.js';

// M35 1/N (D41) — a aba Personagens: o elenco E o equipamento, "só isso mesmo" (decisão do
// usuário ao aprovar o plano — Equipamento não é aba própria).
//
// Os dois blocos vieram de `DungeonPanel`, que até aqui misturava "Seu time", as masmorras e
// o inventário num painel só (§10, M14 5/N). Nada mudou de regra: despertar, vínculo, aprimorar
// e equipar continuam sendo chamadas de rota, e o servidor é quem decide (regra 3).

// O "poder" mostrado ao lado do herói: o stat sheet resolvido pelo core a partir do que o
// SERVIDOR devolveu (herói + itens equipados). É o número que precisa subir no fim do ciclo
// farm → drop → enhance → equipar — e é o mesmo cálculo que a batalha usa, não uma métrica de
// vitrine. §8.1 (M17, 2/N): a árvore é do personagem, e o poder inclui o talento pelo mesmo
// motivo.
function powerOf(entry: ReturnType<typeof useBattleStore.getState>['pvp']['roster'][number]): number | null {
  const classDef = catalog.classes[entry.hero.classId];
  if (!classDef) return null;
  const sheet = resolveHeroStatSheet({
    hero: entry.hero,
    classDef,
    equippedItems: entry.equippedItems,
    itemSets: catalog.itemSets,
    talentTree: entry.hero.characterId ? (catalog.characterTalentTrees[entry.hero.characterId]?.nodes ?? []) : [],
  });
  return Object.values(sheet).reduce((total, value) => total + value, 0);
}

export function PersonagensPanel() {
  const pve = useBattleStore((s) => s.pve);
  const pvp = useBattleStore((s) => s.pvp);
  const t = useBattleStore((s) => s.t);
  const enhanceInventoryItem = useBattleStore((s) => s.enhanceInventoryItem);
  const equipInventoryItem = useBattleStore((s) => s.equipInventoryItem);
  const awakenHero = useBattleStore((s) => s.awakenHero);
  const imprintHero = useBattleStore((s) => s.imprintHero);

  // Em quem "equipar" equipa. É seleção de tela (como o slot aberto em `InventoryPanel`), não
  // estado de conta: recarregar a página e voltar ao primeiro herói não perde nada.
  const [focoEscolhido, setFocoEscolhido] = useState<string | null>(null);
  const heroDoFoco = pvp.roster.find((e) => e.hero.id === focoEscolhido) ?? pvp.roster[0] ?? null;

  return (
    <section className="personagens-panel">
      <h2>{t('personagens.titulo')}</h2>

      <h3>{t('personagens.elenco')}</h3>
      <ul className="pve-roster">
        {pvp.roster.map((entry) => {
          const power = powerOf(entry);
          const rotulo = rotuloDeHeroi(t, entry.hero, catalog);
          return (
            <li key={entry.hero.id} className={heroDoFoco?.hero.id === entry.hero.id ? 'em-foco' : ''}>
              <label>
                <input
                  type="radio"
                  name="personagem-em-foco"
                  checked={heroDoFoco?.hero.id === entry.hero.id}
                  onChange={() => setFocoEscolhido(entry.hero.id)}
                />
                {rotulo.nome} <span className="hint">({rotulo.classe})</span>{' '}
                {/* M23 3/N — "a3 i1" era ilegível para quem chega: as duas letras são
                    despertar e vínculo, que são justamente os dois botões ao lado. */}
                <span className="hint" title={t('masmorra.heroiTitle')}>
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

      <h3>{t('personagens.equipamento')}</h3>
      {heroDoFoco ? (
        <p className="hint">{t('personagens.foco', { nome: rotuloDeHeroi(t, heroDoFoco.hero, catalog).nome })}</p>
      ) : null}
      {pve.economy && pve.economy.inventory.length > 0 ? (
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
                  onClick={() => heroDoFoco && void equipInventoryItem(heroDoFoco.hero.id, item.id)}
                  disabled={pve.busy || !heroDoFoco}
                >
                  {t('masmorra.equipar')}
                </button>
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="hint">{t('personagens.semItens')}</p>
      )}

      {pve.status ? <p className="pve-status">{pve.status}</p> : null}
      {pve.error ? <p className="error">{pve.error}</p> : null}
    </section>
  );
}
