import type { Hero } from '../hero/types.js';
import { intMul } from '../math/fixed.js';

// M39 1/N — A SUBIDA DE NÍVEL.
//
// Até o M38 o herói nascia no nível 10 e ficava nele: `Hero.exp` existia, o drop da masmorra
// sorteava exp, e nada o somava. Decisões do usuário (2026-09-26): o exp vem de QUALQUER
// instância PvE, e o quanto depende da quantidade e do nível dos inimigos; os Tomos de
// Experiência são o jeito mais eficiente de subir; e subir não custa ouro.
//
// O teto é o tamanho da `statCurve` das classes (§4.1 passo 1: "base do herói no nível N").

export const MAX_LEVEL = 60;

/**
 * A curva, em dado (`economy.json`): `expParaProximo[L - 1]` é o exp para ir do nível L ao L+1.
 * Tem `MAX_LEVEL - 1` entradas; a que faltar falha alto em vez de travar o herói em silêncio.
 */
export interface CurvaDeExp {
  readonly expParaProximo: readonly number[];
}

export interface ResultadoDoExp {
  readonly hero: Hero;
  readonly niveisGanhos: number;
}

/**
 * Soma `exp` ao herói e sobe quantos níveis ele pagar, guardando a sobra na barra (`hero.exp` é
 * o exp DENTRO do nível corrente). No teto, a barra fica zerada e o excedente é descartado.
 * Pura: devolve um herói novo.
 */
export function aplicarExp(hero: Hero, exp: number, curva: CurvaDeExp): ResultadoDoExp {
  if (exp <= 0 || !Number.isFinite(exp)) return { hero, niveisGanhos: 0 };

  let level = hero.level;
  let barra = hero.exp + exp;
  while (level < MAX_LEVEL) {
    const custo = curva.expParaProximo[level - 1];
    if (custo === undefined || custo <= 0) {
      throw new Error(`curva de exp não define o custo do nível ${level} para o ${level + 1}`);
    }
    if (barra < custo) break;
    barra -= custo;
    level += 1;
  }
  if (level >= MAX_LEVEL) barra = 0;

  return { hero: { ...hero, level, exp: barra }, niveisGanhos: level - hero.level };
}

/**
 * O exp de uma instância PvE: a soma dos inimigos dela, cada um valendo `porNivel` × o nível
 * dele. Mais inimigos, ou inimigos mais fortes, dão mais — a variação que o usuário pediu mora no
 * conteúdo (quantos inimigos e de que nível), não em fórmula por modo.
 */
export function expDaInstancia(inimigos: readonly { readonly level: number }[], porNivel: number): number {
  let total = 0;
  for (const inimigo of inimigos) total += intMul(inimigo.level, porNivel);
  return total;
}
