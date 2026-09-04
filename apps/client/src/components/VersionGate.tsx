import { useEffect, useState } from 'react';
import type { RulesVersionMismatch } from '@paths-beyond/core';
import { onRulesVersionMismatch } from '../data/api.js';
import { lerEstadoDaAtualizacao, platformBridge } from '../data/platformBridge.js';

// §3.3/§9.4 (M22, sub-sessão 1/N) — a tela de ATUALIZAÇÃO OBRIGATÓRIA.
//
// **O que ela substitui.** O servidor recusava versão incompatível com um 409, e o 409
// virava a mesma mensagem de erro que qualquer outra falha: uma linha vermelha na tela de
// arena. Na web isso quase nunca aparecia, porque todo mundo recarregava a página. No
// desktop o jogador fica dias na mesma versão — e como o jogo é sempre-online, um cliente
// desatualizado não perde só a arena: ele perde a campanha e a masmorra também, porque as
// três reexecutam comandos no servidor.
//
// **Por que ela BLOQUEIA em vez de avisar.** Depois do mismatch, nenhuma batalha vai ser
// aceita. Deixar o jogador continuar clicando seria deixá-lo montar time, gastar tempo e
// levar o mesmo erro no fim — a tela honesta diz o que aconteceu e o que fazer.
//
// A política que a produz (`N-1` não é aceito) está em `packages/core/src/rulesVersionCompat.ts`.

export function VersionGate() {
  const [mismatch, setMismatch] = useState<RulesVersionMismatch | null>(null);
  const [atualizacaoPronta, setAtualizacaoPronta] = useState(false);

  useEffect(() => onRulesVersionMismatch(setMismatch), []);

  useEffect(() => {
    if (!mismatch) return;
    // Só pergunta ao shell quando há mismatch: o botão de reiniciar só faz sentido se o
    // shell JÁ baixou a versão nova (M21, 4/N). Se não baixou, reiniciar reabriria o mesmo
    // binário e o jogador levaria o mesmo erro.
    let vivo = true;
    void platformBridge.updateStatus?.().then((bruto) => {
      if (vivo) setAtualizacaoPronta(lerEstadoDaAtualizacao(bruto)?.fase === 'pronta');
    });
    return () => {
      vivo = false;
    };
  }, [mismatch]);

  if (!mismatch) return null;

  const noShell = typeof platformBridge.restartToUpdate === 'function';

  return (
    <div className="version-gate" role="alertdialog" aria-modal="true">
      <div className="version-gate-card">
        <h2>Atualize o jogo para continuar</h2>
        <p>
          {mismatch.reason === 'missing'
            ? 'Esta versão do jogo é anterior à checagem de regras do servidor.'
            : 'As regras do servidor mudaram desde a versão que você está rodando.'}{' '}
          Enquanto as duas não forem a mesma, nenhuma batalha pode ser resolvida — o servidor
          reexecuta cada partida para confirmar o resultado.
        </p>
        <p className="version-gate-detalhe">
          servidor: <strong>{mismatch.expected}</strong> · este cliente:{' '}
          <strong>{mismatch.received ?? 'não informada'}</strong>
        </p>

        {/* Três situações, três instruções — e nenhuma delas é "tente de novo", que é o que
            a mensagem de erro genérica dizia na prática. */}
        {noShell && atualizacaoPronta && (
          <button type="button" onClick={() => void platformBridge.restartToUpdate?.()}>
            Reiniciar e atualizar
          </button>
        )}
        {noShell && !atualizacaoPronta && (
          <p>A atualização está sendo baixada. Feche e reabra o jogo quando ela terminar.</p>
        )}
        {!noShell && <p>Recarregue a página para receber a versão nova.</p>}
      </div>
    </div>
  );
}
