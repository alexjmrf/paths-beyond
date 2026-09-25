import { useState } from 'react';
import { useBattleStore } from '../store/battleStore.js';
import { Botao } from './ui.js';

// M35 3/N (D42) — os PRESETS de party, estado de conta no servidor (8 slots).
//
// M35 8/N — COMPACTOS: os oito slots sempre abertos, cada um com campo e botão, ocupavam mais
// tela que a própria escolha de quem vai. Agora é um seletor ("Usar preset…") que aplica ao
// escolher, "Apagar" para o escolhido, e "Salvar como…" que abre um formulário curto (nome e
// slot, o primeiro vazio por padrão). O preset é ponto de partida: os retratos continuam sendo a
// seleção.
export function PresetsDeParty() {
  const presets = useBattleStore((s) => s.presets);
  const t = useBattleStore((s) => s.t);
  const aplicarPreset = useBattleStore((s) => s.aplicarPreset);
  const salvarPreset = useBattleStore((s) => s.salvarPreset);
  const apagarPreset = useBattleStore((s) => s.apagarPreset);

  const [escolhido, setEscolhido] = useState<number | null>(null);
  const [salvando, setSalvando] = useState(false);
  const slots = Array.from({ length: presets.slots }, (_, i) => i + 1);
  const primeiroVazio = slots.find((slot) => !presets.lista.some((p) => p.slot === slot)) ?? 1;
  const [slotAlvo, setSlotAlvo] = useState<number>(primeiroVazio);
  const [nome, setNome] = useState('');

  return (
    <div className="presets-compactos">
      <select
        aria-label={t('presets.titulo')}
        value={escolhido ?? ''}
        disabled={presets.busy || presets.lista.length === 0}
        onChange={(e) => {
          const slot = Number(e.target.value);
          if (!slot) return;
          setEscolhido(slot);
          aplicarPreset(slot);
        }}
      >
        <option value="">{presets.lista.length === 0 ? t('presets.nenhum') : t('presets.escolher')}</option>
        {presets.lista.map((p) => (
          <option key={p.slot} value={p.slot}>
            {p.name}
          </option>
        ))}
      </select>
      {escolhido !== null ? (
        <Botao
          variante="perigo"
          disabled={presets.busy}
          onClick={() => {
            void apagarPreset(escolhido);
            setEscolhido(null);
          }}
        >
          {t('presets.apagar')}
        </Botao>
      ) : null}
      {salvando ? (
        <span className="presets-salvar">
          <input
            type="text"
            value={nome}
            placeholder={t('presets.nome')}
            maxLength={24}
            onChange={(e) => setNome(e.target.value)}
          />
          <select aria-label={t('presets.slotRotulo')} value={slotAlvo} onChange={(e) => setSlotAlvo(Number(e.target.value))}>
            {slots.map((slot) => {
              const ocupado = presets.lista.find((p) => p.slot === slot);
              return (
                <option key={slot} value={slot}>
                  {ocupado ? t('presets.slotOcupado', { slot, nome: ocupado.name }) : t('presets.slotLivre', { slot })}
                </option>
              );
            })}
          </select>
          <Botao
            disabled={presets.busy}
            onClick={() => {
              void salvarPreset(slotAlvo, nome.trim() || t('presets.nomePadrao', { slot: slotAlvo }));
              setSalvando(false);
              setNome('');
            }}
          >
            {t('presets.salvar')}
          </Botao>
          <Botao onClick={() => setSalvando(false)}>{t('presets.cancelar')}</Botao>
        </span>
      ) : (
        <Botao
          disabled={presets.busy}
          onClick={() => {
            setSlotAlvo(primeiroVazio);
            setSalvando(true);
          }}
        >
          {t('presets.salvarComo')}
        </Botao>
      )}
      {presets.error ? <p className="error">{presets.error}</p> : null}
    </div>
  );
}
