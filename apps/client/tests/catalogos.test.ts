import { describe, expect, it } from 'vitest';
import { CATALOGOS } from '../src/i18n/catalogos.js';
import { IDIOMAS, IDIOMA_PADRAO } from '../src/i18n/idioma.js';

// §11/D24 (M25, 1/N) — os catálogos conferidos um contra o outro.
//
// **É o critério de aceite do M25 em forma de teste:** "existe teste que reprova chave
// faltando em qualquer idioma declarado e chave órfã que ninguém usa". A metade das órfãs
// depende da varredura do JSX (fatia 2/N); a metade da completude é aqui, e é a que impede o
// modo de falha mais comum de i18n — uma tela que fica em inglês no meio do jogo em português
// porque alguém acrescentou a chave num arquivo só.

const chavesDe = (idioma: string) => Object.keys(CATALOGOS[idioma as keyof typeof CATALOGOS] ?? {}).sort();

describe('os catálogos', () => {
  it('todo idioma declarado tem catálogo', () => {
    for (const idioma of IDIOMAS) {
      expect(CATALOGOS[idioma], idioma).toBeDefined();
    }
  });

  it('todos os catálogos têm exatamente as MESMAS chaves', () => {
    const referencia = chavesDe(IDIOMA_PADRAO);
    expect(referencia.length).toBeGreaterThan(10);

    for (const idioma of IDIOMAS) {
      // A mensagem nomeia o idioma porque o erro real é sempre "faltou traduzir X em Y", e
      // um diff de duas listas grandes sem rótulo não diz qual é qual.
      expect(chavesDe(idioma), `chaves de ${idioma} contra ${IDIOMA_PADRAO}`).toEqual(referencia);
    }
  });

  it('nenhuma tradução é vazia — vazio vira botão sem rótulo', () => {
    for (const idioma of IDIOMAS) {
      for (const [chave, texto] of Object.entries(CATALOGOS[idioma])) {
        expect(texto.trim(), `${idioma}:${chave}`).not.toBe('');
      }
    }
  });

  it('os marcadores de interpolação são os MESMOS em todas as línguas', () => {
    // O modo de falha que isto pega: a tradução esquece `{versao}` e o jogador vê a frase sem
    // o número, ou inventa `{version}` e o marcador aparece cru na tela. A ORDEM pode mudar
    // (é o motivo de os marcadores serem nomeados), o conjunto não.
    const marcadores = (texto: string) => (texto.match(/\{(\w+)\}/g) ?? []).sort();

    for (const [chave, textoPadrao] of Object.entries(CATALOGOS[IDIOMA_PADRAO])) {
      for (const idioma of IDIOMAS) {
        expect(marcadores(CATALOGOS[idioma][chave] ?? ''), `${idioma}:${chave}`).toEqual(marcadores(textoPadrao));
      }
    }
  });
});
