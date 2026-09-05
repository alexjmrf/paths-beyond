import { useEffect, useState } from 'react';
import { lerEstadoDaAtualizacao, platformBridge, type EstadoDaAtualizacao } from '../data/platformBridge.js';
import { useBattleStore } from '../store/battleStore.js';

// §2/§9.4 (M21, sub-sessão 4/N) — o aviso de ATUALIZAÇÃO.
//
// O shell baixa sozinho e instala ao sair; este componente existe para o jogador não ter de
// sair para receber a versão nova. Ele é a única parte do auto-update que o jogador vê, e por
// isso mostra pouco: **o que está acontecendo, e um botão só quando há o que instalar.**
//
// Fora do shell ele não renderiza nada — no navegador, atualizar é recarregar a página.

export function UpdateBanner() {
  const t = useBattleStore((s) => s.t);
  const [estado, setEstado] = useState<EstadoDaAtualizacao | null>(null);

  useEffect(() => {
    // A tela pode montar DEPOIS de a atualização já ter baixado (o shell verifica na
    // abertura), e pode estar aberta quando ela baixa. Por isso os dois: uma leitura ao
    // montar e uma assinatura para o que vier.
    let vivo = true;
    void platformBridge.updateStatus?.().then((bruto) => {
      if (vivo) setEstado(lerEstadoDaAtualizacao(bruto));
    });

    const desinscrever = platformBridge.onUpdateStatus?.((bruto) => setEstado(lerEstadoDaAtualizacao(bruto)));
    return () => {
      vivo = false;
      desinscrever?.();
    };
  }, []);

  if (!estado) return null;

  // Ocioso, desligado, verificando, sem atualização e ERRO não viram nada na tela. O jogador
  // não tem o que fazer com nenhum deles, e um aviso vermelho de "falha ao verificar
  // atualização" no meio de uma campanha só assusta — o shell tenta de novo sozinho.
  if (estado.fase !== 'disponivel' && estado.fase !== 'baixando' && estado.fase !== 'pronta') return null;

  return (
    <div className="update-banner" role="status">
      {estado.fase === 'disponivel' && <span>{t('atualizacao.encontrada', { versao: estado.versao })}</span>}
      {estado.fase === 'baixando' && (
        <span>{t('atualizacao.baixando', { versao: estado.versao, porcento: estado.porcento })}</span>
      )}
      {estado.fase === 'pronta' && (
        <>
          <span>{t('atualizacao.pronta', { versao: estado.versao })}</span>
          {/* O reinício é do JOGADOR. Reiniciar sozinho fecharia o jogo com uma batalha em
              curso — e a batalha está no servidor, então ele perderia o que estava ganhando.
              Quem não clicar recebe a atualização ao fechar o jogo, sem fazer nada. */}
          <button type="button" onClick={() => void platformBridge.restartToUpdate?.()}>
            {t('atualizacao.reiniciarAgora')}
          </button>
        </>
      )}
    </div>
  );
}
