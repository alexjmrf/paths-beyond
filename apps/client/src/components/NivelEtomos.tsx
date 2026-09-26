import { useState } from 'react';
import { MAX_LEVEL } from '@paths-beyond/core';
import { catalog } from '../data/catalog.js';
import { nomeDeConteudo } from '../i18n/conteudo.js';
import { useBattleStore } from '../store/battleStore.js';
import { Botao } from './ui.js';

// M39 1/N — o NÍVEL do herói em foco e os TOMOS DE EXPERIÊNCIA (o jeito mais eficiente de subir,
// decisão do usuário). A barra lê a curva do catálogo só para EXIBIR; quem aplica o exp é o
// servidor, com `aplicarExp` do core (regra 3).
export function NivelEtomos({ heroId }: { readonly heroId: string }) {
  const t = useBattleStore((s) => s.t);
  const entry = useBattleStore((s) => s.pvp.roster.find((e) => e.hero.id === heroId));
  const materials = useBattleStore((s) => s.pve.economy?.materials ?? {});
  const busy = useBattleStore((s) => s.pve.busy);
  const usarTomos = useBattleStore((s) => s.usarTomos);
  const [quantidades, setQuantidades] = useState<Readonly<Record<string, number>>>({});

  if (!entry) return null;
  const { level, exp } = entry.hero;
  const proximo = catalog.economyRules.experiencia?.expParaProximo[level - 1];
  const noTeto = level >= MAX_LEVEL;
  const tomos = Object.values(catalog.materials)
    .filter((m) => m.kind === 'expTome')
    .sort((a, b) => (a.exp ?? 0) - (b.exp ?? 0));

  return (
    <div className="nivel-e-tomos">
      <p className="nivel-linha">
        <strong>{t('personagens.nivel', { nivel: level })}</strong>{' '}
        {noTeto ? (
          <span className="hint">{t('personagens.nivelMaximo')}</span>
        ) : proximo ? (
          <span className="hint">{t('personagens.barraDeExp', { exp, proximo })}</span>
        ) : null}
      </p>
      {!noTeto && proximo ? (
        <div className="barra-de-exp" role="progressbar" aria-valuenow={exp} aria-valuemax={proximo}>
          <div className="barra-de-exp-cheia" style={{ width: `${Math.min(100, Math.floor((exp * 100) / proximo))}%` }} />
        </div>
      ) : null}
      <ul className="pve-inventory tomos">
        {tomos.map((tomo) => {
          const tem = materials[tomo.id] ?? 0;
          const quantidade = Math.min(quantidades[tomo.id] ?? 1, Math.max(tem, 1));
          return (
            <li key={tomo.id}>
              <span>
                {nomeDeConteudo(t, 'material', tomo.id, tomo.name)}{' '}
                <span className="hint">{t('personagens.tomoInfo', { exp: tomo.exp ?? 0, tem })}</span>
              </span>
              <span className="pve-actions">
                <input
                  type="number"
                  min={1}
                  max={Math.max(tem, 1)}
                  value={quantidade}
                  disabled={tem === 0 || noTeto}
                  aria-label={t('personagens.quantidade')}
                  onChange={(e) => setQuantidades({ ...quantidades, [tomo.id]: Math.max(1, Number(e.target.value) || 1) })}
                  className="tomo-quantidade"
                />
                <Botao disabled={busy || tem === 0 || noTeto} onClick={() => void usarTomos(heroId, tomo.id, quantidade)}>
                  {t('personagens.usarTomo')}
                </Botao>
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
