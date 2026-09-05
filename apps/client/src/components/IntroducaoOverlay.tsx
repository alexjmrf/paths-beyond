import { useBattleStore } from '../store/battleStore.js';

// §1.1/§11 (M23, sub-sessão 1/N) — a caixa da introdução contextual.
//
// **Ela aparece ao lado do que está explicando, e não no lugar dele.** Um modal que cobre a
// tela obrigaria o jogador a fechar antes de olhar o que a caixa descreve — e o texto só faz
// sentido com a tela dele na frente. Por isso um cartão no canto, com a tela viva atrás.
//
// Uma por vez: a store recusa disparar uma segunda enquanto a primeira estiver aberta, senão
// duas dicas simultâneas viram, por acidente, o paredão de texto que a milestone proíbe.

export function IntroducaoOverlay() {
  const introducao = useBattleStore((s) => s.introducaoAtual);
  const fechar = useBattleStore((s) => s.fecharIntroducao);
  const t = useBattleStore((s) => s.t);

  if (!introducao) return null;

  return (
    <aside className="introducao" role="note">
      <h3>{t(introducao.tituloChave)}</h3>
      <p>{t(introducao.textoChave)}</p>
      {/* "Entendi" e não "fechar": o botão é o que marca a dica como vista, e o jogador
          precisa saber que ela não volta. */}
      <button type="button" onClick={fechar}>
        {t('introducao.entendi')}
      </button>
    </aside>
  );
}
