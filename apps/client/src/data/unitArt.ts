import type { BattleUnit, Hero } from '@paths-beyond/core';
import type { UnitArt } from '@paths-beyond/data/schemas/unit-art.schema.js';
import type { ArteDeUnidade } from './unitRenderer.js';

// M26 — do manifesto para a tela.
//
// **D22 reabriu o critério 1 do M16**, e este arquivo é a porta por onde a imagem entra. Ele
// junta duas coisas que moram em lugares diferentes de propósito:
//
//   - a DECLARAÇÃO (`packages/data/unit-art/*.json`) é conteúdo: validada por Zod junto com
//     todo o resto no `pnpm validate:data`, e é ela que responde "esta unidade tem arte?" a
//     quem autora conteúdo, sem abrir código do cliente (regra 4);
//   - os BYTES (`../art/units/*.png`) são asset do cliente, e só o cliente os consome. Pô-los
//     em `packages/data` faria o servidor e o `sim-cli` carregarem imagem que nunca desenham.
//
// Os dois lados são amarrados por teste dos dois lados: `packages/data/tests/arteDeUnidade`
// cobra que todo sprite declarado exista em disco, e `tests/semAssetsRaster` cobra o inverso —
// que toda imagem do repositório esteja declarada.
//
// `import.meta.glob` com `eager` resolve tudo em build-time, sem requisição extra em runtime.
// O `?url` é o que faz o Vite emitir uma URL RELATIVA (com `base: './'`, M21 2/N): um caminho
// absoluto abriria em branco sob `file://` no shell desktop, sem erro visível.

const declaracoes = import.meta.glob<UnitArt>('../../../../packages/data/unit-art/*.json', {
  eager: true,
  import: 'default',
});

const arquivos = import.meta.glob<string>('../art/units/*.png', {
  eager: true,
  import: 'default',
  query: '?url',
});

function nomeDe(caminho: string): string {
  return caminho.slice(caminho.lastIndexOf('/') + 1);
}

function urlDe(arquivo: string): string | undefined {
  return Object.entries(arquivos).find(([caminho]) => nomeDe(caminho) === nomeDe(arquivo))?.[1];
}

// M26 2/N — as duas poses da TELA DE DUELO, indexadas à parte da peça do tabuleiro.
//
// Elas não custaram geração: `create-character-v3` produz as 8 rotações numa passada só, e a
// 1/N baixava uma. Ficam num mapa próprio porque quem desenha o tabuleiro nunca precisa delas
// — e o `activeUnitRenderer` não deve nem saber que existem.
const dueloPorArtId = new Map<string, Record<string, string>>();

const porArtId = new Map<string, ArteDeUnidade>();
for (const declaracao of Object.values(declaracoes)) {
  if (declaracao.kind !== 'sprite') continue;

  const poses: Record<string, string> = {};
  for (const [nome, arquivo] of Object.entries(declaracao.duelo)) {
    const u = urlDe(arquivo);
    if (u) poses[nome] = u;
  }
  if (Object.keys(poses).length > 0) dueloPorArtId.set(declaracao.unitId, poses);

  const url = urlDe(declaracao.arquivo);
  // Declaração apontando para um arquivo que não veio no bundle cai no glifo em vez de virar
  // um sprite quebrado na tela. O teste de `packages/data` é quem reprova isso no commit; aqui
  // a escolha é degradar, porque um tabuleiro com uma peça desenhada por código é jogável e um
  // com um retângulo vazio não é.
  if (url) porArtId.set(declaracao.unitId, { src: url, frameSize: declaracao.frameSize });
}

/**
 * O resolvedor que o `activeUnitRenderer` usa. `undefined` — unidade sem arte declarada, ou
 * com arte declarada que não veio — é o caso NORMAL enquanto o elenco ganha sprite aos poucos,
 * e significa "desenhe o glifo do M16".
 */
export function arteDeUnidade(artId: string | undefined): ArteDeUnidade | undefined {
  return artId ? porArtId.get(artId) : undefined;
}

/** Quais unidades têm sprite de verdade carregado. Só para diagnóstico e teste. */
export function unidadesComArte(): readonly string[] {
  return [...porArtId.keys()].sort();
}

/** As URLs a pré-carregar no Pixi antes de desenhar. Vazio enquanto ninguém tiver arte. */
export function urlsDeArte(): readonly string[] {
  // Inclui as poses de duelo: `Texture.from` lê do cache do Pixi, e uma pose não pré-carregada
  // apareceria como retângulo branco no primeiro quadro da cena — que é justamente o quadro em
  // que o jogador está olhando.
  return [
    ...new Set([
      ...[...porArtId.values()].map((a) => a.src),
      ...[...dueloPorArtId.values()].flatMap((poses) => Object.values(poses)),
    ]),
  ];
}

/**
 * A chave de uma unidade de BATALHA no manifesto, resolvida em TRÊS níveis — e a ordem entre
 * eles é a coisa que importa aqui.
 *
 * 1. **O mapa do servidor** (M26 3/N), quando existe. É o único nível que responde por PvP:
 *    o time do defensor são instâncias de herói de OUTRA conta, e nenhum caminho de cliente
 *    chega nelas. Ele cobre os dois lados e vem no ticket, ao lado do setup.
 * 2. **O roster**, para o herói do jogador. `BattleUnit.heroId` guarda o id da INSTÂNCIA
 *    ("dev-ally-guerreiro", ou o que o servidor gerou), não o do personagem; quem é aquela
 *    pessoa mora no roster, no mesmo caminho que `characterTreeForUnit` (M17 4/N) já usa.
 * 3. **O `heroId` do inimigo**, que já É a chave: o inimigo de fase é autorado direto (M17
 *    3/N) e `assemble.ts` copia o id dele para `heroId`.
 *
 * Os níveis 2 e 3 continuam de pé porque o cliente monta tabuleiro sem ticket em pelo menos
 * dois lugares (o tabuleiro vazio da abertura, e a suíte). Eles não são redundância morta: são
 * o caminho de quem nunca falou com o servidor.
 *
 * Uma unidade sem nenhum dos três — reforço invocado, ficha de cenário sem personagem —
 * devolve `undefined` e cai no glifo do M16, que é a resposta certa e não uma falha.
 */
export function artIdDeUnidade(
  heroesByUnitId: Readonly<Record<string, Hero>>,
  unit: Pick<BattleUnit, 'unitId' | 'heroId' | 'side'>,
  artIdByUnitId: Readonly<Record<string, string>> = {},
): string | undefined {
  const doServidor = artIdByUnitId[unit.unitId];
  if (doServidor) return doServidor;
  if (unit.side === 'enemy') return unit.heroId;
  return heroesByUnitId[unit.unitId]?.characterId;
}

/**
 * A peça da TELA DE DUELO, na pose pedida. `sudeste` olha para a direita (o lado esquerdo da
 * cena) e `sudoeste` para a esquerda.
 *
 * `undefined` — sem arte, ou com arte que não veio no bundle — é o caso normal enquanto o
 * elenco ganha peça aos poucos, e a cena desenha o disco de lado do M16 no lugar. Degradar é
 * sempre uma cena jogável; um retângulo vazio não é.
 */
export function arteDeDuelo(artId: string | undefined, pose: 'sudeste' | 'sudoeste'): string | undefined {
  return artId ? dueloPorArtId.get(artId)?.[pose] : undefined;
}
