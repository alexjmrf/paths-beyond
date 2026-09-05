import { describe, expect, it } from 'vitest';
import {
  IDIOMAS,
  IDIOMA_PADRAO,
  criarTradutor,
  idiomaDoNavegador,
  idiomaValido,
  type Catalogo,
} from '../src/i18n/idioma.js';

// §11/D24 (M25, sub-sessão 1/N) — a CAMADA DE IDIOMA.
//
// D24: a língua de lançamento é o inglês; português, espanhol, chinês e japonês depois. Hoje
// a UI é português cru dentro do JSX, e o custo de extrair cresce com cada tela nova — por
// isso esta milestone vem ANTES da demo de trinta missões (M27), e não depois.
//
// O motor é pequeno de propósito: procurar chave, cair para o inglês, interpolar. Nada de
// biblioteca — o que uma traria (detecção de região, formatação de data, carregamento
// assíncrono) este jogo não usa, e o que ele usa cabe em cem linhas testáveis.

const CATALOGOS: Readonly<Record<string, Catalogo>> = {
  en: { 'acao.esperar': 'Wait', 'unidade.ap': '{atual} of {maximo} AP', 'so.en': 'English only' },
  pt: { 'acao.esperar': 'Esperar', 'unidade.ap': '{atual} de {maximo} AP' },
};

describe('o conjunto de idiomas', () => {
  it('o inglês é o padrão — D24, língua de lançamento', () => {
    expect(IDIOMA_PADRAO).toBe('en');
  });

  it('declara os idiomas que a estrutura aceita, com inglês e português prontos', () => {
    expect(IDIOMAS).toContain('en');
    expect(IDIOMAS).toContain('pt');
  });

  it('idioma desconhecido é recusado — o valor pode vir do save ou do navegador', () => {
    expect(idiomaValido('pt')).toBe(true);
    expect(idiomaValido('klingon')).toBe(false);
    expect(idiomaValido(42)).toBe(false);
    expect(idiomaValido(undefined)).toBe(false);
  });
});

describe('criarTradutor()', () => {
  it('traduz pela chave no idioma ativo', () => {
    const t = criarTradutor('pt', CATALOGOS);
    expect(t('acao.esperar')).toBe('Esperar');
  });

  it('chave que falta no idioma ativo CAI PARA O INGLÊS, e não some da tela', () => {
    // Um idioma incompleto é o estado normal enquanto a tradução não terminou. Devolver
    // vazio deixaria botões sem rótulo; devolver a chave deixaria `acao.esperar` na tela.
    // Cair para a língua de lançamento é a única opção que ainda deixa o jogo jogável.
    const t = criarTradutor('pt', CATALOGOS);
    expect(t('so.en')).toBe('English only');
  });

  it('chave que não existe em lugar nenhum devolve a própria chave', () => {
    // Nunca vazio e nunca exceção: uma chave errada tem de aparecer na tela para ser
    // corrigida, não sumir em silêncio no meio de uma batalha.
    const t = criarTradutor('pt', CATALOGOS);
    expect(t('chave.que.nao.existe')).toBe('chave.que.nao.existe');
  });

  it('interpola os parâmetros nomeados', () => {
    const t = criarTradutor('pt', CATALOGOS);
    expect(t('unidade.ap', { atual: 2, maximo: 5 })).toBe('2 de 5 AP');
  });

  it('parâmetro que falta deixa o marcador VISÍVEL', () => {
    // Apagar o marcador daria "2 de  AP" e ninguém notaria; deixá-lo à mostra faz o erro
    // aparecer na primeira vez que alguém olhar a tela.
    const t = criarTradutor('pt', CATALOGOS);
    expect(t('unidade.ap', { atual: 2 })).toBe('2 de {maximo} AP');
  });

  it('o mesmo marcador repetido é substituído em todas as ocorrências', () => {
    const t = criarTradutor('en', { en: { eco: '{x} e {x}' } });
    expect(t('eco', { x: 'a' })).toBe('a e a');
  });

  it('idioma sem catálogo nenhum ainda funciona pelo inglês', () => {
    const t = criarTradutor('zz' as never, CATALOGOS);
    expect(t('acao.esperar')).toBe('Wait');
  });
});

describe('idiomaDoNavegador()', () => {
  // Só vale na PRIMEIRA abertura: depois disso quem manda é o save. Um jogador que escolheu
  // inglês num navegador em português não pode ser sobrescrito a cada recarga.
  it('reconhece a língua do navegador quando ela é uma das declaradas', () => {
    expect(idiomaDoNavegador('pt-BR')).toBe('pt');
    expect(idiomaDoNavegador('en-US')).toBe('en');
  });

  it('língua não declarada cai no padrão', () => {
    expect(idiomaDoNavegador('fr-FR')).toBe(IDIOMA_PADRAO);
    expect(idiomaDoNavegador(undefined)).toBe(IDIOMA_PADRAO);
  });
});
