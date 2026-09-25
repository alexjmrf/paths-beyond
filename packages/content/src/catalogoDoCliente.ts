import { buildCatalog, type ParsedContentFiles } from './buildCatalog.js';
import type { ContentCatalog } from './types.js';

// M36 3/N (D47/D48) — O CATÁLOGO PARTIDO: o que o cliente empacota e o que fica no servidor.
//
// **O buraco que esta fatia fecha.** D47 mandou esconder a ficha do inimigo, e a 2/N a escondeu
// no fio: nenhuma resposta de rota de batalha carrega stat, skill, script, `moveType` ou alcance
// de unidade inimiga. Mas o cliente **empacota o catálogo inteiro em build-time**
// (`loadCatalogFromBrowser`), e `packages/data/encounters/`, `dungeon-encounters/` e `enemies/`
// descrevem, com nome e número, todo inimigo de PvE. Esconder no fio e distribuir no instalador
// é o mesmo teatro que o teorema de D47 usou para proibir a simulação no cliente: o dado está
// na máquina de quem joga, e dado que está na máquina se lê.
//
// No PvP o problema nunca existiu — os heróis do defensor são instâncias de outra conta, e
// nenhum bundle os teria. É só o PvE que precisava desta fatia.
//
// **A decisão (do usuário, D48): partir.** Os três diretórios viram só-servidor. O cliente fica
// com o que precisa para desenhar e para ler o PRÓPRIO lado — classes, personagens, árvores,
// skills, itens, sets, efeitos, valor-skills, mapas, terrenos, capítulos, masmorras (a lista,
// não o confronto), banners, conquistas e as tabelas de economia.
//
// **O que o cliente perdeu, e de onde passa a vir:**
//   - a PRÉVIA da missão (o tabuleiro antes de entrar) → `GET /campaign/:id/previa`, redigida;
//   - a ordem em que a campanha apresenta os personagens → `GET /campaign`, campo `castOrder`;
//   - o NOME do inimigo no tabuleiro → a camada de idioma do cliente, pelo id de arte que o
//     servidor manda em `characterIdByUnitId` (D48: identidade não é build).
//
// **Uma fonte só, ainda.** Regra 4 continua valendo: os arquivos não foram duplicados nem
// recortados. O que mudou é quem os LÊ — `loadCatalogFromDisk` (servidor, `sim-cli`,
// `tools/balance`) continua lendo tudo; o adapter de browser não junta mais os três.

/** Os três conjuntos que descrevem o inimigo de PvE, e que não saem mais do servidor. */
export const CONTEUDO_SO_DO_SERVIDOR = ['encounters', 'dungeonEncounters', 'enemies'] as const;
export type ConteudoSoDoServidor = (typeof CONTEUDO_SO_DO_SERVIDOR)[number];

/**
 * O catálogo que o cliente empacota. É o `ContentCatalog` **menos** os três conjuntos — e é um
 * `Omit` de verdade, não um catálogo com eles vazios: um `catalog.enemies` que existisse e
 * viesse vazio seria um bug em runtime; assim ele é erro de compilação, no arquivo que tentar.
 */
export type CatalogoDoCliente = Omit<ContentCatalog, ConteudoSoDoServidor>;

export type ParsedClientContentFiles = Omit<ParsedContentFiles, ConteudoSoDoServidor>;

// O guarda de que o tipo e a lista não se separam. Compila, ou não compila.
const _listaCobreOTipo: Record<ConteudoSoDoServidor, true> = {
  encounters: true,
  dungeonEncounters: true,
  enemies: true,
};
void _listaCobreOTipo;

/**
 * Monta o catálogo do cliente a partir do JSON cru que o adapter de browser junta.
 *
 * Reusa `buildCatalog` de propósito, em vez de uma segunda montagem: validação, indexação e
 * fusão continuam acontecendo uma vez só, no mesmo lugar, para os dois lados. O que este
 * arquivo faz é passar os três conjuntos VAZIOS e depois apagá-los da saída — o cliente nunca
 * vê a chave, e ninguém escreveu uma segunda regra de como um catálogo se monta.
 */
export function buildClientCatalog(input: ParsedClientContentFiles): CatalogoDoCliente {
  const completo = buildCatalog({ ...input, encounters: [], dungeonEncounters: [], enemies: [] });

  const doCliente: Record<string, unknown> = { ...completo };
  for (const chave of CONTEUDO_SO_DO_SERVIDOR) delete doCliente[chave];
  return doCliente as unknown as CatalogoDoCliente;
}
