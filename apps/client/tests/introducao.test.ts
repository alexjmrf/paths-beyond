import { describe, expect, it } from 'vitest';
import { CATALOGOS } from '../src/i18n/catalogos.js';
import { IDIOMAS } from '../src/i18n/idioma.js';
import {
  GATILHOS_DA_INTRODUCAO,
  INTRODUCOES,
  marcarIntroducaoVista,
  proximaIntroducao,
  type GatilhoDeIntroducao,
} from '../src/logic/introducao.js';

// §1.1/§11 (M23, sub-sessão 1/N) — a INTRODUÇÃO contextual.
//
// O roadmap é explícito sobre a forma: a introdução explica duelo, AP/PP e script tático
// **no ponto em que cada um aparece pela primeira vez, e não num paredão de texto inicial**.
// Isso faz dela uma máquina pequena e pura — "dado este gatilho e o que já foi visto, o que
// se mostra agora?" —, e é essa parte que roda em teste.
//
// O pilar em jogo é o de §1.1, legibilidade tática: o jogador tem de conseguir prever o
// resultado antes de confirmar. Um jogo que explica duelo depois do primeiro duelo já falhou
// nesse pilar, mesmo tendo explicado.

describe('o catálogo da introdução', () => {
  it('cobre os três conceitos que o roadmap nomeia', () => {
    const gatilhos = INTRODUCOES.map((i) => i.gatilho);

    expect(gatilhos).toContain('preview-de-duelo');
    expect(gatilhos).toContain('recursos-ap-pp');
    expect(gatilhos).toContain('script-tatico');
  });

  it('nenhum gatilho tem duas introduções — duas caixas ao mesmo tempo é ruído', () => {
    expect(new Set(INTRODUCOES.map((i) => i.gatilho)).size).toBe(INTRODUCOES.length);
  });

  // M25 — o texto virou chave, então o teste passou a medir o CATÁLOGO. E ele mede em todas
  // as línguas: o paredão que o roadmap proíbe não fica menor traduzido.
  it('toda introdução tem título e texto EM TODA LÍNGUA, e o texto é curto', () => {
    for (const introducao of INTRODUCOES) {
      for (const idioma of IDIOMAS) {
        const titulo = CATALOGOS[idioma][introducao.tituloChave];
        const texto = CATALOGOS[idioma][introducao.textoChave];
        const onde = `${idioma}:${introducao.gatilho}`;

        expect(titulo, onde).toBeTruthy();
        expect(texto, onde).toBeTruthy();
        // O limite é o ponto do roadmap virado em asserção: passar disto é o paredão de texto
        // que a milestone existe para não ter.
        expect(texto!.length, onde).toBeLessThanOrEqual(320);
      }
    }
  });

  it('todo gatilho declarado tem introdução, e vice-versa', () => {
    // A lista de gatilhos é o que o resto do cliente importa para disparar. Um gatilho sem
    // texto seria um ponto do jogo que promete explicar e não explica.
    expect([...GATILHOS_DA_INTRODUCAO].sort()).toEqual(INTRODUCOES.map((i) => i.gatilho).sort());
  });
});

describe('proximaIntroducao()', () => {
  it('mostra a introdução do gatilho quando ela ainda não foi vista', () => {
    const introducao = proximaIntroducao('preview-de-duelo', []);

    expect(introducao?.gatilho).toBe('preview-de-duelo');
  });

  it('NÃO mostra de novo depois de vista', () => {
    // O jogador que já entendeu não pode ser interrompido de novo — é a diferença entre
    // introdução e incômodo.
    const vistos = marcarIntroducaoVista([], 'preview-de-duelo');

    expect(proximaIntroducao('preview-de-duelo', vistos)).toBeNull();
  });

  it('cada conceito é independente — ver um não consome os outros', () => {
    const vistos = marcarIntroducaoVista([], 'preview-de-duelo');

    expect(proximaIntroducao('recursos-ap-pp', vistos)?.gatilho).toBe('recursos-ap-pp');
  });

  it('gatilho desconhecido não mostra nada, e não lança', () => {
    // Os gatilhos vêm de chamadas espalhadas pela UI; um nome errado tem de virar silêncio,
    // não uma tela quebrada no meio de uma batalha.
    expect(proximaIntroducao('gatilho-que-nao-existe' as GatilhoDeIntroducao, [])).toBeNull();
  });
});

describe('marcarIntroducaoVista()', () => {
  it('acumula sem repetir', () => {
    const uma = marcarIntroducaoVista([], 'script-tatico');
    const duas = marcarIntroducaoVista(uma, 'script-tatico');

    expect(duas).toEqual(['script-tatico']);
  });

  it('preserva o que já estava lá, inclusive o que este cliente não conhece', () => {
    // O save pode vir de uma versão mais nova do jogo. Descartar o desconhecido faria o
    // jogador rever, na versão antiga, uma introdução que ele já dispensou na nova.
    const vistos = marcarIntroducaoVista(['introducao-do-futuro'], 'recursos-ap-pp');

    expect(vistos).toContain('introducao-do-futuro');
    expect(vistos).toContain('recursos-ap-pp');
  });
});
