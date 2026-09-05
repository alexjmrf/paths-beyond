// §11/D24 (M25, sub-sessão 1/N) — a CAMADA DE IDIOMA.
//
// **A decisão (D24):** a língua de lançamento é o INGLÊS; português, espanhol, chinês e
// japonês depois. Hoje a UI é português cru dentro do JSX — `Esperar`, `Descansar (+1 AP +1
// PP)` escritos no lugar onde são desenhados —, e o custo de extrair isso cresce com cada
// tela nova e com cada linha de conteúdo autorada. É por isso que esta milestone vem **antes**
// da demo de trinta missões (M27): autorar o conteúdo primeiro seria escrever tudo duas vezes.
//
// **Sem biblioteca, e isso é decisão.** O que uma traria — detecção de região, formatação de
// data e número por locale, carregamento assíncrono de catálogo, pluralização por regra CLDR —
// este jogo não usa: os números que ele mostra são inteiros de ponto fixo, e não há data na
// tela. O que ele usa cabe aqui e roda em teste sem navegador.
//
// **O que este arquivo NÃO cobre, declarado:** as mensagens de erro do SERVIDOR
// (`condição não cumprida`, `rate limit exceeded`) continuam em português e inglês misturados,
// porque traduzi-las exige um contrato de CÓDIGO de erro em ~60 pontos de rota — o mesmo
// desenho que o M22 fez para `rules-version-mismatch`. É trabalho de tamanho próprio, e
// misturá-lo aqui tornaria esta milestone irrevisável.

export const IDIOMAS = ['en', 'pt'] as const;

export type Idioma = (typeof IDIOMAS)[number];

// D24 — inglês é a língua de LANÇAMENTO, então é ele quem serve de rede quando falta chave.
export const IDIOMA_PADRAO: Idioma = 'en';

export type Catalogo = Readonly<Record<string, string>>;

export type Tradutor = (chave: string, params?: Readonly<Record<string, string | number>>) => string;

export function idiomaValido(valor: unknown): valor is Idioma {
  return typeof valor === 'string' && (IDIOMAS as readonly string[]).includes(valor);
}

/**
 * A língua do navegador, **só para a primeira abertura**.
 *
 * Depois dela quem manda é o save: um jogador que escolheu inglês num navegador em português
 * não pode ser sobrescrito a cada recarga.
 */
// A tag vem de fora e não de um `default` que lê `navigator`: com o valor embutido na
// assinatura, passar `undefined` explicitamente ainda leria o navegador — e o teste que quer
// afirmar "sem tag, cai no padrão" mediria a máquina de quem roda a suíte.
export function idiomaDoNavegador(tag: string | undefined): Idioma {
  const base = (tag ?? '').split('-')[0]?.toLowerCase();
  return idiomaValido(base) ? base : IDIOMA_PADRAO;
}

// `{nome}` — marcador nomeado e não posicional: `{atual} de {maximo}` sobrevive a uma tradução
// que inverte a ordem das duas coisas, e `%s %s` não sobrevive.
const MARCADOR = /\{(\w+)\}/g;

function interpolar(texto: string, params?: Readonly<Record<string, string | number>>): string {
  if (!params) return texto;
  return texto.replace(MARCADOR, (marcador, nome: string) => {
    const valor = params[nome];
    // **Marcador sem valor fica VISÍVEL.** Apagá-lo daria "2 de  AP" e ninguém notaria; à
    // mostra, o erro aparece na primeira vez que alguém olhar a tela.
    return valor === undefined ? marcador : String(valor);
  });
}

/**
 * O tradutor do idioma ativo.
 *
 * A cadeia de queda tem três degraus e nenhum deles é vazio: idioma ativo → inglês → a própria
 * chave. Idioma incompleto é o estado NORMAL enquanto a tradução não terminou, e um botão sem
 * rótulo seria pior que um botão em inglês; chave que não existe em lugar nenhum aparece como
 * `acao.esperar` na tela, que é feio de propósito — erro que some não é corrigido.
 */
export function criarTradutor(idioma: Idioma, catalogos: Readonly<Record<string, Catalogo>>): Tradutor {
  const ativo = catalogos[idioma];
  const rede = catalogos[IDIOMA_PADRAO];

  return (chave, params) => interpolar(ativo?.[chave] ?? rede?.[chave] ?? chave, params);
}
