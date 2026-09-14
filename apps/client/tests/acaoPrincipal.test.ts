import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// M32 — UMA próxima ação por tela, com peso visual maior que o resto.
//
// O que este arquivo consegue afirmar é a metade mecânica do critério: a classe existe, tem
// peso de verdade no CSS, e está declarada nas telas em que a próxima ação é um botão. A
// outra metade — "o usuário a identifica sem que ninguém aponte" — é julgada por ele na
// tela, como o critério 2 do M16, e nenhuma varredura de fonte substitui isso.
//
// **A lista de telas é fechada de propósito.** Uma tela nova que ganhe `acao-principal` tem
// de entrar aqui num diff que alguém lê — e uma que a perca também. É a mesma escolha de
// `FALTAM` em `semTextoCru.test.ts`: o que impede o teste de virar promessa é a lista ser
// explícita.

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..', 'src');
const COMPONENTES = join(SRC, 'components');

// Tela → o que é a próxima ação nela.
const TELAS_COM_ACAO_PRINCIPAL: Readonly<Record<string, string>> = {
  'EntradaPanel.tsx': 'entrar',
  // M35 5/N — no lobby a próxima ação de quem chega é a campanha.
  'LobbyPanel.tsx': 'entrar na campanha',
  'CampaignPanel.tsx': 'a próxima missão, ou entrar na missão escolhida',
  'DuelPreviewPanel.tsx': 'confirmar o duelo',
  'PvpPanel.tsx': 'enviar a batalha terminada',
  'OpcoesMenu.tsx': 'fechar o menu — apagar progresso NUNCA é a ação principal',
};

const arquivos = readdirSync(COMPONENTES).filter((f) => f.endsWith('.tsx'));

describe('a próxima ação de cada tela', () => {
  it('a classe tem peso no CSS — senão é um nome sem efeito', () => {
    const css = readFileSync(join(SRC, 'style.css'), 'utf8');
    const bloco = css.match(/\.acao-principal\s*\{([^}]*)\}/);
    expect(bloco, '`.acao-principal` não está em style.css').not.toBeNull();
    // Peso visual maior: fonte mais pesada E um fundo próprio. Um dos dois só seria um botão
    // como os outros com uma cor diferente.
    expect(bloco![1]).toMatch(/font-weight/);
    expect(bloco![1]).toMatch(/background/);
  });

  it('as telas que declaram a classe são exatamente as listadas', () => {
    const declaram = arquivos.filter((f) => readFileSync(join(COMPONENTES, f), 'utf8').includes('acao-principal'));
    expect(declaram.sort()).toEqual(Object.keys(TELAS_COM_ACAO_PRINCIPAL).sort());
  });

  it('a entrada tem UM botão só, e ele é a ação principal', () => {
    // É o critério "sem sessão, a única coisa na tela é entrar", olhado pela tela de entrada:
    // um segundo botão ali seria uma segunda coisa.
    const fonte = readFileSync(join(COMPONENTES, 'EntradaPanel.tsx'), 'utf8');
    const botoes = fonte.match(/<button\b/g) ?? [];
    expect(botoes).toHaveLength(1);
    expect(fonte).toMatch(/className="acao-principal"/);
  });

  it('"apagar progresso" nunca carrega a classe', () => {
    // A ação que não se desfaz não pode ser a que salta aos olhos.
    const fonte = readFileSync(join(COMPONENTES, 'OpcoesMenu.tsx'), 'utf8');
    const botoes = fonte.match(/<button\b[^>]*>/gs) ?? [];
    const deApagar = botoes.filter((b) => /pedirApagarProgresso|confirmarApagarProgresso/.test(b));
    expect(deApagar.length, 'os dois passos de apagar existem como botões').toBe(2);
    for (const botao of deApagar) expect(botao).not.toContain('acao-principal');
  });
});
