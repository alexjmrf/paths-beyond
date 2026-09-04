import { describe, expect, it } from 'vitest';
import {
  sincronizarConquistas,
  sincronizarPedidoDoRenderer,
  type PlatformAchievements,
} from '../src/achievements.js';

// §9.4 (M21, sub-sessão 3/N) — a sincronização das conquistas com a plataforma.
//
// **O que é provável nesta máquina e o que não é, dito antes dos testes.** Desbloquear de
// verdade exige App ID de parceiro, o cliente da loja aberto e o módulo nativo compilado —
// nada disso existe aqui. O que existe, e é onde mora o comportamento, é a costura: a porta
// injetada, no mesmo padrão de `now`, `newNonce` e do validador de identidade do M20.
//
// Os quatro modos de falha que este arquivo trava são os que estragariam o jogo em silêncio:
// re-desbloquear tudo a cada abertura, deixar de desbloquear o que já estava cumprido antes
// da conquista existir, uma conquista quebrada levando as outras nove junto, e a plataforma
// ausente derrubando o jogo.

// Uma plataforma de mentira que se comporta como a de verdade: `activate` é idempotente lá,
// e o que se quer observar é quantas vezes ela foi chamada.
function plataformaFalsa(jaDesbloqueadas: readonly string[] = []) {
  const estado = new Set(jaDesbloqueadas);
  const chamadas: string[] = [];

  const porta: PlatformAchievements = {
    estaDesbloqueada: (nome) => estado.has(nome),
    desbloquear: (nome) => {
      chamadas.push(nome);
      estado.add(nome);
    },
  };

  return { porta, chamadas, estado };
}

const AS_DEZ = [
  'ACH_PRIMEIRO_PASSO',
  'ACH_A_ESTRADA_ABERTA',
  'ACH_A_FORTALEZA_CAIU',
  'ACH_MAOS_A_OBRA',
  'ACH_FAXINA_COMPLETA',
  'ACH_COMPANHIA_CRESCENDO',
  'ACH_ELENCO_COMPLETO',
  'ACH_MARCA_DO_VINCULO',
  'ACH_DESPERTO',
  'ACH_NOME_NA_ARENA',
];

describe('sincronizarConquistas()', () => {
  // A retroatividade que o M18 4/N desenhou para a moeda, agora valendo para a plataforma:
  // quem cumpriu tudo antes de o espelho existir desbloqueia as dez de uma vez.
  it('é RETROATIVA — dez conquistas cumpridas com a plataforma zerada desbloqueiam de uma vez', async () => {
    const { porta, chamadas, estado } = plataformaFalsa();

    const resultado = await sincronizarConquistas(AS_DEZ, porta);

    expect(resultado.desbloqueadas).toHaveLength(10);
    expect(chamadas).toEqual(AS_DEZ);
    expect(estado.size).toBe(10);
    expect(resultado.falhas).toEqual([]);
    expect(resultado.indisponivel).toBe(false);
  });

  it('é IDEMPOTENTE — a segunda sincronização não chama a plataforma', async () => {
    // Ela roda a cada sign-in e a cada leitura de prêmios. Sem isso, seriam dez chamadas a
    // cada abertura do jogo pelo resto da vida da conta.
    const { porta, chamadas } = plataformaFalsa();
    await sincronizarConquistas(AS_DEZ, porta);
    chamadas.length = 0;

    const segunda = await sincronizarConquistas(AS_DEZ, porta);

    expect(chamadas).toEqual([]);
    expect(segunda.desbloqueadas).toEqual([]);
    expect(segunda.jaEstavam).toHaveLength(10);
  });

  it('desbloqueia só o que falta, e não mexe no que já está lá', async () => {
    const { porta, chamadas } = plataformaFalsa(['ACH_PRIMEIRO_PASSO']);

    const resultado = await sincronizarConquistas(['ACH_PRIMEIRO_PASSO', 'ACH_MAOS_A_OBRA'], porta);

    expect(chamadas).toEqual(['ACH_MAOS_A_OBRA']);
    expect(resultado.desbloqueadas).toEqual(['ACH_MAOS_A_OBRA']);
    expect(resultado.jaEstavam).toEqual(['ACH_PRIMEIRO_PASSO']);
  });

  it('uma conquista que a plataforma recusa não leva as outras junto', async () => {
    // O modo de falha real: um `platformId` autorado com um nome que não existe no backend
    // de parceiro. Ele é UMA conquista quebrada, e não pode custar as outras nove.
    const recusadas = new Set(['ACH_NOME_ERRADO']);
    const desbloqueadas: string[] = [];
    const porta: PlatformAchievements = {
      estaDesbloqueada: () => false,
      desbloquear: (nome) => {
        if (recusadas.has(nome)) throw new Error('nome desconhecido na plataforma');
        desbloqueadas.push(nome);
      },
    };

    const resultado = await sincronizarConquistas(['ACH_PRIMEIRO_PASSO', 'ACH_NOME_ERRADO', 'ACH_DESPERTO'], porta);

    expect(desbloqueadas).toEqual(['ACH_PRIMEIRO_PASSO', 'ACH_DESPERTO']);
    expect(resultado.falhas).toEqual(['ACH_NOME_ERRADO']);
  });

  it('não conseguir LER o estado não impede de escrever', async () => {
    // Desbloquear é idempotente na plataforma. Desistir por causa da pergunta deixaria a
    // conquista de fora por um motivo que não é o dela.
    const desbloqueadas: string[] = [];
    const porta: PlatformAchievements = {
      estaDesbloqueada: () => {
        throw new Error('sem sessão para consultar');
      },
      desbloquear: (nome) => {
        desbloqueadas.push(nome);
      },
    };

    const resultado = await sincronizarConquistas(['ACH_DESPERTO'], porta);

    expect(desbloqueadas).toEqual(['ACH_DESPERTO']);
    expect(resultado.desbloqueadas).toEqual(['ACH_DESPERTO']);
  });

  it('a plataforma AUSENTE é estado normal, e não uma exceção', async () => {
    // Jogo aberto pelo executável direto, loja fechada, módulo nativo faltando: o jogador
    // continua jogando, e a única diferença é que o perfil dele não muda.
    const resultado = await sincronizarConquistas(AS_DEZ, null);

    expect(resultado.indisponivel).toBe(true);
    expect(resultado.desbloqueadas).toEqual([]);
    expect(resultado.falhas).toEqual([]);
  });

  it('lista vazia não fala com a plataforma', async () => {
    const { porta, chamadas } = plataformaFalsa();

    const resultado = await sincronizarConquistas([], porta);

    expect(chamadas).toEqual([]);
    expect(resultado.indisponivel).toBe(false);
  });

  it('duplicata na entrada vira uma chamada só', async () => {
    const { porta, chamadas } = plataformaFalsa();

    await sincronizarConquistas(['ACH_DESPERTO', 'ACH_DESPERTO'], porta);

    expect(chamadas).toEqual(['ACH_DESPERTO']);
  });
});

describe('sincronizarPedidoDoRenderer()', () => {
  // O renderer é o processo que carrega a página, e é o menos confiável do shell. Um payload
  // torto não pode derrubar o processo principal — que é quem segura a janela do jogo.
  it('payload que não é lista não chama a plataforma nem lança', async () => {
    const { porta, chamadas } = plataformaFalsa();

    for (const lixo of [undefined, null, 'ACH_DESPERTO', 42, { 0: 'ACH_DESPERTO' }]) {
      const resultado = await sincronizarPedidoDoRenderer(lixo, porta);
      expect(resultado.desbloqueadas).toEqual([]);
    }

    expect(chamadas).toEqual([]);
  });

  it('descarta o que não tem a forma de um espelho, e aceita o resto', async () => {
    // O mesmo `^[A-Z0-9_]+$` que o schema de `packages/data` exige do `platformId`. Deixar
    // passar seria mandar à plataforma um nome que ela vai recusar de qualquer jeito.
    const { porta, chamadas } = plataformaFalsa();

    await sincronizarPedidoDoRenderer(['ACH_DESPERTO', 'ach-minusculo', 7, null, 'ACH_MAOS_A_OBRA'], porta);

    expect(chamadas).toEqual(['ACH_DESPERTO', 'ACH_MAOS_A_OBRA']);
  });
});
