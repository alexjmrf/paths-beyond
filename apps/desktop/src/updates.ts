// §2/§9.4 (M21, sub-sessão 4/N) — o AUTO-UPDATE.
//
// **Por que ele é obrigatório neste jogo e não uma conveniência.** O projeto é sempre-online:
// toda batalha faz round-trip, o servidor re-simula o replay e compara hash, e um cliente com
// `rulesVersion` velha leva 409 em tudo (`battle/routes.ts`). Na web ninguém notava porque
// todo mundo recarregava a página; no desktop, um jogador fica semanas na mesma versão. Sem
// atualização automática, a única forma de o jogo continuar jogável seria o jogador reparar
// sozinho que precisa baixar de novo.
//
// **A decisão de canal, registrada em `DECISIONS.md`:** dentro de uma loja, quem atualiza é a
// loja. Dois atualizadores mexendo no mesmo diretório de instalação é corrupção garantida — a
// verificação de arquivos da loja desfaz o que o nosso baixou, e o nosso rebaixa de novo. O
// `electron-updater` vale para o build DIRETO.

export type EstadoDaAtualizacao =
  | { readonly fase: 'ocioso' }
  | { readonly fase: 'desligado'; readonly motivo: string }
  | { readonly fase: 'verificando' }
  | { readonly fase: 'sem-atualizacao' }
  | { readonly fase: 'disponivel'; readonly versao: string }
  | { readonly fase: 'baixando'; readonly versao: string; readonly porcento: number }
  | { readonly fase: 'pronta'; readonly versao: string }
  | { readonly fase: 'erro'; readonly mensagem: string };

export type EventoDeAtualizacao =
  | { readonly tipo: 'verificando' }
  | { readonly tipo: 'disponivel'; readonly versao: string }
  | { readonly tipo: 'indisponivel' }
  | { readonly tipo: 'progresso'; readonly porcento: number }
  | { readonly tipo: 'baixada'; readonly versao: string }
  | { readonly tipo: 'erro'; readonly mensagem: string };

export const ATUALIZACAO_OCIOSA: EstadoDaAtualizacao = { fase: 'ocioso' };

/**
 * O estado que a tela mostra, a partir dos eventos do atualizador.
 *
 * É um reducer puro pelo motivo de sempre neste projeto: os eventos chegam de rede, em ordem
 * que não se controla, e a única forma de afirmar o que a tela mostra em cada ordem possível
 * é poder rodá-los em teste.
 */
export function reduzirAtualizacao(estado: EstadoDaAtualizacao, evento: EventoDeAtualizacao): EstadoDaAtualizacao {
  const proximo = calcular(estado, evento);
  // Estado que não mudou devolve o MESMO objeto, e quem observa compara por identidade. O
  // progresso do download chega dezenas de vezes com o mesmo inteiro depois do
  // arredondamento; sem isto, cada um deles viraria uma mensagem para o renderer redesenhar
  // a mesma barra.
  return JSON.stringify(proximo) === JSON.stringify(estado) ? estado : proximo;
}

function calcular(estado: EstadoDaAtualizacao, evento: EventoDeAtualizacao): EstadoDaAtualizacao {
  // **`pronta` é absorvente, e essa é a regra que mais importa aqui.** O binário já está no
  // disco e já foi conferido por sha512; a verificação seguinte falhando por rede não pode
  // fazer a tela esquecer que há uma atualização instalável — o jogador clicaria em nada.
  if (estado.fase === 'pronta') return estado;

  switch (evento.tipo) {
    case 'verificando':
      return { fase: 'verificando' };
    case 'indisponivel':
      return { fase: 'sem-atualizacao' };
    case 'disponivel':
      return { fase: 'disponivel', versao: evento.versao };
    case 'progresso': {
      // O progresso chega como fração com casas decimais e a tela mostra um número inteiro.
      // Limitado a [0, 100] porque o updater reporta > 100 quando o servidor manda o
      // `content-length` errado — e uma barra em 103% é a coisa mais barata de evitar.
      const porcento = Math.max(0, Math.min(100, Math.round(evento.porcento)));
      const versao = estado.fase === 'disponivel' || estado.fase === 'baixando' ? estado.versao : '';
      return { fase: 'baixando', versao, porcento };
    }
    case 'baixada':
      return { fase: 'pronta', versao: evento.versao };
    case 'erro':
      // Erro de atualização NUNCA é erro do jogo: ele vira estado, e quem decide se mostra
      // alguma coisa é a tela. Servidor de update fora do ar não pode impedir de jogar.
      return { fase: 'erro', mensagem: evento.mensagem };
  }
}

export interface ContextoDeAtualizacao {
  // `app.isPackaged`. Rodando do workspace não existe binário para trocar, e o updater
  // reclamaria em toda abertura do laço de desenvolvimento.
  readonly empacotado: boolean;
  // O jogo foi aberto por uma loja (o mesmo sinal da 3/N: o App ID de plataforma). Lá, quem
  // atualiza é ela.
  readonly loja: boolean;
  // A saída de emergência: uma máquina que precisa ficar numa versão fixa (o job de
  // determinismo do CI, uma investigação de bug) sem recompilar nada.
  readonly desligadoPorConfig: boolean;
}

export function decidirVerificacao(ctx: ContextoDeAtualizacao): { readonly verificar: boolean; readonly motivo: string } {
  if (!ctx.empacotado) return { verificar: false, motivo: 'rodando fora do pacote' };
  if (ctx.loja) return { verificar: false, motivo: 'a loja da plataforma atualiza este build' };
  if (ctx.desligadoPorConfig) return { verificar: false, motivo: 'desligado por configuração' };
  return { verificar: true, motivo: 'build direto empacotado' };
}

export function contextoDoAmbiente(empacotado: boolean, env: NodeJS.ProcessEnv = process.env): ContextoDeAtualizacao {
  return {
    empacotado,
    loja: typeof env.PATHS_BEYOND_STEAM_APP_ID === 'string' && env.PATHS_BEYOND_STEAM_APP_ID.trim().length > 0,
    desligadoPorConfig: env.PATHS_BEYOND_SEM_AUTOUPDATE === '1',
  };
}

// A porta, no mesmo padrão da 3/N: o que o `electron-updater` faz, reduzido ao que este
// projeto usa. É ela que torna a máquina de estados provável sem servidor de update.
export interface AtualizadorDePlataforma {
  ao(evento: 'checking-for-update' | 'update-not-available', ouvinte: () => void): void;
  ao(evento: 'update-available' | 'update-downloaded', ouvinte: (info: { version: string }) => void): void;
  ao(evento: 'download-progress', ouvinte: (progresso: { percent: number }) => void): void;
  ao(evento: 'error', ouvinte: (erro: Error) => void): void;
  verificarEBaixar(): Promise<unknown>;
  // Instala e reabre o jogo. Só é chamado a pedido do jogador — instalar sozinho no meio de
  // uma partida custaria a partida.
  reiniciarEInstalar(): void;
}

export interface ControleDeAtualizacao {
  readonly estado: () => EstadoDaAtualizacao;
  readonly verificar: () => Promise<void>;
  readonly reiniciarEInstalar: () => void;
}

/**
 * Liga a atualização automática, ou explica por que não ligou.
 *
 * Nada aqui lança: uma falha de atualização é sempre um estado, nunca uma exceção que sobe
 * até o processo que segura a janela do jogo.
 */
export function ligarAtualizacao(
  atualizador: AtualizadorDePlataforma,
  ctx: ContextoDeAtualizacao,
  aoMudar: (estado: EstadoDaAtualizacao) => void = () => {},
): ControleDeAtualizacao {
  const decisao = decidirVerificacao(ctx);
  let estado: EstadoDaAtualizacao = decisao.verificar ? ATUALIZACAO_OCIOSA : { fase: 'desligado', motivo: decisao.motivo };
  aoMudar(estado);

  if (!decisao.verificar) {
    return {
      estado: () => estado,
      verificar: async () => {},
      // Sem verificação não há o que instalar; chamar isso aqui reiniciaria o jogo sem
      // trocar nada, que é a pior coisa que um botão pode fazer.
      reiniciarEInstalar: () => {},
    };
  }

  const aplicar = (evento: EventoDeAtualizacao): void => {
    const proximo = reduzirAtualizacao(estado, evento);
    if (proximo === estado) return;
    estado = proximo;
    aoMudar(estado);
  };

  atualizador.ao('checking-for-update', () => aplicar({ tipo: 'verificando' }));
  atualizador.ao('update-not-available', () => aplicar({ tipo: 'indisponivel' }));
  atualizador.ao('update-available', (info) => aplicar({ tipo: 'disponivel', versao: info.version }));
  atualizador.ao('download-progress', (p) => aplicar({ tipo: 'progresso', porcento: p.percent }));
  atualizador.ao('update-downloaded', (info) => aplicar({ tipo: 'baixada', versao: info.version }));
  atualizador.ao('error', (erro) => aplicar({ tipo: 'erro', mensagem: erro.message }));

  return {
    estado: () => estado,
    verificar: async () => {
      try {
        await atualizador.verificarEBaixar();
      } catch (erro) {
        // O `electron-updater` emite `error` E rejeita a promise. Engolir aqui evita uma
        // rejeição não tratada derrubando o processo principal; o estado já foi escrito pelo
        // evento.
        aplicar({ tipo: 'erro', mensagem: erro instanceof Error ? erro.message : String(erro) });
      }
    },
    reiniciarEInstalar: () => {
      // Só instala o que já está no disco e conferido. Pedir para instalar antes disso
      // fecharia o jogo para não trocar nada.
      if (estado.fase !== 'pronta') return;
      atualizador.reiniciarEInstalar();
    },
  };
}
