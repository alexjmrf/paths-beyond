import { describe, expect, it } from 'vitest';
import {
  ATUALIZACAO_OCIOSA,
  contextoDoAmbiente,
  decidirVerificacao,
  ligarAtualizacao,
  reduzirAtualizacao,
  type AtualizadorDePlataforma,
  type EstadoDaAtualizacao,
  type EventoDeAtualizacao,
} from '../src/updates.js';

// §2/§9.4 (M21, sub-sessão 4/N) — o auto-update.
//
// **O que é provável em `pnpm test` e o que não é.** Baixar de verdade exige artefato
// publicado num host; isso foi provado à parte, com dois instaladores e um servidor local
// (ver `DECISIONS.md`, M21 4/N). O que roda aqui é o que decide o comportamento: quando
// verificar, o que a tela mostra em cada ordem de evento, e o que acontece quando dá errado.

function rodar(eventos: readonly EventoDeAtualizacao[], inicial: EstadoDaAtualizacao = ATUALIZACAO_OCIOSA) {
  return eventos.reduce(reduzirAtualizacao, inicial);
}

describe('decidirVerificacao()', () => {
  it('build direto empacotado verifica', () => {
    expect(decidirVerificacao({ empacotado: true, loja: false, desligadoPorConfig: false }).verificar).toBe(true);
  });

  it('fora do pacote NÃO verifica — não há binário para trocar', () => {
    // O laço de desenvolvimento roda `main.js` do workspace desde a 1/N. Verificar ali daria
    // erro do updater em toda abertura, e nenhum deles seria um problema de verdade.
    const decisao = decidirVerificacao({ empacotado: false, loja: false, desligadoPorConfig: false });

    expect(decisao.verificar).toBe(false);
    expect(decisao.motivo).toContain('fora do pacote');
  });

  it('dentro da LOJA não verifica — dois atualizadores no mesmo diretório é corrupção', () => {
    // A decisão de canal do M21 4/N: a loja atualiza o build dela, e o `electron-updater`
    // vale para o build direto. Se os dois agirem, a verificação de arquivos da loja desfaz
    // o que o nosso baixou, e o nosso rebaixa de novo.
    const decisao = decidirVerificacao({ empacotado: true, loja: true, desligadoPorConfig: false });

    expect(decisao.verificar).toBe(false);
    expect(decisao.motivo).toContain('loja');
  });

  it('a saída de emergência por configuração desliga sem recompilar', () => {
    expect(decidirVerificacao({ empacotado: true, loja: false, desligadoPorConfig: true }).verificar).toBe(false);
  });

  it('o App ID de plataforma é o sinal de "estou numa loja" — o mesmo da 3/N', () => {
    expect(contextoDoAmbiente(true, { PATHS_BEYOND_STEAM_APP_ID: '480' }).loja).toBe(true);
    expect(contextoDoAmbiente(true, {}).loja).toBe(false);
    // String vazia ou só espaço é ausência, e não "loja com App ID em branco".
    expect(contextoDoAmbiente(true, { PATHS_BEYOND_STEAM_APP_ID: '   ' }).loja).toBe(false);
  });
});

describe('reduzirAtualizacao()', () => {
  it('o caminho feliz vai de ocioso a pronta', () => {
    const estado = rodar([
      { tipo: 'verificando' },
      { tipo: 'disponivel', versao: '0.0.2' },
      { tipo: 'progresso', porcento: 42.7 },
      { tipo: 'baixada', versao: '0.0.2' },
    ]);

    expect(estado).toEqual({ fase: 'pronta', versao: '0.0.2' });
  });

  it('baixando carrega a versão que está descendo', () => {
    const estado = rodar([{ tipo: 'disponivel', versao: '0.0.2' }, { tipo: 'progresso', porcento: 10.4 }]);

    expect(estado).toEqual({ fase: 'baixando', versao: '0.0.2', porcento: 10 });
  });

  it('o progresso é inteiro e não passa de 100', () => {
    // O updater reporta acima de 100 quando o servidor manda `content-length` errado, e uma
    // barra em 103% é a coisa mais barata de evitar.
    expect(rodar([{ tipo: 'progresso', porcento: 103.4 }])).toMatchObject({ porcento: 100 });
    expect(rodar([{ tipo: 'progresso', porcento: -1 }])).toMatchObject({ porcento: 0 });
  });

  // A regra que mais importa deste arquivo.
  it('`pronta` é ABSORVENTE — um erro depois não apaga a atualização já baixada', () => {
    // O binário já está no disco e já foi conferido por sha512. A verificação seguinte
    // falhando por rede não pode fazer a tela esquecer que há o que instalar: o jogador
    // clicaria em nada.
    const pronta = rodar([{ tipo: 'baixada', versao: '0.0.2' }]);

    expect(rodar([{ tipo: 'erro', mensagem: 'ENOTFOUND' }], pronta)).toEqual(pronta);
    expect(rodar([{ tipo: 'indisponivel' }], pronta)).toEqual(pronta);
    expect(rodar([{ tipo: 'verificando' }], pronta)).toEqual(pronta);
  });

  it('erro vira ESTADO, e não exceção', () => {
    expect(rodar([{ tipo: 'erro', mensagem: 'servidor de update fora do ar' }])).toEqual({
      fase: 'erro',
      mensagem: 'servidor de update fora do ar',
    });
  });
});

// Um atualizador de mentira com a mesma forma do `electron-updater`: registra ouvintes por
// evento e deixa o teste dispará-los na ordem que quiser.
function atualizadorFalso() {
  const ouvintes = new Map<string, ((...args: never[]) => void)[]>();
  let verificacoes = 0;
  let reinicios = 0;
  let falharAoVerificar: Error | null = null;

  const atualizador: AtualizadorDePlataforma = {
    ao: (evento: string, ouvinte: (...args: never[]) => void) => {
      ouvintes.set(evento, [...(ouvintes.get(evento) ?? []), ouvinte]);
    },
    verificarEBaixar: async () => {
      verificacoes += 1;
      if (falharAoVerificar) throw falharAoVerificar;
      return null;
    },
    reiniciarEInstalar: () => {
      reinicios += 1;
    },
  } as AtualizadorDePlataforma;

  return {
    atualizador,
    emitir: (evento: string, ...args: unknown[]) => {
      for (const ouvinte of ouvintes.get(evento) ?? []) (ouvinte as (...a: unknown[]) => void)(...args);
    },
    get verificacoes() {
      return verificacoes;
    },
    get reinicios() {
      return reinicios;
    },
    falhar: (erro: Error) => {
      falharAoVerificar = erro;
    },
  };
}

describe('ligarAtualizacao()', () => {
  const DIRETO = { empacotado: true, loja: false, desligadoPorConfig: false };

  it('avisa a tela a cada mudança, e só quando muda', async () => {
    const falso = atualizadorFalso();
    const vistos: EstadoDaAtualizacao[] = [];
    const controle = ligarAtualizacao(falso.atualizador, DIRETO, (estado) => vistos.push(estado));

    await controle.verificar();
    falso.emitir('checking-for-update');
    falso.emitir('update-available', { version: '0.0.2' });
    falso.emitir('download-progress', { percent: 50 });
    falso.emitir('download-progress', { percent: 50 });
    falso.emitir('update-downloaded', { version: '0.0.2' });

    expect(vistos.map((e) => e.fase)).toEqual(['ocioso', 'verificando', 'disponivel', 'baixando', 'pronta']);
    expect(controle.estado()).toEqual({ fase: 'pronta', versao: '0.0.2' });
  });

  it('dentro da loja nem chama o atualizador', async () => {
    const falso = atualizadorFalso();
    const controle = ligarAtualizacao(falso.atualizador, { ...DIRETO, loja: true });

    await controle.verificar();
    controle.reiniciarEInstalar();

    expect(falso.verificacoes).toBe(0);
    expect(falso.reinicios).toBe(0);
    expect(controle.estado()).toMatchObject({ fase: 'desligado' });
  });

  it('reiniciar SÓ instala o que já está pronto', async () => {
    // Um botão que fecha o jogo sem trocar nada é a pior coisa que um botão pode fazer.
    const falso = atualizadorFalso();
    const controle = ligarAtualizacao(falso.atualizador, DIRETO);

    controle.reiniciarEInstalar();
    expect(falso.reinicios).toBe(0);

    falso.emitir('update-downloaded', { version: '0.0.2' });
    controle.reiniciarEInstalar();
    expect(falso.reinicios).toBe(1);
  });

  it('a verificação que REJEITA não derruba o processo principal', async () => {
    // O `electron-updater` emite `error` e rejeita a promise. Uma rejeição não tratada no
    // processo que segura a janela do jogo é o jogo fechando por causa de um update.
    const falso = atualizadorFalso();
    falso.falhar(new Error('getaddrinfo ENOTFOUND updates.pathsbeyond.example'));
    const controle = ligarAtualizacao(falso.atualizador, DIRETO);

    await expect(controle.verificar()).resolves.toBeUndefined();
    expect(controle.estado()).toMatchObject({ fase: 'erro' });
  });
});
