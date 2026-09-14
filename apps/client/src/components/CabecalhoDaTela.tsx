import type { AbaDoHub } from '../logic/tela.js';
import { useBattleStore } from '../store/battleStore.js';

// M35 5/N — a barra fina no topo de cada tela do hub: "← Voltar" e o nome da tela. Voltar passa
// pela mesma transição que trouxe o jogador até aqui.
export function CabecalhoDaTela({ tela }: { readonly tela: AbaDoHub }) {
  const voltarAoLobby = useBattleStore((s) => s.voltarAoLobby);
  const t = useBattleStore((s) => s.t);
  return (
    <div className="cabecalho-da-tela">
      <button type="button" className="voltar" onClick={voltarAoLobby}>
        {t('lobby.voltar')}
      </button>
      <span className="cabecalho-nome">{t(`menu.${tela}`)}</span>
    </div>
  );
}
