import { useEffect } from 'react';
import { useBattleStore } from '../store/battleStore.js';

// M35 5/N — a telinha de TRANSIÇÃO entre o lobby e uma tela: um véu com o nome do destino.
//
// O tempo mora aqui e só aqui: a store abre a transição (estado) e este overlay a conclui
// quando o véu terminou. Sem animação sofisticada agora — só o suficiente para "sair de um
// lugar e chegar em outro"; a passagem de estilo é futura, por decisão do usuário.
const DURACAO_MS = 450;

export function TransicaoOverlay() {
  const transicao = useBattleStore((s) => s.transicao);
  const concluirTransicao = useBattleStore((s) => s.concluirTransicao);
  const t = useBattleStore((s) => s.t);

  useEffect(() => {
    if (!transicao) return;
    const id = setTimeout(concluirTransicao, DURACAO_MS);
    return () => clearTimeout(id);
  }, [transicao, concluirTransicao]);

  if (!transicao) return null;
  return (
    <div className="transicao" role="status" aria-live="polite">
      <span className="transicao-nome">{transicao.para === 'lobby' ? t('lobby.titulo') : t(`menu.${transicao.para}`)}</span>
    </div>
  );
}
