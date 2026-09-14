import type { BattleState, WinCondition } from '@paths-beyond/core';
import type { Tradutor } from '../i18n/idioma.js';

// M32 — o OBJETIVO do mapa em palavras, no idioma ativo.
//
// Era `describeObjective()` dentro de `ObjectivePanel.tsx`, com as cinco condições de §5.7
// escritas em português em template literal. `semTextoCru.test.ts` nunca acusou — ele varre
// `>texto<` e atributos, não strings dentro de função —, e o M29 cobriu os NOMES da campanha
// sem passar por aqui. Resultado: o instalador mostrou "Derrotar todos os inimigos" numa
// build de língua inglesa.
//
// Saiu do componente pelo motivo de sempre: uma função que recebe `t` é testável contra os
// dois catálogos sem montar tela, e `objetivoNaTela.test.ts` deriva a lista de condições do
// schema de `packages/data` — uma condição nova fica vermelha até ter texto nas duas línguas.
//
// Nada aqui decide (regra 3): a condição vem do mapa e o estado vem do core; isto só conta e
// escreve.

export interface ObjetivoNaTela {
  readonly titulo: string;
  readonly detalhe: string;
}

function coordenada(alvo: { readonly x: number; readonly y: number }): string {
  return `(${alvo.x}, ${alvo.y})`;
}

// M35 2/N — o estado é só o que se lê dele (unidades e round): a prévia da missão passa o
// `BattleSetup` do catálogo com `round: 1`, antes de existir batalha.
export type EstadoDoObjetivo = Pick<BattleState, 'round'> & { readonly units: readonly Pick<BattleState['units'][number], 'side' | 'hp'>[] };

export function descreverObjetivo(t: Tradutor, condicao: WinCondition, estado: EstadoDoObjetivo): ObjetivoNaTela {
  switch (condicao.t) {
    case 'rout':
      return {
        titulo: t('objetivo.rout.titulo'),
        detalhe: t('objetivo.rout.detalhe', {
          inimigos: estado.units.filter((u) => u.side === 'enemy' && u.hp > 0).length,
        }),
      };
    case 'seize':
      return {
        titulo: t('objetivo.seize.titulo', { alvo: coordenada(condicao.target) }),
        detalhe: t('objetivo.seize.detalhe'),
      };
    case 'surviveRounds':
      return {
        titulo: t('objetivo.surviveRounds.titulo', { n: condicao.n }),
        detalhe:
          estado.round > condicao.n
            ? t('objetivo.surviveRounds.cumprido')
            : t('objetivo.surviveRounds.detalhe', { faltam: condicao.n - estado.round + 1 }),
      };
    case 'escort':
      // A unidade aparece pelo `unitId`, que é como toda a HUD a chama hoje (iniciativa,
      // recursos, preview). Dar nome às peças é o redesenho (M35), não esta passagem.
      return {
        titulo: t('objetivo.escort.titulo', { unidade: condicao.unitId, alvo: coordenada(condicao.target) }),
        detalhe: t('objetivo.escort.detalhe'),
      };
    case 'defend':
      return {
        titulo: t('objetivo.defend.titulo', { alvo: coordenada(condicao.target), rounds: condicao.rounds }),
        detalhe: t('objetivo.defend.detalhe', { faltam: Math.max(0, condicao.rounds - estado.round + 1) }),
      };
  }
}
