import { artifactRank } from '@paths-beyond/core';
import { useState } from 'react';
import type { ArtifactInstanceView } from '../data/api.js';
import { catalog } from '../data/catalog.js';
import { nomeDeConteudo } from '../i18n/conteudo.js';
import { NivelEtomos } from './NivelEtomos.js';
import { SlotDeSoul } from './SlotDeSoul.js';
import { poderDoHeroi } from '../logic/poder.js';
import { rotuloDeHeroi } from '../logic/rotulos.js';
import { useBattleStore } from '../store/battleStore.js';

// M35 1/N (D41) — a aba Personagens: o elenco E o equipamento, "só isso mesmo" (decisão do
// usuário ao aprovar o plano — Equipamento não é aba própria).
//
// Os dois blocos vieram de `DungeonPanel`, que até aqui misturava "Seu time", as masmorras e
// o inventário num painel só (§10, M14 5/N). Nada mudou de regra: despertar, vínculo, aprimorar
// e equipar continuam sendo chamadas de rota, e o servidor é quem decide (regra 3).

// O "poder" ao lado do herói é `poderDoHeroi` (logic/poder.ts): o mesmo cálculo da batalha,
// com talento, artefato e Soul.

export function PersonagensPanel() {
  const pve = useBattleStore((s) => s.pve);
  const pvp = useBattleStore((s) => s.pvp);
  const t = useBattleStore((s) => s.t);
  const enhanceInventoryItem = useBattleStore((s) => s.enhanceInventoryItem);
  const equipInventoryItem = useBattleStore((s) => s.equipInventoryItem);
  const awakenHero = useBattleStore((s) => s.awakenHero);
  const imprintHero = useBattleStore((s) => s.imprintHero);
  const equiparArtefato = useBattleStore((s) => s.equiparArtefato);
  const desequiparArtefato = useBattleStore((s) => s.desequiparArtefato);
  const despertarArtefato = useBattleStore((s) => s.despertarArtefato);
  const imprintArtefato = useBattleStore((s) => s.imprintArtefato);

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
          const power = poderDoHeroi(entry, pvp.artifacts, pvp.souls);
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

      {/* M38 4/N (D53/D56) — o slot de artefato do herói em foco. Só aparecem os artefatos da
          CLASSE dele (a trava é do servidor; a tela só não oferece o que seria recusado).
          Equipar um que está em outro herói MOVE o artefato, e a tela diz com quem ele está. */}
      {/* M39 1/N — o nível do herói em foco e os tomos de experiência. */}
      <h3>{t('personagens.nivelTitulo')}</h3>
      {heroDoFoco ? <NivelEtomos heroId={heroDoFoco.hero.id} /> : null}

      <h3>{t('personagens.artefato')}</h3>
      {heroDoFoco ? (
        <SlotDeArtefato
          heroId={heroDoFoco.hero.id}
          classId={heroDoFoco.hero.classId}
          equipado={heroDoFoco.hero.artifact ?? null}
          busy={pve.busy}
          aoEquipar={(instanceId) => void equiparArtefato(instanceId, heroDoFoco.hero.id)}
          aoDesequipar={() => void desequiparArtefato(heroDoFoco.hero.id)}
          aoDespertar={(instanceId) => void despertarArtefato(instanceId)}
          aoVincular={(instanceId) => void imprintArtefato(instanceId)}
        />
      ) : null}

      {/* M39 5/N — o 8º slot. Herói sem personagem não tem Soul, e o bloco some. */}
      {heroDoFoco?.hero.characterId ? (
        <>
          <h3>{t('personagens.soul')}</h3>
          <SlotDeSoul hero={heroDoFoco.hero} />
        </>
      ) : null}

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

const ROTULO_DO_RANK_CORRENTE = {
  adventurer: 'summon.rankAdventurer',
  hero: 'summon.rankHero',
  legend: 'summon.rankLegend',
} as const;

interface SlotDeArtefatoProps {
  readonly heroId: string;
  readonly classId: string;
  readonly equipado: string | null;
  readonly busy: boolean;
  readonly aoEquipar: (instanceId: string) => void;
  readonly aoDesequipar: () => void;
  readonly aoDespertar: (instanceId: string) => void;
  readonly aoVincular: (instanceId: string) => void;
}

function SlotDeArtefato(props: SlotDeArtefatoProps) {
  const t = useBattleStore((s) => s.t);
  const artefatos = useBattleStore((s) => s.pvp.artifacts);
  const roster = useBattleStore((s) => s.pvp.roster);

  const nome = (artifactId: string) =>
    nomeDeConteudo(t, 'artefato', artifactId, catalog.artifacts[artifactId]?.name ?? artifactId);
  // O rank corrente é FUNÇÃO do awakening (`artifactRank` do core), nunca campo gravado.
  const resumo = (instance: ArtifactInstanceView) => {
    const def = catalog.artifacts[instance.artifactId];
    return t('personagens.artefatoResumo', {
      nome: nome(instance.artifactId),
      rank: def ? t(ROTULO_DO_RANK_CORRENTE[artifactRank(def, instance)]) : '',
      despertar: instance.awakening,
      vinculo: instance.imprint,
    });
  };
  const comQuem = (instanceId: string) =>
    roster.find((entry) => entry.hero.id !== props.heroId && entry.hero.artifact === instanceId) ?? null;

  const equipado = artefatos.find((a) => a.id === props.equipado) ?? null;
  const daClasse = artefatos.filter(
    (a) => a.id !== props.equipado && catalog.artifacts[a.artifactId]?.classId === props.classId,
  );

  return (
    <div className="personagens-artefato">
      {/* A mesma linha da lista abaixo (texto à esquerda, ações à direita), com o equipado em
          destaque — visto no navegador: os botões dele ficavam embaixo do texto. */}
      {equipado ? (
        <ul className="pve-inventory">
          <li>
          <strong>{resumo(equipado)}</strong>
          <span className="pve-actions">
            <button type="button" disabled={props.busy} onClick={() => props.aoDespertar(equipado.id)}>
              {t('masmorra.despertar')}
            </button>
            <button type="button" disabled={props.busy} onClick={() => props.aoVincular(equipado.id)}>
              {t('masmorra.vinculo')}
            </button>
            <button type="button" disabled={props.busy} onClick={props.aoDesequipar}>
              {t('personagens.desequiparArtefato')}
            </button>
          </span>
          </li>
        </ul>
      ) : (
        <p className="hint">{t('personagens.semArtefato')}</p>
      )}
      {daClasse.length > 0 ? (
        <ul className="pve-inventory">
          {daClasse.map((instance) => {
            const outro = comQuem(instance.id);
            return (
              <li key={instance.id}>
                <span>
                  {resumo(instance)}{' '}
                  {outro ? (
                    <span className="hint">
                      {t('personagens.emOutroHeroi', { nome: rotuloDeHeroi(t, outro.hero, catalog).nome })}
                    </span>
                  ) : null}
                </span>
                <span className="pve-actions">
                  <button type="button" disabled={props.busy} onClick={() => props.aoEquipar(instance.id)}>
                    {t('personagens.equiparArtefato')}
                  </button>
                  <button type="button" disabled={props.busy} onClick={() => props.aoDespertar(instance.id)}>
                    {t('masmorra.despertar')}
                  </button>
                  <button type="button" disabled={props.busy} onClick={() => props.aoVincular(instance.id)}>
                    {t('masmorra.vinculo')}
                  </button>
                </span>
              </li>
            );
          })}
        </ul>
      ) : equipado ? null : (
        <p className="hint">{t('personagens.nenhumArtefatoDaClasse')}</p>
      )}
    </div>
  );
}
