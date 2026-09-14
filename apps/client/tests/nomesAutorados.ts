import { loadCatalogFromDisk } from '@paths-beyond/content/src/loadCatalogFromDisk.js';
import type { TipoDeConteudo } from '../src/i18n/conteudo.js';

// M29 — de onde vêm os nomes autorados de cada tipo traduzível.
//
// **Este arquivo é a espinha do conserto do teste de cobertura, e não um utilitário.** O que
// estava errado em `conteudoTraduzido.test.ts` não era o número 10 nem o número 8: era o teste
// enumerar os tipos que já estavam prontos. Enquanto a lista de tipos a conferir for escrita à
// mão, ela sempre vai descrever o passado.
//
// Aqui a lista é um `Record<TipoDeConteudo, ...>` — **exaustivo por tipo**. Acrescentar um
// valor a `TipoDeConteudo` sem dizer de onde vêm os nomes dele não compila, e o teste passa a
// cobrir o tipo novo sem ninguém lembrar de acrescentá-lo. É a mesma escolha do M20 ao ler a
// lista de tabelas do catálogo do banco em vez de a manter à mão, e a mesma do M27 ao deixar a
// varredura do diretório responder quantas missões um capítulo tem.
//
// O catálogo é lido do disco, que é a fonte real: se um dia alguém acrescentar uma missão em
// `packages/data` sem traduzi-la, o vermelho aparece aqui, no commit dela.

const catalogo = loadCatalogFromDisk();

function porId<T extends { readonly id: string; readonly name: string }>(
  itens: Readonly<Record<string, T>> | readonly T[],
): Readonly<Record<string, string>> {
  const lista = Array.isArray(itens) ? itens : Object.values(itens);
  return Object.fromEntries(lista.map((item) => [item.id, item.name]));
}

/**
 * Id → nome autorado, por tipo traduzível.
 *
 * **Nome PRÓPRIO não entra**, e continua sendo decisão do M25: os personagens se chamam Sylla,
 * Miron, Aren, e criar `conteudo.personagem.*` seria convidar alguém a traduzir o nome de uma
 * pessoa. O que se traduz é o que DESCREVE.
 */
export const NOMES_AUTORADOS: Readonly<Record<TipoDeConteudo, Readonly<Record<string, string>>>> = {
  masmorra: porId(catalogo.dungeons),
  premio: porId(catalogo.achievements),
  classe: porId(catalogo.classes),
  skill: porId(catalogo.skills),
  material: porId(catalogo.materials),
  capitulo: porId(catalogo.chapters),
  // O tipo que o M27 deixou faltando: as trinta missões da demo são `encounters`, e até o M29
  // elas eram desenhadas cruas do dado, em português, numa build de língua inglesa.
  missao: porId(catalogo.encounters),
  // M32 — as skills de Valor (§5.6). O painel de objetivo as desenhava com `skill.name` cru,
  // e o M29 não as viu porque elas não têm nome de missão nem de classe: são um catálogo
  // próprio, `valor-skills/`, que só aparece dentro de uma batalha.
  valor: porId(catalogo.valorSkills),
  // M35 1/N (D43) — os 41 inimigos comuns. O nome existia desde o M27 e nunca chegou à tela.
  inimigo: porId(catalogo.enemies),
};
