import { useEffect } from 'react';
import { acaoDoEsc } from '../logic/pausa.js';
import { telaDoJogo } from '../logic/tela.js';
import { useBattleStore } from '../store/battleStore.js';
import { Botao, Modal, Painel } from './ui.js';

// M35 9/N (adiantada a pedido do usuário) — O MENU DE PAUSA da batalha.
//
// Dentro da missão, só o campo de batalha. Sair, recomeçar e as opções moram aqui, abertos pelo
// Esc ou pelo botão ☰ no canto. Quem decide o que o Esc faz é `logic/pausa.ts`; quem decide o
// que sair e recomeçar fazem no servidor é a store. O componente só desenha e escuta a tecla.
export function PausaMenu() {
  const t = useBattleStore((s) => s.t);
  const pausaAberta = useBattleStore((s) => s.pausaAberta);
  const mode = useBattleStore((s) => s.mode);
  const partida = useBattleStore((s) => s.partida);
  const outcome = useBattleStore((s) => s.battleState.outcome);
  const pvpOutcome = useBattleStore((s) => s.pvp.outcome);
  const alternarPausa = useBattleStore((s) => s.alternarPausa);
  const fecharPausa = useBattleStore((s) => s.fecharPausa);
  const opcoesDaPausa = useBattleStore((s) => s.opcoesDaPausa);
  const sairDaMissao = useBattleStore((s) => s.sairDaMissao);
  const recomecarMissao = useBattleStore((s) => s.recomecarMissao);
  const reviewPvpBattle = useBattleStore((s) => s.reviewPvpBattle);

  // O Esc é do documento inteiro, e a regra do que ele faz é a de `acaoDoEsc`.
  useEffect(() => {
    function aoTeclar(evento: KeyboardEvent) {
      if (evento.key !== 'Escape') return;
      const estado = useBattleStore.getState();
      const acao = acaoDoEsc({
        tela: telaDoJogo(estado),
        opcoesAbertas: estado.opcoesAbertas,
        pausaAberta: estado.pausaAberta,
      });
      if (acao === 'fecharOpcoes') estado.fecharOpcoes();
      else if (acao === 'alternarPausa') estado.alternarPausa();
    }
    document.addEventListener('keydown', aoTeclar);
    return () => document.removeEventListener('keydown', aoTeclar);
  }, []);

  const acabou = outcome !== 'ongoing';

  return (
    <>
      <Botao className="abrir-pausa" onClick={alternarPausa} title={t('pausa.dica')}>
        {t('pausa.abrir')}
      </Botao>
      <Modal aberto={pausaAberta}>
        <Painel titulo={t('pausa.titulo')} className="pausa-menu">
          <div className="pausa-acoes">
            <Botao variante="primario" onClick={fecharPausa}>
              {t('pausa.continuar')}
            </Botao>
            {mode === 'campaign' && partida && !acabou ? (
              <Botao onClick={() => void recomecarMissao()}>{t('pausa.recomecar')}</Botao>
            ) : null}
            {mode === 'pvp' && acabou && pvpOutcome ? (
              <Botao onClick={() => void reviewPvpBattle()}>{t('pausa.reverReplay')}</Botao>
            ) : null}
            <Botao onClick={opcoesDaPausa}>{t('pausa.opcoes')}</Botao>
            {/* Sair no meio DESISTE, sem devolver o que foi pago ao entrar (D48). Depois do fim,
                é só voltar. */}
            <Botao variante={acabou ? 'secundario' : 'perigo'} onClick={() => void sairDaMissao()}>
              {acabou ? t('pausa.voltar') : t('pausa.sair')}
            </Botao>
          </div>
          {!acabou ? <p className="hint">{t('pausa.avisoDesistir')}</p> : null}
        </Painel>
      </Modal>
    </>
  );
}
