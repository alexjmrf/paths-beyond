import type { Tradutor } from './idioma.js';

// §11/D24 (M25, sub-sessão 3/N) — o texto AUTORADO, traduzível sem duplicar o dado.
//
// **O problema.** Nome de masmorra, de conquista, de classe e de skill vive em
// `packages/data`, é validado por Zod e é lido pelo servidor e pelo cliente. Traduzir isso
// copiando o JSON inteiro por idioma criaria cinco verdades sobre o mesmo conteúdo — e a
// quinta cópia é onde alguém esquece de mudar o custo de energia junto com o nome.
//
// **A solução: o dado continua com UM nome canônico, e o idioma só sobrepõe por id.** O JSON
// não muda de forma, o schema não muda, o servidor não sabe que isto existe. O catálogo de
// idioma ganha entradas `conteudo.<tipo>.<id>`, e quem não tiver entrada aparece no nome
// autorado — que é português hoje, e continua legível.
//
// **Nome PRÓPRIO não entra aqui, e isso é decisão.** Os personagens se chamam Sylla, Miron,
// Aren: nome de pessoa não se traduz, e criar `conteudo.personagem.ally-arqueiro` seria
// convidar alguém a "traduzir" Sylla um dia. O que se traduz é o que descreve — masmorra,
// conquista, classe, skill, material.

/**
 * Os tipos traduzíveis, como CONSTANTE DE RUNTIME — e o tipo derivado dela.
 *
 * M29: era uma união de tipo pura, e uma união de tipo não existe em tempo de execução, então
 * nada podia percorrê-la. `conteudoTraduzido.test.ts` afirmava cobertura tipo a tipo,
 * enumerando à mão os dois que já estavam prontos, e ficava **vacuamente verde** sobre os
 * quatro que faltavam — 81 nomes em português numa build de língua inglesa.
 *
 * Com a lista existindo em runtime, o teste percorre os tipos em vez de os listar: um valor
 * novo aqui entra na cobertura sozinho, e fica vermelho até ser traduzido. É a mesma escolha
 * de `ECONOMY_ACTION_KINDS` no M19, feita pelo mesmo motivo — lá a constante e o `CHECK` do
 * SQL derivavam em silêncio; aqui era a constante e a tradução.
 */
export const TIPOS_DE_CONTEUDO = [
  'masmorra',
  'premio',
  'classe',
  'skill',
  'material',
  'capitulo',
  'missao',
] as const;

export type TipoDeConteudo = (typeof TIPOS_DE_CONTEUDO)[number];

/**
 * O nome de uma peça de conteúdo no idioma ativo, ou o nome autorado.
 *
 * A queda é o próprio motor: `t` devolve a CHAVE quando ela não existe em nenhum catálogo, e
 * é exatamente por isso que dá para distinguir "não traduzido" de "traduzido" sem uma segunda
 * API. Sem entrada, o jogador vê o nome autorado — nunca `conteudo.masmorra.x` na tela.
 */
export function nomeDeConteudo(t: Tradutor, tipo: TipoDeConteudo, id: string, autorado: string): string {
  const chave = `conteudo.${tipo}.${id}`;
  const traduzido = t(chave);
  return traduzido === chave ? autorado : traduzido;
}
