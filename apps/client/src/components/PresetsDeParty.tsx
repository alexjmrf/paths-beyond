import { useState } from 'react';
import { catalog } from '../data/catalog.js';
import { rotuloDeHeroi } from '../logic/rotulos.js';
import { useBattleStore } from '../store/battleStore.js';

// M35 3/N (D42) — o seletor de PRESETS no passo "quem vai".
//
// Oito slots, vindos do servidor (`presets.slots`), desenhados sempre — os vazios inclusive,
// porque "salvar aqui" precisa de um lugar para apontar. Usar um preset preenche as vagas da
// missão e o jogador ainda troca por cima (a seleção é a de sempre, `toggleCampaignHero`);
// salvar guarda a seleção ATUAL no slot, com o nome que ele digitar. Nada aqui decide regra:
// posse e tamanho são do servidor, e a store apara às vagas ao aplicar.
export function PresetsDeParty() {
  const presets = useBattleStore((s) => s.presets);
  const roster = useBattleStore((s) => s.pvp.roster);
  const t = useBattleStore((s) => s.t);
  const aplicarPreset = useBattleStore((s) => s.aplicarPreset);
  const salvarPreset = useBattleStore((s) => s.salvarPreset);
  const apagarPreset = useBattleStore((s) => s.apagarPreset);

  // O nome digitado por slot é seleção de tela (como o foco em `PersonagensPanel`): vai para o
  // servidor ao salvar e não precisa sobreviver a nada.
  const [nomes, setNomes] = useState<Readonly<Record<number, string>>>({});

  const nomeDoHeroi = (heroId: string): string => {
    const entry = roster.find((e) => e.hero.id === heroId);
    return entry ? rotuloDeHeroi(t, entry.hero, catalog).nome : heroId;
  };

  const slots = Array.from({ length: presets.slots }, (_, i) => i + 1);

  return (
    <div className="presets-de-party">
      <h4>{t('presets.titulo')}</h4>
      <p className="hint">{t('presets.dica')}</p>
      <ol className="presets-lista">
        {slots.map((slot) => {
          const preset = presets.lista.find((p) => p.slot === slot);
          return (
            <li key={slot} className={preset ? 'preset cheio' : 'preset vazio'}>
              {preset ? (
                <>
                  <span className="preset-nome">
                    <strong>{preset.name}</strong>{' '}
                    <span className="hint">({preset.heroIds.map(nomeDoHeroi).join(', ')})</span>
                  </span>
                  <span className="pve-actions">
                    <button type="button" onClick={() => aplicarPreset(slot)} disabled={presets.busy}>
                      {t('presets.aplicar')}
                    </button>
                    <button type="button" onClick={() => void salvarPreset(slot, nomes[slot] ?? preset.name)} disabled={presets.busy}>
                      {t('presets.salvarAqui')}
                    </button>
                    <button type="button" onClick={() => void apagarPreset(slot)} disabled={presets.busy}>
                      {t('presets.apagar')}
                    </button>
                  </span>
                </>
              ) : (
                <>
                  <span className="preset-nome hint">{t('presets.vazio', { slot })}</span>
                  <span className="pve-actions">
                    <input
                      type="text"
                      value={nomes[slot] ?? ''}
                      placeholder={t('presets.nome')}
                      maxLength={24}
                      onChange={(e) => setNomes({ ...nomes, [slot]: e.target.value })}
                    />
                    <button
                      type="button"
                      onClick={() => void salvarPreset(slot, (nomes[slot] ?? '').trim() || t('presets.nomePadrao', { slot }))}
                      disabled={presets.busy}
                    >
                      {t('presets.salvarAqui')}
                    </button>
                  </span>
                </>
              )}
            </li>
          );
        })}
      </ol>
      {presets.error ? <p className="error">{presets.error}</p> : null}
    </div>
  );
}
