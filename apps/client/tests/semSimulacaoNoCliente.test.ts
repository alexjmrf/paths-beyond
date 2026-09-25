import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// M36 4/N (D47) — **O CLIENTE NÃO SIMULA MAIS.** Esta é a trava.
//
// **O teorema, de novo, porque é dele que sai a asserção.** Informação oculta e simulação no
// cliente não coexistem: se o cliente resolve o duelo, ele TEM os dados do inimigo para
// resolvê-lo, e um editor de memória ou um sniffer os lê. O "oculto" seria uma tela que não
// mostra. Então o servidor resolve e o cliente reproduz — e se um dia alguém reintroduzir
// `applyCommandAndAdvance` aqui "só para o preview", a milestone inteira volta a ser teatro
// sem que nada mais reprove.
//
// É o critério de aceite do M36 ao pé da letra: "o cliente não importa mais `resolveDuel` nem
// `simulate` (asserção sobre os imports, no espírito de `ambiente.test.ts`)". A lista abaixo é
// maior do que as duas que o critério nomeia, e de propósito: `buildInitialState` +
// `applyCommandAndAdvance` é `simulate` escrito à mão, e era exatamente assim que o cliente
// simulava antes desta fatia.
//
// **O que CONTINUA permitido está na lista de baixo, e cada um tem motivo.** O critério fala do
// que o cliente não pode calcular sobre o INIMIGO; o core também tem funções que só dependem do
// próprio lado e do tabuleiro visível, e proibi-las seria confundir "não simule" com "não faça
// conta nenhuma".

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const SRC = join(RAIZ, 'apps', 'client', 'src');

/**
 * O que o cliente NÃO pode importar do core. Cada um resolve ou monta batalha, e para isso
 * precisa dos dois lados inteiros.
 */
const PROIBIDOS = [
  // Resolve o duelo. É o nome que D47 cita.
  'resolveDuel',
  // Roda um replay inteiro. O outro nome que D47 cita.
  'simulate',
  // `simulate` de um comando só: aplica, fecha o round e joga a IA. Era por aqui que o cliente
  // simulava de verdade.
  'applyCommandAndAdvance',
  // Idem, sem a IA. Existe para o SERVIDOR partir o turno (M36 1/N); no cliente seria a mesma
  // simulação com um nome novo.
  'advanceWithoutAi',
  // Aplica um comando cru.
  'applyCommand',
  // Monta o estado inicial a partir de um `BattleSetup` — que não atravessa mais a rede.
  'buildInitialState',
  'buildInitialStateLogged',
  // Monta o `BattleSetup`: precisa de stats, skills e equipamento dos dois lados.
  'buildBattleSetupFromHeroes',
  // A IA de mapa. Os scripts dela são ocultos (D47).
  'resolveAiTurns',
  'resolveAiTurnsLogged',
  'decideMapAiCommand',
  // Resolve a batalha inteira com a IA dos dois lados (varredura). Mora no servidor.
  'resolveAutoBattle',
  // O perfil de combate resolvido de um inimigo autorado.
  'resolveEnemyCombatProfile',
] as const;

/**
 * O que o cliente PODE importar, e por quê. A lista existe para o teste acima não virar "o
 * cliente não fala com o core": ela é a outra metade da regra.
 */
const PERMITIDOS_COM_MOTIVO: Readonly<Record<string, string>> = {
  computeReachableTiles: 'para onde a MINHA unidade anda — D47 nomeia esta como a que fica',
  openGateCoords: 'estado de portão é tabuleiro, e o tabuleiro é visível',
  manhattanDistance: 'geometria do grid, sem dado de ninguém',
  tileAt: 'o terreno de um tile, que está no mapa',
  resolveHeroStatSheet: 'os stats do MEU herói, para as telas de ficha e talento',
  resolveTalentEffects: 'a árvore do MEU herói',
  computeCombatPower: 'o poder do MEU herói',
};

function varrer(dir: string): readonly string[] {
  const achados: string[] = [];
  for (const entrada of readdirSync(dir, { withFileTypes: true })) {
    const caminho = join(dir, entrada.name);
    if (entrada.isDirectory()) achados.push(...varrer(caminho));
    else if (/\.(ts|tsx)$/.test(entrada.name)) achados.push(caminho);
  }
  return achados;
}

/** Os nomes importados de `@paths-beyond/core` num arquivo, ignorando `import type`. */
function importesDeValorDoCore(fonte: string): readonly string[] {
  const nomes: string[] = [];
  const blocos = fonte.matchAll(/import\s+(type\s+)?\{([^}]*)\}\s+from\s+'@paths-beyond\/core'/g);
  for (const bloco of blocos) {
    if (bloco[1]) continue; // `import type { ... }` não traz código nenhum para o bundle
    for (const bruto of (bloco[2] ?? '').split(',')) {
      const nome = bruto.trim().replace(/^type\s+/, '');
      // Dentro de um import misto, `type X` continua sendo só tipo.
      if (!nome || bruto.trim().startsWith('type ')) continue;
      nomes.push(nome.split(/\s+as\s+/)[0]!.trim());
    }
  }
  return nomes;
}

const arquivos = varrer(SRC);

describe('o cliente reproduz, não simula (M36 4/N)', () => {
  it('há arquivos para varrer — a asserção não passa por não ter olhado nada', () => {
    expect(arquivos.length).toBeGreaterThan(30);
  });

  it('nenhum módulo do cliente importa função de simulação do core', () => {
    const achados: string[] = [];
    for (const arquivo of arquivos) {
      const importados = new Set(importesDeValorDoCore(readFileSync(arquivo, 'utf8')));
      for (const proibido of PROIBIDOS) {
        if (importados.has(proibido)) achados.push(`${arquivo.slice(RAIZ.length + 1)}: ${proibido}`);
      }
    }

    expect(achados, 'o cliente voltou a simular').toEqual([]);
  });

  it('e a varredura vê os imports de verdade: os que CONTINUAM permitidos aparecem', () => {
    // Sem isto, um erro no parser deixaria a asserção acima vacuamente verde — o modo de falha
    // que este projeto já pegou cinco vezes, sempre do mesmo jeito.
    const importados = new Set(arquivos.flatMap((a) => importesDeValorDoCore(readFileSync(a, 'utf8'))));

    for (const [nome, motivo] of Object.entries(PERMITIDOS_COM_MOTIVO)) {
      expect(importados.has(nome), `${nome} (${motivo}) sumiu do cliente — a varredura ainda funciona?`).toBe(true);
    }
  });

  it('o preview de duelo e a zona de ameaça não voltaram', () => {
    // As duas saíram por D47, e as duas são o tipo de coisa que volta "só para ver como fica".
    // `DuelPreviewPanel.tsx` e `logic/ameaca.ts` foram apagados nesta fatia.
    const nomes = arquivos.map((a) => a.slice(RAIZ.length + 1).replace(/\\/g, '/'));
    expect(nomes).not.toContain('apps/client/src/components/DuelPreviewPanel.tsx');
    expect(nomes).not.toContain('apps/client/src/logic/ameaca.ts');
  });
});
