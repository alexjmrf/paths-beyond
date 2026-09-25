import type {
  ActiveEffect,
  BattleState,
  BattleUnit,
  Coord,
  GridMap,
  InitiativeEntry,
  PermadeathMode,
  Side,
  UnitType,
  WinCondition,
} from '@paths-beyond/core';

// M36 2/N (D47) — A REDAÇÃO: o que atravessa a rede quando o inimigo é desconhecido.
//
// **O teorema que obriga este arquivo a existir.** Informação oculta e simulação no cliente não
// coexistem: se o cliente simula o duelo, ele TEM os dados do inimigo, e um editor de memória ou
// um sniffer os lê — o "oculto" seria só uma tela que não mostra. Então o servidor resolve, e o
// que sai daqui é o único retrato do inimigo que existe fora dele.
//
// **A regra, em uma frase:** a unidade do próprio jogador viaja inteira (§1.1 — ele DEVE ler o
// próprio compromisso); a do outro lado vira `UnidadeInimigaVisivel`, e nada mais.
//
// **O que o inimigo mostra, e por quê.** D47 fecha a lista em posição, HP, AP, PP e lugar na
// iniciativa. D48 acrescenta três leituras que a decisão não tinha alcançado:
//
//   - **`hpMax`** — decisão do usuário. Sem o máximo não há barra de HP, e a barra é a leitura de
//     tabuleiro de relance que a HUD do M35 foi desenhada em cima. É o ÚNICO stat que atravessa,
//     e `visaoDoInimigo.test.ts` existe para que "o único" continue verdade.
//   - **`effects`** — decisão do usuário: os ícones de buff/debuff aparecem no inimigo. A maioria
//     veio de skill já revelada ao disparar, e o que sobra é o preço declarado de ver o
//     tabuleiro.
//   - **`hasActedThisRound`** — quem já agiu neste round é a mesma informação que a lista de
//     iniciativa já dá; escondê-la tornaria a lista ilegível sem esconder nada.
//
//   - **`unitType`** — lido na 4/N, pela mesma régua que D48 usou para a arte: identidade é
//     visível, build não é. Ver o campo.
//
// **O que NUNCA atravessa** é o resto do `BattleUnit`: stats, skills conhecidas, script tático,
// script de reação, `moveType`, alcances, TIPO DE ARMA, cooldowns, efeitos de set, gatilhos de
// morte gastos, arquétipo de IA e o `heroId` (que é a instância, e por ela se chega à build).
//
// A `characterId` — quem é a peça, para DESENHAR — continua saindo, por decisão do usuário
// (D48), mas por fora: ela viaja em `characterIdByUnitId` ao lado do estado, como desde M26 3/N,
// e não dentro da unidade. Identidade não é build.

/**
 * A declaração. `visaoDoInimigo.test.ts` confere que as chaves da unidade redigida são
 * exatamente esta lista, e o guarda logo abaixo confere em tempo de COMPILAÇÃO que ela cobre
 * `UnidadeInimigaVisivel` inteira. Acrescentar um campo ao tipo sem acrescentar aqui não compila.
 */
export const CAMPOS_VISIVEIS_DO_INIMIGO = [
  'unitId',
  'side',
  'pos',
  'height',
  'hp',
  'hpMax',
  'ap',
  'pp',
  'hasActedThisRound',
  'effects',
  'unitType',
] as const;
export type CampoVisivelDoInimigo = (typeof CAMPOS_VISIVEIS_DO_INIMIGO)[number];

export interface UnidadeInimigaVisivel {
  readonly unitId: string;
  readonly side: Side;
  readonly pos: Coord;
  readonly height: 0 | 1 | 2 | 3;
  readonly hp: number;
  /** D48 — a exceção declarada: o HP resolvido (`stats.hp`), para a barra existir. */
  readonly hpMax: number;
  readonly ap: number;
  readonly pp: number;
  readonly hasActedThisRound: boolean;
  readonly effects: readonly ActiveEffect[];
  /**
   * D48, lido na 4/N — **identidade é visível, build não é.** `unitType` diz o que a peça É
   * (infantaria, cavalaria, couraçado, voador), e isso a arte já mostra: um cavaleiro montado
   * parece montado. Escondê-lo seria esconder o desenho de si mesmo.
   *
   * `weaponType` NÃO atravessa, e a distinção é a mesma: a arma é EQUIPAMENTO — está na lista de
   * D47 com todas as letras —, e §6.8 faz dela uma vantagem calculável. O que a peça é, o
   * jogador vê; o que ela carrega, ele descobre engajando.
   *
   * Na prática ele também é o que dá PESO à animação (`weightFor`): sem ele, toda peça do outro
   * lado cairia e bateria como infantaria leve.
   */
  readonly unitType: UnitType;
}

// Compila, ou não compila — o mesmo guarda de `CAMPOS_COLETADOS` (M34 1/N).
const _declaracaoCobreTudo: Record<keyof UnidadeInimigaVisivel, true> = {
  unitId: true,
  side: true,
  pos: true,
  height: true,
  hp: true,
  hpMax: true,
  ap: true,
  pp: true,
  hasActedThisRound: true,
  effects: true,
  unitType: true,
} satisfies Record<CampoVisivelDoInimigo, true>;
void _declaracaoCobreTudo;

export type UnidadeVisivel = BattleUnit | UnidadeInimigaVisivel;

/** Quem é a unidade completa: só o `BattleUnit` tem `stats`. */
export function ehVisivelPorInteiro(unidade: UnidadeVisivel): unidade is BattleUnit {
  return 'stats' in unidade;
}

export interface EstadoVisivel {
  readonly map: GridMap;
  readonly units: readonly UnidadeVisivel[];
  readonly initiativeOrder: readonly InitiativeEntry[];
  readonly round: number;
  readonly valor: number;
  readonly outcome: 'ongoing' | 'victory' | 'defeat';
  readonly winCondition: WinCondition;
  readonly permadeath: PermadeathMode;
  /** Só as unidades do próprio lado: é o que o cliente precisa para desenhar o alcance restante. */
  readonly distanceMovedThisTurn: Readonly<Record<string, number>>;
  readonly gateState?: Readonly<Record<string, { readonly opened: boolean; readonly hits: number }>>;
  readonly capturedObjectives?: readonly string[];
}

export function redigirUnidade(unidade: BattleUnit, ladoDoJogador: Side): UnidadeVisivel {
  if (unidade.side === ladoDoJogador) return unidade;
  return {
    unitId: unidade.unitId,
    side: unidade.side,
    pos: unidade.pos,
    height: unidade.height,
    hp: unidade.hp,
    hpMax: unidade.stats.hp,
    ap: unidade.ap,
    pp: unidade.pp,
    hasActedThisRound: unidade.hasActedThisRound,
    effects: unidade.effects,
    unitType: unidade.unitType,
  };
}

/**
 * O retrato do estado para UM lado. `ladoDoJogador` é parâmetro e não constante porque a arena
 * tem dois donos: o mesmo estado, visto do atacante e do defensor, esconde metades diferentes.
 *
 * O que fica de fora do estado — e não só das unidades — importa tanto quanto:
 *   - **`seed`**: o cliente não reproduz nada com ela, e mandá-la seria oferecer a chave de uma
 *     simulação que D47 acabou de tirar dele.
 *   - **`summonBlueprints`**: são `BattleUnit` inteiros, perfis de combate prontos.
 *   - **`effectDefs` / `valorSkills`**: catálogo autorado, que o cliente já tem para desenhar.
 *   - **`freeAssistUsedThisRound`**: bookkeeping de regra; nada na tela o lê.
 */
export function redigirEstado(state: BattleState, ladoDoJogador: Side): EstadoVisivel {
  const meus = new Set(state.units.filter((u) => u.side === ladoDoJogador).map((u) => u.unitId));
  const andados: Record<string, number> = {};
  for (const [unitId, distancia] of Object.entries(state.distanceMovedThisTurn)) {
    if (meus.has(unitId)) andados[unitId] = distancia;
  }

  return {
    map: state.map,
    units: state.units.map((unidade) => redigirUnidade(unidade, ladoDoJogador)),
    initiativeOrder: state.initiativeOrder,
    round: state.round,
    valor: state.valor,
    outcome: state.outcome,
    winCondition: state.winCondition,
    permadeath: state.permadeath,
    distanceMovedThisTurn: andados,
    ...(state.gateState ? { gateState: state.gateState } : {}),
    ...(state.capturedObjectives ? { capturedObjectives: state.capturedObjectives } : {}),
  };
}
