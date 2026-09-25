import type { RosterEntry } from '../data/api.js';

// M35 2/N (D42) — as vagas de uma missão NUNCA começam vazias, e o protagonista vem primeiro.
//
// O achado do M32 2/N: missão escolhida, nenhum herói marcado, "Entrar na missão" cinza sem dizer
// por quê. Pré-marcar resolve, mas QUEM vem marcado é decisão de design: o roster chega em ordem
// alfabética de id, que põe Vesper (arcanista) antes de Aren, e o M27 2/N mediu a missão 1 em
// 0/20 com arcanista. A regra veio do usuário ao descrever a história ("o prota começando sua
// jornada"): o protagonista primeiro, depois quem a campanha apresenta, na ordem em que apresenta.
//
// A ordem é DERIVADA do conteúdo autorado (`ordemDeAparicao`), não escrita à mão: um personagem
// novo numa missão entra na ordem sozinho, e nenhuma lista fica descrevendo o passado. É
// apresentação (quem vem marcado), não regra: quem valida a party continua sendo o servidor.

// M36 3/N (D48) — `ordemDeAparicao` MUDOU DE LADO. Ela derivava de `catalogo.encounters`, que
// saiu do bundle do cliente junto com a ficha dos inimigos que mora nos mesmos arquivos. A regra
// não mudou uma vírgula — continua derivada do conteúdo autorado, agora em
// `apps/server/src/campaign/routes.ts`, e chega pronta em `GET /campaign` como `castOrder`.
//
// O que ficou aqui é o que sempre foi do cliente: dado o `castOrder`, quem vem marcado.

/** Os heróis que vêm marcados ao escolher uma missão de `vagas` vagas. */
export function preenchimentoPadrao(
  roster: readonly Pick<RosterEntry, 'hero'>[],
  vagas: number,
  ordem: readonly string[],
): readonly string[] {
  const posicao = (entry: Pick<RosterEntry, 'hero'>): number => {
    const i = entry.hero.characterId ? ordem.indexOf(entry.hero.characterId) : -1;
    // Quem não está na história (invocado) vem depois do núcleo, na ordem do roster.
    return i === -1 ? ordem.length : i;
  };
  return [...roster]
    .map((entry, indice) => ({ entry, indice }))
    .sort((a, b) => posicao(a.entry) - posicao(b.entry) || a.indice - b.indice)
    .slice(0, Math.max(0, vagas))
    .map(({ entry }) => entry.hero.id);
}
