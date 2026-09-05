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

export type TipoDeConteudo = 'masmorra' | 'premio' | 'classe' | 'skill' | 'material' | 'capitulo';

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
