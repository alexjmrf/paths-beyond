import type { Hero, SoulCost, SoulInstance } from '@paths-beyond/core';
import { useEffect, useState } from 'react';
import { catalog } from '../data/catalog.js';
import { nomeDeConteudo } from '../i18n/conteudo.js';
import { cliqueEmDoisTempos, custoDaSoul, estadoDoSlotDeSoul, soulDoHeroi, soulsDoPersonagem } from '../logic/soul.js';
import { useBattleStore } from '../store/battleStore.js';

// M39 5/N (D59/D61) — o 8º slot, a Soul do herói em foco. Trancada abaixo do nível do catálogo;
// aberta, mostra a equipada, as outras Souls DAQUELE personagem e o craft com o custo ao lado.
// Quem trava, cobra e sorteia é o servidor (regra 3); a tela só não oferece o que seria recusado.
//
// O recraft re-sorteia tudo e apaga a Soul atual (D59), e o descartar a apaga de vez (D64), então
// os dois pedem dois cliques na mesma Soul (decisão do usuário ao aprovar a 5/N). O armado
// desarma sozinho depois de alguns segundos.
const DESARMAR_EM_MS = 4000;

const resumoDaSoul = (soul: SoulInstance) =>
  `${soul.mainstat.stat.toUpperCase()} +${soul.mainstat.value} · ${soul.substats
    .map((s) => `${s.stat.toUpperCase()} +${s.value}`)
    .join(', ')}`;

export function SlotDeSoul({ hero }: { readonly hero: Hero }) {
  const t = useBattleStore((s) => s.t);
  const souls = useBattleStore((s) => s.pvp.souls);
  const busy = useBattleStore((s) => s.pve.busy);
  const economy = useBattleStore((s) => s.pve.economy);
  const craftarSoul = useBattleStore((s) => s.craftarSoul);
  const recraftarSoul = useBattleStore((s) => s.recraftarSoul);
  const equiparSoul = useBattleStore((s) => s.equiparSoul);
  const desequiparSoul = useBattleStore((s) => s.desequiparSoul);
  const descartarSoul = useBattleStore((s) => s.descartarSoul);
  const [armada, setArmada] = useState<string | null>(null);

  useEffect(() => {
    if (!armada) return;
    const timer = setTimeout(() => setArmada(null), DESARMAR_EM_MS);
    return () => clearTimeout(timer);
  }, [armada]);

  const regras = catalog.economyRules.soul;
  const characterId = hero.characterId;
  if (!regras || !characterId) return null;

  const estado = estadoDoSlotDeSoul(hero, regras);
  if (!estado.aberto) {
    return <p className="hint">{t('personagens.soulTrancada', { nivel: estado.nivelParaAbrir, atual: hero.level })}</p>;
  }

  const wallet = economy?.wallet ?? { gold: 0 };
  const materials = economy?.materials ?? {};
  const textoDoCusto = (cost: SoulCost) => {
    const custo = custoDaSoul(cost, wallet, materials);
    const partes = custo.materiais.map((m) =>
      t('personagens.custoMaterial', {
        nome: nomeDeConteudo(t, 'material', m.id, catalog.materials[m.id]?.name ?? m.id),
        tem: m.tem,
        precisa: m.precisa,
      }),
    );
    partes.push(t('personagens.custoOuro', { tem: custo.ouro.tem, precisa: custo.ouro.precisa }));
    return { texto: partes.join(' · '), basta: custo.basta };
  };
  const craft = textoDoCusto(regras.craftCost);
  const recraft = textoDoCusto(regras.recraftCost);

  const equipada = soulDoHeroi(hero, souls);
  const outras = soulsDoPersonagem(souls, characterId).filter((s) => s.id !== equipada?.id);

  const botaoDeRecraft = (soul: SoulInstance) => (
    <button
      type="button"
      disabled={busy || !recraft.basta}
      title={recraft.texto}
      onClick={() => {
        const clique = cliqueEmDoisTempos(armada, 'recraft', soul.id);
        setArmada(clique.armada);
        if (clique.enviar) void recraftarSoul(soul.id);
      }}
    >
      {armada === `recraft:${soul.id}` ? t('personagens.confirmarRecraft') : t('personagens.recraftarSoul')}
    </button>
  );

  // D64 — só nas Souls que não estão equipadas (o servidor recusa a equipada).
  const botaoDeDescartar = (soul: SoulInstance) => (
    <button
      type="button"
      disabled={busy}
      onClick={() => {
        const clique = cliqueEmDoisTempos(armada, 'descartar', soul.id);
        setArmada(clique.armada);
        if (clique.enviar) void descartarSoul(soul.id);
      }}
    >
      {armada === `descartar:${soul.id}` ? t('personagens.confirmarDescarte') : t('personagens.descartarSoul')}
    </button>
  );

  return (
    <div className="personagens-soul">
      {equipada ? (
        <ul className="pve-inventory">
          <li>
            <strong>{resumoDaSoul(equipada)}</strong>
            <span className="pve-actions">
              {botaoDeRecraft(equipada)}
              <button type="button" disabled={busy} onClick={() => void desequiparSoul(hero.id)}>
                {t('personagens.desequiparSoul')}
              </button>
            </span>
          </li>
        </ul>
      ) : (
        <p className="hint">{t('personagens.semSoul')}</p>
      )}
      {outras.length > 0 ? (
        <ul className="pve-inventory">
          {outras.map((soul) => (
            <li key={soul.id}>
              <span>{resumoDaSoul(soul)}</span>
              <span className="pve-actions">
                <button type="button" disabled={busy} onClick={() => void equiparSoul(soul.id, hero.id)}>
                  {t('personagens.equiparSoul')}
                </button>
                {botaoDeRecraft(soul)}
                {botaoDeDescartar(soul)}
              </span>
            </li>
          ))}
        </ul>
      ) : equipada ? null : (
        <p className="hint">{t('personagens.nenhumaSoul')}</p>
      )}
      <p className="nivel-linha">
        <button type="button" disabled={busy || !craft.basta} onClick={() => void craftarSoul(characterId)}>
          {t('personagens.craftarSoul')}
        </button>{' '}
        <span className="hint">{t('personagens.custo', { custo: craft.texto })}</span>
      </p>
      <p className="hint">{t('personagens.custoRecraft', { custo: recraft.texto })}</p>
    </div>
  );
}
