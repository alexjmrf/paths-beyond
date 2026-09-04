import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// §1.1 (M23, sub-sessão 3/N) — "nenhuma tela exige conhecimento que o jogo não deu".
//
// O critério é sobre COMPREENSÃO, e quem julga isso é o usuário observando alguém que nunca
// viu o jogo — não este arquivo. O que dá para travar por teste é o caso mecânico: **sigla e
// termo de dentro do projeto vazando para a tela sem tradução**. Foram três, todos achados
// na varredura desta fatia: `CP`, `Imprint` como rótulo de botão e `a3 i1` como resumo de
// herói.
//
// A lista é de termos que NÃO podem aparecer soltos no texto renderizado. Um termo novo que
// escape entra aqui junto com a tradução dele — o teste é o lembrete.

const COMPONENTES = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'components');

// Só o que o jogador LÊ. Comentário de código é conversa entre quem mantém o projeto, e
// `imprint` como nome de campo do modelo continua sendo o nome certo lá.
function textoRenderizado(fonte: string): string {
  return fonte
    .split('\n')
    .filter((linha) => !linha.trim().startsWith('//') && !linha.trim().startsWith('*') && !linha.trim().startsWith('/*'))
    .join('\n');
}

const PROIBIDOS: readonly { readonly termo: RegExp; readonly porque: string }[] = [
  { termo: />\s*Imprint\s*</, porque: 'é "vínculo" para o jogador' },
  { termo: /\bCP:\s*\{/, porque: 'é "poder de combate" para o jogador' },
  { termo: /\(a\{[^}]+\}\s*i\{/, porque: 'as letras a/i são despertar e vínculo' },
];

describe('as telas não falam a língua do projeto', () => {
  const arquivos = readdirSync(COMPONENTES).filter((f) => f.endsWith('.tsx'));

  it('há telas para varrer', () => {
    expect(arquivos.length).toBeGreaterThan(10);
  });

  it.each(PROIBIDOS)('nenhuma tela mostra $termo ($porque)', ({ termo }) => {
    const ofensores = arquivos.filter((arquivo) =>
      termo.test(textoRenderizado(readFileSync(join(COMPONENTES, arquivo), 'utf8'))),
    );

    expect(ofensores).toEqual([]);
  });
});
