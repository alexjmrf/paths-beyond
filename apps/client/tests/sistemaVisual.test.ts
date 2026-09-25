import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { classeDoBotao, ICONES_DO_LOBBY } from '../src/components/ui.js';
import { ABAS_DO_HUB } from '../src/logic/tela.js';

// M35 6/N — o sistema visual "tático clássico".
//
// O que se trava aqui é FORMA, não gosto: que os tokens existam e sejam usados, que a paleta
// neutra antiga não volte a ser escrita à mão (é o que fazia metade das telas parecer
// formulário), e que os componentes base mapeiem as variantes sem inventar classe.

const theme = readFileSync(new URL('../src/theme.css', import.meta.url), 'utf8');
const style = readFileSync(new URL('../src/style.css', import.meta.url), 'utf8');

describe('os tokens do tático clássico', () => {
  it('declara as cores, a fonte de título e a moldura', () => {
    for (const token of ['--cor-fundo', '--cor-painel', '--cor-borda', '--cor-texto', '--cor-ouro', '--fonte-titulo', '--moldura']) {
      expect(theme, token).toContain(`${token}:`);
    }
  });

  it('a fonte de título é empacotada (Cinzel via @fontsource), nunca de CDN', () => {
    expect(theme).toContain("@import '@fontsource/cinzel");
    expect(theme + style).not.toMatch(/fonts\.googleapis|fonts\.gstatic/);
  });

  it('a paleta neutra antiga não é mais escrita à mão em style.css — só por token', () => {
    const antigas = ['#0b1220', '#111827', '#1f2937', '#374151', '#4b5563', '#6b7280', '#9ca3af', '#d1d5db', '#e5e7eb'];
    for (const cor of antigas) expect(style.toLowerCase(), cor).not.toContain(cor);
  });

  it('o botão base existe: o botão nativo branco não sobra em tela nenhuma', () => {
    expect(theme).toMatch(/^button \{/m);
  });
});

describe('os componentes base', () => {
  it('cada variante de botão tem a sua classe, e a primária é a ação principal (D40)', () => {
    expect(classeDoBotao('secundario')).toBe('ui-botao');
    expect(classeDoBotao('primario')).toBe('ui-botao ui-botao-primario acao-principal');
    expect(classeDoBotao('perigo')).toBe('ui-botao ui-botao-perigo');
  });

  it('a classe extra é somada, não substitui', () => {
    expect(classeDoBotao('secundario', 'voltar')).toBe('ui-botao voltar');
  });

  it('todo botão do lobby tem ícone', () => {
    for (const aba of ABAS_DO_HUB) expect(ICONES_DO_LOBBY[aba], aba).toBeTruthy();
  });
});
