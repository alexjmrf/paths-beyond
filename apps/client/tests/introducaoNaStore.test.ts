import { describe, expect, it } from 'vitest';
import { saveProjection } from '../src/store/battleStore.js';
import { marcarIntroducaoVista, proximaIntroducao } from '../src/logic/introducao.js';

// §1.1 (M23, sub-sessão 1/N) — a introdução ATRAVESSANDO o save.
//
// A lógica tem teste próprio (`introducao.test.ts`); o que falta afirmar é a costura: o que
// o jogador dispensou precisa entrar na projeção que vai para o disco. Sem isso ele reveria
// as cinco dicas a cada recarga, que é pior do que não ter dica nenhuma.

describe('a projeção do save', () => {
  it('leva as introduções vistas', () => {
    const projecao = saveProjection({
      instantResultMode: false,
      colorblindMode: false,
      uiScale: 1,
      pvp: { token: 'token' } as never,
      introducoesVistas: ['preview-de-duelo', 'recursos-ap-pp'],
      volumeEfeitos: 0.7,
      volumeMusica: 0.5,
      idiomaEscolhido: null,
    });

    expect(projecao.introducoesVistas).toEqual(['preview-de-duelo', 'recursos-ap-pp']);
    // A versão do formato acompanha o save: v5 desde o M25, que acrescentou o idioma.
    expect(projecao.v).toBe(5);
  });

  it('o ciclo fecha: dispensar uma dica a tira das próximas vezes', () => {
    // O mesmo caminho que a store percorre — disparar, fechar, gravar, recarregar.
    const depoisDeFechar = marcarIntroducaoVista([], 'preview-de-duelo');
    const gravado = saveProjection({
      instantResultMode: false,
      colorblindMode: false,
      uiScale: 1,
      pvp: { token: '' } as never,
      introducoesVistas: depoisDeFechar,
      volumeEfeitos: 0.7,
      volumeMusica: 0.5,
      idiomaEscolhido: null,
    });

    expect(proximaIntroducao('preview-de-duelo', gravado.introducoesVistas)).toBeNull();
    expect(proximaIntroducao('script-tatico', gravado.introducoesVistas)).not.toBeNull();
  });
});
