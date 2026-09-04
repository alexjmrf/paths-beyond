import { describe, expect, it } from 'vitest';
import { RULES_VERSION } from '../src/rulesVersion.js';
import {
  RULES_VERSION_MISMATCH_CODE,
  checkRulesVersion,
  isRulesVersionMismatch,
} from '../src/rulesVersionCompat.js';

// §3.3/§9.4 (M22, sub-sessão 1/N) — a POLÍTICA de compatibilidade de versão de regras.
//
// Até aqui a comparação era uma linha solta em `battle/routes.ts` (`body.rulesVersion !==
// RULES_VERSION`) e existia em um lugar só; `POST /dungeons/:id/run` reexecuta comandos do
// cliente e não tinha campo nenhum para comparar. Com sempre-online e desktop, o mismatch
// deixou de matar só a arena: toda batalha faz round-trip, então ele mata o jogo inteiro.
//
// **A política, decidida com o usuário: NÃO se aceita `N-1`.** O motivo é do próprio
// projeto — o servidor re-simula o replay e compara hash, e `rulesVersion` só muda quando
// uma fórmula muda. Aceitar o cliente de ontem seria manter dois motores de regra vivos ao
// mesmo tempo, e o resultado de uma partida dependeria de qual deles rodou. A resposta certa
// para a janela de rollout não é aceitar o cliente velho: é mandar atualizar, com uma tela
// que diz isso.

describe('checkRulesVersion()', () => {
  it('a mesma versão passa', () => {
    expect(checkRulesVersion(RULES_VERSION)).toBeNull();
  });

  it('versão diferente é recusada, e diz as duas versões', () => {
    // O cliente precisa das duas para dizer alguma coisa útil na tela; um 409 com string
    // solta não dá a ele nada além de "deu erro".
    const mismatch = checkRulesVersion('0.18.0', '0.19.0');

    expect(mismatch).toEqual({
      code: RULES_VERSION_MISMATCH_CODE,
      reason: 'different',
      expected: '0.19.0',
      received: '0.18.0',
    });
  });

  // A decisão registrada, em forma de teste: nada de janela de tolerância.
  it('N-1 NÃO é aceito — nem o patch anterior, nem o seguinte', () => {
    expect(checkRulesVersion('0.18.0', '0.19.0')).not.toBeNull();
    expect(checkRulesVersion('0.19.1', '0.19.0')).not.toBeNull();
    expect(checkRulesVersion('0.20.0', '0.19.0')).not.toBeNull();
  });

  it('versão AUSENTE é recusada como ausente, e não como diferente', () => {
    // `POST /dungeons/:id/run` nunca teve o campo (registrado no M17 5/N). Um cliente que
    // não manda a versão é um cliente anterior à checagem — e distinguir isso de "mandou
    // outra" é o que permite a tela dizer a coisa certa.
    for (const vazio of [undefined, null, '']) {
      expect(checkRulesVersion(vazio), String(vazio)).toEqual({
        code: RULES_VERSION_MISMATCH_CODE,
        reason: 'missing',
        expected: RULES_VERSION,
        received: null,
      });
    }
  });

  it('o que não é string é ausência, não erro', () => {
    // O corpo vem de rede: um número ou um objeto no lugar da versão é entrada hostil, e
    // lançar aqui transformaria uma requisição inválida em erro 500 do servidor.
    expect(checkRulesVersion(42)).toMatchObject({ reason: 'missing', received: null });
    expect(checkRulesVersion({ rulesVersion: '0.19.0' })).toMatchObject({ reason: 'missing' });
  });

  it('o padrão de `expected` é a versão deste core', () => {
    expect(checkRulesVersion('nao-e-versao')).toMatchObject({ expected: RULES_VERSION });
  });
});

describe('isRulesVersionMismatch()', () => {
  // O cliente recebe o corpo do erro como `unknown` e precisa saber se aquilo é "atualize o
  // jogo" ou um erro qualquer. Reconhecer por CÓDIGO e não por mensagem: mensagem é texto
  // para humano, muda de redação, e uma tela que depende dela quebra em silêncio.
  it('reconhece o corpo do erro pelo código', () => {
    expect(isRulesVersionMismatch(checkRulesVersion('0.18.0'))).toBe(true);
    expect(isRulesVersionMismatch({ code: RULES_VERSION_MISMATCH_CODE, expected: '1', received: null })).toBe(true);
  });

  it('não confunde outro erro do servidor com pedido de atualização', () => {
    expect(isRulesVersionMismatch({ error: 'rate limit exceeded' })).toBe(false);
    expect(isRulesVersionMismatch({ code: 'outra-coisa' })).toBe(false);
    expect(isRulesVersionMismatch(null)).toBe(false);
    expect(isRulesVersionMismatch('rules-version-mismatch')).toBe(false);
  });
});
