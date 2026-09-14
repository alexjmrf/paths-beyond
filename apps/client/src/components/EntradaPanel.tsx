import { useBattleStore } from '../store/battleStore.js';

// M32 — a ENTRADA: sem sessão, a única coisa na tela.
//
// O sign-in vivia dentro de `PvpPanel`, num painel chamado "PvP — arena", e Campanha,
// Masmorras e Invocação diziam "entre no painel de PvP". Entrar não tem nada a ver com PvP:
// é a primeira ação do jogo, e o M20 a fez explícita de propósito (é ela que cria a conta e
// entrega o núcleo). O que muda aqui é só ONDE ela está e o que existe em volta — nada.
//
// Um botão só, e ele é a ação principal. `acaoPrincipal.test.ts` trava isso.
export function EntradaPanel() {
  const pvp = useBattleStore((s) => s.pvp);
  const t = useBattleStore((s) => s.t);
  const connectPvp = useBattleStore((s) => s.connectPvp);

  return (
    <section className="tela-de-entrada">
      <h2>{t('app.titulo')}</h2>
      <p className="entrada-chamada">{t('entrada.chamada')}</p>
      <button type="button" className="acao-principal" onClick={() => void connectPvp()} disabled={pvp.busy}>
        {t('entrada.entrar')}
      </button>
      {/* §9.4 (M20) — não há mais o que digitar: quem diz quem você é é a plataforma. */}
      <p className="hint">{t('entrada.identidade')}</p>
      {pvp.status ? <p className="pvp-status">{pvp.status}</p> : null}
      {pvp.error ? <p className="error">{pvp.error}</p> : null}
    </section>
  );
}
