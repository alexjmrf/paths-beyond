import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// §11/D24 (M25, sub-sessão 2/N) — nenhuma frase escrita dentro do JSX.
//
// **É o critério de aceite do M25 em forma de teste**, e a metade que `catalogos.test.ts` não
// cobre: lá se afirma que os catálogos têm as mesmas chaves; aqui se afirma que a tela usa
// chave em vez de escrever a frase onde ela é desenhada.
//
// **A lista `FALTAM` é o que impede este teste de ser uma promessa.** As telas ainda não
// convertidas estão nomeadas nela, e não escondidas: enquanto um arquivo estiver ali, ele é
// trabalho declarado da 3/N. Tirar um arquivo da lista é o que fecha a conversão dele — e
// acrescentar um arquivo novo à lista exige explicar por quê, num diff que alguém lê.

const COMPONENTES = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'components');

// A 3/N converte estas. Cada uma sai da lista quando passar a usar `t(...)`.
const FALTAM = new Set([
  'ArenaDefensePanel.tsx',
  'ConditionEditor.tsx',
  'DungeonPanel.tsx',
  'InventoryPanel.tsx',
  'TacticsEditor.tsx',
  'TalentTreePanel.tsx',
]);

// Siglas e símbolos que são iguais em toda língua. `AP`, `PP` e `HP` são termos do jogo (§4) e
// não frases; traduzi-los criaria três nomes para o mesmo recurso, que é o oposto do que a
// legibilidade de §1.1 pede. Números, pontuação e ícones idem.
const PALAVRA = /[A-Za-zÀ-ÿ]{3,}/;

function linhasComTextoCru(fonte: string): string[] {
  const achados: string[] = [];
  const linhas = fonte.split('\n');

  linhas.forEach((linha, i) => {
    const semEspaco = linha.trim();
    // Comentário não é tela. O de bloco (`*`) e o de linha (`//`) descrevem POR QUE o código
    // é assim — é a documentação que este projeto trata como parte do trabalho, e ela não é
    // traduzida.
    if (semEspaco.startsWith('//') || semEspaco.startsWith('*') || semEspaco.startsWith('/*')) return;

    // Texto entre tags: `>Alguma coisa<`.
    for (const trecho of linha.match(/>[^<>{}]+</g) ?? []) {
      // Genérico de TypeScript casa com o mesmo formato — `ReturnType<...>['x']): Set<` — e
      // não é tela. Aspas e colchetes são o que separa os dois: frase de jogador não os tem.
      if (/['"[\]]/.test(trecho)) continue;
      if (PALAVRA.test(trecho)) achados.push(`${i + 1}: ${trecho.trim()}`);
    }

    // Atributos que o jogador LÊ. `className`, `type` e `key` não são texto de tela.
    for (const atributo of linha.match(/(title|placeholder|aria-label)="[^"]+"/g) ?? []) {
      if (PALAVRA.test(atributo)) achados.push(`${i + 1}: ${atributo}`);
    }
  });

  return achados;
}

const arquivos = readdirSync(COMPONENTES).filter((f) => f.endsWith('.tsx'));

describe('as telas convertidas não têm frase escrita no JSX', () => {
  it('há telas para varrer, e a lista do que falta não engoliu todas', () => {
    expect(arquivos.length).toBeGreaterThan(10);
    // Se um dia `FALTAM` crescer até cobrir tudo, este teste vira decoração. A asserção
    // impede isso de acontecer em silêncio.
    expect(FALTAM.size).toBeLessThan(arquivos.length / 2);
  });

  it.each(arquivos.filter((f) => !FALTAM.has(f)))('%s usa chave, e não frase', (arquivo) => {
    const achados = linhasComTextoCru(readFileSync(join(COMPONENTES, arquivo), 'utf8'));
    expect(achados, `texto cru em ${arquivo}`).toEqual([]);
  });

  // O outro lado da lista: um arquivo que já foi convertido não pode voltar para ela sem
  // alguém perceber, e um arquivo que sumiu do projeto não pode ficar nela para sempre.
  it('todo arquivo declarado como pendente existe de verdade', () => {
    for (const pendente of FALTAM) {
      expect(arquivos, `${pendente} está em FALTAM mas não existe`).toContain(pendente);
    }
  });
});
